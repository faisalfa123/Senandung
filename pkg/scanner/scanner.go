package scanner

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/faisalfa123/Senandung/pkg/db"
	"github.com/faisalfa123/Senandung/pkg/models"
)

type Scanner struct {
	db       *db.DB
	musicDir string
}

func NewScanner(database *db.DB, musicDir string) *Scanner {
	return &Scanner{
		db:       database,
		musicDir: musicDir,
	}
}

// ScanFolder memindai folder lokal untuk menemukan file audio (mp3, flac, ogg, m4a, wav, opus)
func (s *Scanner) ScanFolder() (int, error) {
	if _, err := os.Stat(s.musicDir); os.IsNotExist(err) {
		return 0, nil
	}

	count := 0
	err := filepath.Walk(s.musicDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		switch ext {
		case ".mp3", ".flac", ".ogg", ".m4a", ".wav", ".opus":
			// Ekstrak nama artis dan judul dari nama file jika belum ada di database
			fileName := strings.TrimSuffix(filepath.Base(path), ext)
			title := fileName
			artist := "Artis Lokal"

			// Cek format umum: "Artis - Judul"
			if strings.Contains(fileName, " - ") {
				parts := strings.SplitN(fileName, " - ", 2)
				artist = strings.TrimSpace(parts[0])
				title = strings.TrimSpace(parts[1])
			}

			// Cek lirik sidecar (.lrc) dengan nama yang sama
			lrcPath := strings.TrimSuffix(path, ext) + ".lrc"
			var lyricsContent string
			if lrcData, err := os.ReadFile(lrcPath); err == nil {
				lyricsContent = string(lrcData)
			}

			songID := fmt.Sprintf("local_%d_%d", info.Size(), info.ModTime().Unix())
			song := &models.Song{
				ID:        songID,
				Title:     title,
				Artist:    artist,
				Album:     "Penyimpanan STB",
				Duration:  180, // Default estimasi durasi jika metadata belum terbaca
				FilePath:  path,
				Source:    "local",
				Lyrics:    lyricsContent,
				CreatedAt: info.ModTime(),
			}

			// Simpan ke DB
			if err := s.db.AddSong(song); err == nil {
				count++
			}
		}
		return nil
	})

	log.Printf("[Scanner] Pemindaian selesai: %d file musik baru terdeteksi di %s", count, s.musicDir)
	return count, err
}
