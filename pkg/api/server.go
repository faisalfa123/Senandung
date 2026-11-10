package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/faisalfa123/Senandung/pkg/db"
	"github.com/faisalfa123/Senandung/pkg/downloader"
	"github.com/faisalfa123/Senandung/pkg/models"
	"github.com/faisalfa123/Senandung/pkg/scanner"
	"github.com/faisalfa123/Senandung/pkg/searcher"
	synchub "github.com/faisalfa123/Senandung/pkg/sync"
)

type Server struct {
	db         *db.DB
	downloader *downloader.Queue
	scanner    *scanner.Scanner
	syncHub    *synchub.Hub
	musicDir   string
	coverDir   string
}

func NewServer(database *db.DB, dl *downloader.Queue, sc *scanner.Scanner, hub *synchub.Hub, musicDir, coverDir string) *Server {
	return &Server{
		db:         database,
		downloader: dl,
		scanner:    sc,
		syncHub:    hub,
		musicDir:   musicDir,
		coverDir:   coverDir,
	}
}

func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	// Songs API
	mux.HandleFunc("/api/songs", s.handleSongs)
	mux.HandleFunc("/api/songs/", s.handleSongByID)
	mux.HandleFunc("/api/stream/", s.handleStream)
	mux.HandleFunc("/api/covers/", s.handleCover)

	// Favorites & Playlists
	mux.HandleFunc("/api/favorites", s.handleFavorites)
	mux.HandleFunc("/api/playlists", s.handlePlaylists)
	mux.HandleFunc("/api/playlists/", s.handlePlaylistByID)

	// Downloader, Lyrics & Scanner
	mux.HandleFunc("/api/search", s.handleSearchLive)
	mux.HandleFunc("/api/lyrics", s.handleLyrics)
	mux.HandleFunc("/api/download", s.handleDownload)
	mux.HandleFunc("/api/download/status", s.handleDownloadStatus)
	mux.HandleFunc("/api/scan", s.handleScan)

	// Real Linux STB System Information
	mux.HandleFunc("/api/sysinfo", s.handleSysInfo)

	// WebSockets Audio Sync & Multi-Room Party API
	mux.HandleFunc("/api/rooms", s.syncHub.HandleGetRooms)
	mux.HandleFunc("/ws/sync", s.syncHub.HandleWebSocket)
}

func (s *Server) handleSongs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	songs, err := s.db.GetAllSongs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if songs == nil {
		songs = []models.Song{}
	}
	_ = json.NewEncoder(w).Encode(songs)
}

