package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/faisalfa123/Senandung/pkg/db"
	"github.com/faisalfa123/Senandung/pkg/downloader"
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

	// Downloader & Scanner
	mux.HandleFunc("/api/search", s.handleSearchLive)
	mux.HandleFunc("/api/download", s.handleDownload)
	mux.HandleFunc("/api/download/status", s.handleDownloadStatus)
	mux.HandleFunc("/api/scan", s.handleScan)

	// WebSockets Audio Sync
	mux.HandleFunc("/ws/sync", s.syncHub.HandleWebSocket)
}

func (s *Server) handleSongs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	songs, err := s.db.GetAllSongs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
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

	case http.MethodPut: // Update lirik / metadata
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
		Query  string `json:"query"`
		Format string `json:"format"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Query) == "" {
		http.Error(w, "Invalid query", http.StatusBadRequest)
		return
	}

	job := s.downloader.AddJob(req.Query, req.Format)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(job)
}

func (s *Server) handleDownloadStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	jobs := s.downloader.GetJobs()
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

