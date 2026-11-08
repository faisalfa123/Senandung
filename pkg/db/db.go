package db

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/faisalfa123/Senandung/pkg/models"
)

type dbState struct {
	Songs     map[string]models.Song     `json:"songs"`
	Playlists map[string]models.Playlist `json:"playlists"`
	Favorites map[string]time.Time       `json:"favorites"`
}

type DB struct {
	filePath string
	state    dbState
	mu       sync.RWMutex
}

// InitDB menginisialisasi penyimpanan database berbasis JSON murni (Pure Go, 0% CGO, 100% kompatibel cross-compile aarch64/armv7l/x86_64)
func InitDB(dataDir string) (*DB, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("gagal membuat direktori data: %w", err)
	}

	dbPath := filepath.Join(dataDir, "senandung_store.json")
	d := &DB{
		filePath: dbPath,
		state: dbState{
			Songs:     make(map[string]models.Song),
			Playlists: make(map[string]models.Playlist),
			Favorites: make(map[string]time.Time),
		},
	}

	// Muat data jika file sudah ada
	if raw, err := os.ReadFile(dbPath); err == nil && len(raw) > 0 {
		_ = json.Unmarshal(raw, &d.state)
		if d.state.Songs == nil {
			d.state.Songs = make(map[string]models.Song)
		}
		if d.state.Playlists == nil {
			d.state.Playlists = make(map[string]models.Playlist)
		}
		if d.state.Favorites == nil {
			d.state.Favorites = make(map[string]time.Time)
		}
	} else {
		_ = d.saveLocked()
	}

	return d, nil
}

func (d *DB) saveLocked() error {
	raw, err := json.MarshalIndent(d.state, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := d.filePath + ".tmp"
	if err := os.WriteFile(tmpPath, raw, 0644); err != nil {
		return err
	}
	return os.Rename(tmpPath, d.filePath)
}

func (d *DB) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.saveLocked()
}

func (d *DB) AddSong(s *models.Song) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now()
	}
	// Deduplikasi berdasarkan FilePath fisik agar tidak ada 2 entri untuk 1 file yang sama
	if s.FilePath != "" {
		for existingID, existingSong := range d.state.Songs {
			if existingSong.FilePath == s.FilePath && existingID != s.ID {
				delete(d.state.Songs, existingID)
			}
		}
	}
	d.state.Songs[s.ID] = *s
	return d.saveLocked()
}

func (d *DB) HasFilePath(filePath string) bool {
	d.mu.RLock()
	defer d.mu.RUnlock()

	for _, s := range d.state.Songs {
		if s.FilePath == filePath {
			return true
		}
	}
	return false
}

func (d *DB) GetSong(id string) (*models.Song, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	s, ok := d.state.Songs[id]
	if !ok {
		return nil, fmt.Errorf("song not found: %s", id)
	}
	return &s, nil
}

func (d *DB) GetAllSongs() ([]models.Song, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	songs := make([]models.Song, 0, len(d.state.Songs))
	for _, s := range d.state.Songs {
		// Verifikasi file fisik benar-benar ada di disk
		if s.FilePath != "" {
			if _, err := os.Stat(s.FilePath); os.IsNotExist(err) {
				continue
			}
		}
		// Bersihkan akhiran [videoId] jika ada (cth [CTkdmwOYUpg])
		if idx := strings.LastIndex(s.Title, " ["); idx != -1 && strings.HasSuffix(s.Title, "]") {
			s.Title = strings.TrimSpace(s.Title[:idx])
		}
		songs = append(songs, s)
	}

	sort.Slice(songs, func(i, j int) bool {
		return songs[i].CreatedAt.After(songs[j].CreatedAt)
	})

	return songs, nil
}

func (d *DB) DeleteSong(id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	delete(d.state.Songs, id)
	delete(d.state.Favorites, id)
	return d.saveLocked()
}

func (d *DB) ToggleFavorite(songID string) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if _, exists := d.state.Favorites[songID]; exists {
		delete(d.state.Favorites, songID)
		_ = d.saveLocked()
		return false, nil
	}
	d.state.Favorites[songID] = time.Now()
	_ = d.saveLocked()
	return true, nil
}

func (d *DB) GetFavorites() ([]string, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	favs := make([]string, 0, len(d.state.Favorites))
	for sid := range d.state.Favorites {
		favs = append(favs, sid)
	}
	return favs, nil
}

func (d *DB) CreatePlaylist(name string) (*models.Playlist, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	p := models.Playlist{
		ID:        fmt.Sprintf("pl_%d", time.Now().UnixNano()),
		Name:      name,
		SongIDs:   []string{},
		CreatedAt: time.Now(),
	}
	d.state.Playlists[p.ID] = p
	_ = d.saveLocked()
	return &p, nil
}

func (d *DB) GetPlaylists() ([]models.Playlist, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	playlists := make([]models.Playlist, 0, len(d.state.Playlists))
	for _, p := range d.state.Playlists {
		playlists = append(playlists, p)
	}
	sort.Slice(playlists, func(i, j int) bool {
		return playlists[i].CreatedAt.After(playlists[j].CreatedAt)
	})
	return playlists, nil
}

func (d *DB) UpdatePlaylistSongs(playlistID string, songIDs []string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if p, ok := d.state.Playlists[playlistID]; ok {
		p.SongIDs = songIDs
		d.state.Playlists[playlistID] = p
		return d.saveLocked()
	}
	return fmt.Errorf("playlist not found")
}

func (d *DB) DeletePlaylist(playlistID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	delete(d.state.Playlists, playlistID)
	return d.saveLocked()
}

func (d *DB) UpdateLyrics(songID, lyrics string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if s, ok := d.state.Songs[songID]; ok {
		log.Printf("[DB] Updating lyrics for song %s (len: %d)", songID, len(lyrics))
		s.Lyrics = lyrics
		d.state.Songs[songID] = s
		return d.saveLocked()
	}
	return fmt.Errorf("song not found")
}