func (s *Server) handleSongByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/songs/")
	if id == "" {
		http.Error(w, "Song ID required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		song, err := s.db.GetSong(id)
		if err != nil {
			http.Error(w, "Song not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(song)

	case http.MethodPut:
		var update struct {
			Lyrics string `json:"lyrics"`
		}
		if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = s.db.UpdateLyrics(id, update.Lyrics)
		w.WriteHeader(http.StatusOK)

	case http.MethodDelete:
		song, err := s.db.GetSong(id)
		if err == nil && song.FilePath != "" {
			_ = os.Remove(song.FilePath)
		}
		_ = s.db.DeleteSong(id)
		w.WriteHeader(http.StatusOK)
	}
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/stream/")
	song, err := s.db.GetSong(id)
	if err != nil || song.FilePath == "" {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	bitrate := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("bitrate")))
	// If a specific compressed bitrate is requested (64k, 128k, 320k), transcode dynamically on-the-fly
	if bitrate != "" && bitrate != "lossless" && bitrate != "original" && bitrate != "auto" {
		bRate := "128k"
		if bitrate == "64k" || bitrate == "64" {
			bRate = "64k"
		} else if bitrate == "128k" || bitrate == "128" {
			bRate = "128k"
		} else if bitrate == "320k" || bitrate == "320" {
			bRate = "320k"
		}

		ffmpegBin, errFF := exec.LookPath("ffmpeg")
		if errFF == nil {
			var cmdArgs []string
			var execName string

			niceBin, errNice := exec.LookPath("nice")
			if errNice == nil {
				execName = niceBin
				cmdArgs = append(cmdArgs, "-n", "19", ffmpegBin)
			} else {
				execName = ffmpegBin
			}

			cmdArgs = append(cmdArgs, "-nostdin", "-v", "error")
			if ss := r.URL.Query().Get("ss"); ss != "" {
				cmdArgs = append(cmdArgs, "-ss", ss)
			}
			cmdArgs = append(cmdArgs, "-i", song.FilePath, "-vn", "-c:a", "libmp3lame", "-b:a", bRate, "-f", "mp3", "pipe:1")

			cmd := exec.CommandContext(r.Context(), execName, cmdArgs...)
			w.Header().Set("Content-Type", "audio/mpeg")
			w.Header().Set("Cache-Control", "no-cache, no-store")
			w.Header().Set("X-Transcoded-Bitrate", bRate)

			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
			cmd.Stdout = w
			cmd.Stderr = os.Stderr
			_ = cmd.Run()
			return
		}
	}

	f, err := os.Open(song.FilePath)
	if err != nil {
		http.Error(w, "Error opening audio file", http.StatusInternalServerError)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		http.Error(w, "Error reading file stat", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Accept-Ranges", "bytes")
	ext := strings.ToLower(filepath.Ext(song.FilePath))
	switch ext {
	case ".mp3":
		w.Header().Set("Content-Type", "audio/mpeg")
	case ".ogg", ".opus":
		w.Header().Set("Content-Type", "audio/ogg")
	case ".m4a":
		w.Header().Set("Content-Type", "audio/mp4")
	case ".flac":
		w.Header().Set("Content-Type", "audio/flac")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	http.ServeContent(w, r, filepath.Base(song.FilePath), stat.ModTime(), f)
}

func (s *Server) handleCover(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/covers/")
	coverPath := filepath.Join(s.coverDir, name)
	if _, err := os.Stat(coverPath); os.IsNotExist(err) {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, coverPath)
}

func (s *Server) handleFavorites(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		favs, err := s.db.GetFavorites()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(favs)

	case http.MethodPost:
		var req struct {
			SongID string `json:"song_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		isFav, err := s.db.ToggleFavorite(req.SongID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"is_favorite": isFav})
	}
}

func (s *Server) handlePlaylists(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		playlists, err := s.db.GetPlaylists()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(playlists)

	case http.MethodPost:
		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		p, err := s.db.CreatePlaylist(req.Name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(p)
	}
}

func (s *Server) handlePlaylistByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/playlists/")
	switch r.Method {
	case http.MethodPut:
		var req struct {
			SongIDs []string `json:"song_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		_ = s.db.UpdatePlaylistSongs(id, req.SongIDs)
		w.WriteHeader(http.StatusOK)

	case http.MethodDelete:
		_ = s.db.DeletePlaylist(id)
		w.WriteHeader(http.StatusOK)
	}
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Query   string `json:"query"`
		VideoID string `json:"video_id"`
		Title   string `json:"title"`
		Format  string `json:"format"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	queryOrID := strings.TrimSpace(req.VideoID)
	if queryOrID == "" {
		queryOrID = strings.TrimSpace(req.Query)
	}
	if queryOrID == "" {
		http.Error(w, "Invalid query", http.StatusBadRequest)
		return
	}
	displayTitle := strings.TrimSpace(req.Title)
	if displayTitle == "" {
		displayTitle = strings.TrimSpace(req.Query)
	}

	job := s.downloader.AddJobWithTitle(queryOrID, displayTitle, req.Format)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(job)
}

func (s *Server) handleDownloadStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	jobs := s.downloader.GetJobs()
	if jobs == nil {
		jobs = []*models.DownloadJob{}
	}
	_ = json.NewEncoder(w).Encode(jobs)
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	count, err := s.scanner.ScanFolder()
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "success", "new_songs": count})
}

func (s *Server) handleSearchLive(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	w.Header().Set("Content-Type", "application/json")
	if q == "" {
		_ = json.NewEncoder(w).Encode([]searcher.SearchResult{})
		return
	}

	results, err := searcher.SearchYouTube(q)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(results)
}

func cleanSongTitle(raw string) string {
	t := raw
	// 1. Remove bracketed 11-char videoId like [CTkdmwOYUpg]
	reVid := regexp.MustCompile(`\[[a-zA-Z0-9_-]{11}\]`)
	t = reVid.ReplaceAllString(t, "")

	// 2. Remove pipes and anything after: "Rasa Yang Tertinggal | Official Lyric Video" -> "Rasa Yang Tertinggal"
	if idx := strings.Index(t, "|"); idx != -1 {
		t = t[:idx]
	}

	// 3. Remove parenthesis / brackets containing video/music metadata
	reMetaA := regexp.MustCompile(`(?i)\([^)]*(?:official|video|lirik|lyrics|audio|mv|remastered|clip|music)[^)]*\)`)
	t = reMetaA.ReplaceAllString(t, "")
	reMetaB := regexp.MustCompile(`(?i)\[[^\]]*(?:official|video|lirik|lyrics|audio|mv|remastered|clip|music)[^\]]*\]`)
	t = reMetaB.ReplaceAllString(t, "")

	// 4. Remove trailing dash or spaces
	t = strings.TrimSpace(t)
	t = strings.TrimRight(t, "- ")
	return strings.TrimSpace(t)
}

func (s *Server) handleLyrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	rawTitle := strings.TrimSpace(r.URL.Query().Get("title"))
	artist := strings.TrimSpace(r.URL.Query().Get("artist"))
	if artist == "Koleksi STB" || artist == "Artis Lokal" || artist == "Unduhan YouTube" {
		artist = ""
	}

	cleanTitle := cleanSongTitle(rawTitle)

	type LyricsResponse struct {
		Found        bool   `json:"found"`
		SyncedLyrics string `json:"synced_lyrics"`
		PlainLyrics  string `json:"plain_lyrics"`
		TrackName    string `json:"track_name,omitempty"`
		ArtistName   string `json:"artist_name,omitempty"`
	}

	if cleanTitle == "" {
		_ = json.NewEncoder(w).Encode(LyricsResponse{Found: false})
		return
	}

	client := &http.Client{Timeout: 6 * time.Second}

	// Buat daftar query pencarian bertingkat (fallback cascade)
	queries := []string{}
	if artist != "" {
		queries = append(queries, cleanTitle+" "+artist)
	}
	queries = append(queries, cleanTitle)
	if rawTitle != cleanTitle {
		queries = append(queries, rawTitle)
	}

	for _, q := range queries {
		reqURL := "https://lrclib.net/api/search?q=" + url.QueryEscape(q)
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, reqURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Senandung-HiRes-Player/2.0")

		resp, err := client.Do(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			if resp != nil {
				resp.Body.Close()
			}
			continue
		}

		var items []map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&items)
		resp.Body.Close()

		if err == nil && len(items) > 0 {
			for _, item := range items {
				synced, _ := item["syncedLyrics"].(string)
				plain, _ := item["plainLyrics"].(string)
				tName, _ := item["trackName"].(string)
				aName, _ := item["artistName"].(string)

				if synced != "" || plain != "" {
					_ = json.NewEncoder(w).Encode(LyricsResponse{
						Found:        true,
						SyncedLyrics: synced,
						PlainLyrics:  plain,
						TrackName:    tName,
						ArtistName:   aName,
					})
					return
				}
			}
		}
	}

	_ = json.NewEncoder(w).Encode(LyricsResponse{Found: false})
}

func (s *Server) handleSysInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	type SysInfo struct {
		TotalRAMMB  uint64  `json:"total_ram_mb"`
		UsedRAMMB   uint64  `json:"used_ram_mb"`
		FreeRAMMB   uint64  `json:"free_ram_mb"`
		DiskTotalGB float64 `json:"disk_total_gb"`
		DiskFreeGB  float64 `json:"disk_free_gb"`
		DiskUsedGB  float64 `json:"disk_used_gb"`
		DiskPath    string  `json:"disk_path"`
	}

	info := &SysInfo{DiskPath: s.musicDir}
	var si syscall.Sysinfo_t
	if err := syscall.Sysinfo(&si); err == nil {
		info.TotalRAMMB = (uint64(si.Totalram) * uint64(si.Unit)) / (1024 * 1024)
		info.FreeRAMMB = (uint64(si.Freeram) * uint64(si.Unit)) / (1024 * 1024)
		info.UsedRAMMB = info.TotalRAMMB - info.FreeRAMMB
	}

	checkPath := s.musicDir
	if _, err := os.Stat(checkPath); err != nil {
		checkPath = "/"
	}
	var st syscall.Statfs_t
	if err := syscall.Statfs(checkPath, &st); err == nil {
		totalBytes := st.Blocks * uint64(st.Bsize)
		freeBytes := st.Bavail * uint64(st.Bsize)
		info.DiskTotalGB = float64(totalBytes) / (1024 * 1024 * 1024)
		info.DiskFreeGB = float64(freeBytes) / (1024 * 1024 * 1024)
		info.DiskUsedGB = info.DiskTotalGB - info.DiskFreeGB
	}

	_ = json.NewEncoder(w).Encode(info)
}
