package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"github.com/faisalfa123/Senandung/pkg/api"
	"github.com/faisalfa123/Senandung/pkg/db"
	"github.com/faisalfa123/Senandung/pkg/downloader"
	"github.com/faisalfa123/Senandung/pkg/scanner"
	synchub "github.com/faisalfa123/Senandung/pkg/sync"
)

// Embed seluruh direktori web statis PWA langsung ke dalam binary Go
//go:embed web/*
var webFS embed.FS

const AppVersion = "v0.1.0-beta"

func main() {
	port := flag.Int("port", 8989, "Port server Senandung")
	dataDir := flag.String("data-dir", "./data", "Direktori penyimpanan database, cover, dan riwayat")
	musicDir := flag.String("music-dir", "./data/music", "Direktori file audio lagu")
	flag.Parse()

	log.Printf("=====================================================")
	log.Printf(" 🎵 SENANDUNG %s - Spotify-like PWA            ", AppVersion)
	log.Printf(" Multi-Device Audio Sync | Safe yt-dlp | Offline Mode ")
	log.Printf(" Target: Odroid C2 / STB HG680P (Amlogic S905X) DietPi")
	log.Printf("=====================================================")

	// Muat konfigurasi dari /etc/senandung/senandung.conf jika ada
	loadEnvConfig(port, dataDir, musicDir)

	if err := os.MkdirAll(*dataDir, 0755); err != nil {
		log.Fatalf("Gagal membuat direktori data: %v", err)
	}
	if err := os.MkdirAll(*musicDir, 0755); err != nil {
		log.Fatalf("Gagal membuat direktori musik: %v", err)
	}
	log.Printf("[Senandung] Storage Musik Fisik: %s", *musicDir)

	coverDir := filepath.Join(*dataDir, "covers")
	_ = os.MkdirAll(coverDir, 0755)

	// Inisialisasi Database SQLite
	database, err := db.InitDB(*dataDir)
	if err != nil {
		log.Fatalf("Gagal inisialisasi SQLite database: %v", err)
	}
	defer database.Close()

	// Inisialisasi WebSocket Hub untuk sinkronisasi audio antar perangkat
	syncHub := synchub.NewHub()
	go syncHub.Run()

	// Inisialisasi Downloader antrean YouTube yt-dlp
	dlQueue := downloader.NewQueue(database, *musicDir, coverDir)

	// Inisialisasi Scanner Folder Musik Lokal STB
	musicScanner := scanner.NewScanner(database, *musicDir)

	// Otomatis pindai folder musik saat startup pertama kali
	go func() {
		_, _ = musicScanner.ScanFolder()
	}()

	// Inisialisasi REST API Server
	apiServer := api.NewServer(database, dlQueue, musicScanner, syncHub, *musicDir, coverDir)
	mux := http.NewServeMux()
	apiServer.RegisterRoutes(mux)

	// Static Web PWA Assets: Cek direktori web lokal di disk terlebih dahulu agar update file web langsung aktif seketika
	var staticFS http.FileSystem
	candidates := []string{"./web", "/opt/senandung/web", "web"}
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			staticFS = http.Dir(c)
			log.Printf("[Senandung] Menggunakan file web langsung dari disk: %s", c)
			break
		}
	}
	if staticFS == nil {
		subFS, err := fs.Sub(webFS, "web")
		if err != nil {
			log.Fatalf("Gagal memuat embedded filesystem: %v", err)
		}
		staticFS = http.FS(subFS)
		log.Printf("[Senandung] Menggunakan embedded web assets bawaan binary")
	}

	// Sajikan static web dengan header Cache-Control no-cache agar browser HP tidak menyimpan cache lama
	fileServer := http.FileServer(staticFS)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fileServer.ServeHTTP(w, r)
	})

	serverAddr := fmt.Sprintf("0.0.0.0:%d", *port)
	server := &http.Server{
		Addr:    serverAddr,
		Handler: corsMiddleware(mux),
	}

	// Tangani shutdown anggun (Graceful shutdown)
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[Senandung] Server aktif dan mendengarkan di http://0.0.0.0:%d", *port)
		log.Printf("[Senandung] PWA siap diakses dari HP atau browser LAN")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stopChan
	log.Printf("[Senandung] Mematikan server secara aman...")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Range, Content-Type, Authorization, Accept, X-Requested-With")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, X-Transcoded-Bitrate")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func loadEnvConfig(port *int, dataDir, musicDir *string) {
	paths := []string{"/etc/senandung/senandung.conf", "./senandung.conf"}
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			k := strings.TrimSpace(parts[0])
			v := strings.Trim(strings.TrimSpace(parts[1]), "\"")
			switch k {
			case "PORT":
				if val, err := strconv.Atoi(v); err == nil && *port == 8989 {
					*port = val
				}
			case "DATA_DIR":
				if *dataDir == "./data" && v != "" {
					*dataDir = v
				}
			case "MUSIC_DIR":
				if *musicDir == "./data/music" && v != "" {
					*musicDir = v
				}
			}
		}
		log.Printf("[Senandung] Konfigurasi dimuat dari file: %s", p)
		break
	}
}
