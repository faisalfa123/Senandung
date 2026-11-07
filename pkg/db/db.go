package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"sync"
	"time"

	"github.com/faisalfa123/Senandung/pkg/models"
	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	db *sql.DB
	mu sync.RWMutex
}

func InitDB(dataDir string) (*DB, error) {
	dbPath := filepath.Join(dataDir, "senandung.db")
	conn, err := sql.Open("sqlite3", dbPath+"?_busy_timeout=5000&_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// Buat skema tabel jika belum ada
	schema := `
	CREATE TABLE IF NOT EXISTS songs (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		artist TEXT,
		album TEXT,
		duration REAL,
		file_path TEXT NOT NULL,
		cover_url TEXT,
		source TEXT,
		youtube_url TEXT,
		lyrics TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS playlists (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		song_ids TEXT DEFAULT '[]',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS favorites (
		song_id TEXT PRIMARY KEY,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	if _, err := conn.Exec(schema); err != nil {
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	return &DB{db: conn}, nil
}

func (d *DB) Close() error {
	return d.db.Close()
}

func (d *DB) AddSong(s *models.Song) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `INSERT OR REPLACE INTO songs 
		(id, title, artist, album, duration, file_path, cover_url, source, youtube_url, lyrics, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := d.db.Exec(query, s.ID, s.Title, s.Artist, s.Album, s.Duration, s.FilePath, s.CoverURL, s.Source, s.YoutubeURL, s.Lyrics, s.CreatedAt)
	return err
}

func (d *DB) GetSong(id string) (*models.Song, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var s models.Song
	query := `SELECT id, title, artist, album, duration, file_path, cover_url, source, youtube_url, lyrics, created_at 
		FROM songs WHERE id = ?`
	row := d.db.QueryRow(query, id)
	var createdAtStr string
	err := row.Scan(&s.ID, &s.Title, &s.Artist, &s.Album, &s.Duration, &s.FilePath, &s.CoverURL, &s.Source, &s.YoutubeURL, &s.Lyrics, &createdAtStr)
	if err != nil {
		return nil, err
	}
	s.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
	return &s, nil
}

func (d *DB) GetAllSongs() ([]models.Song, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	query := `SELECT id, title, artist, album, duration, file_path, cover_url, source, youtube_url, lyrics, created_at 
		FROM songs ORDER BY created_at DESC`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	songs := []models.Song{}
	for rows.Next() {
		var s models.Song
		var createdAtStr string
		if err := rows.Scan(&s.ID, &s.Title, &s.Artist, &s.Album, &s.Duration, &s.FilePath, &s.CoverURL, &s.Source, &s.YoutubeURL, &s.Lyrics, &createdAtStr); err == nil {
			s.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
			songs = append(songs, s)
		}
	}
	return songs, nil
}

func (d *DB) DeleteSong(id string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec(`DELETE FROM songs WHERE id = ?`, id)
	_, _ = d.db.Exec(`DELETE FROM favorites WHERE song_id = ?`, id)
	return err
}

func (d *DB) ToggleFavorite(songID string) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	var exists int
	_ = d.db.QueryRow(`SELECT 1 FROM favorites WHERE song_id = ?`, songID).Scan(&exists)
	if exists == 1 {
		_, err := d.db.Exec(`DELETE FROM favorites WHERE song_id = ?`, songID)
		return false, err
	}
	_, err := d.db.Exec(`INSERT INTO favorites (song_id) VALUES (?)`, songID)
	return true, err
}

func (d *DB) GetFavorites() ([]string, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query(`SELECT song_id FROM favorites ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var favs []string
	for rows.Next() {
		var sid string
		if err := rows.Scan(&sid); err == nil {
			favs = append(favs, sid)
		}
	}
	return favs, nil
}

func (d *DB) CreatePlaylist(name string) (*models.Playlist, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	p := &models.Playlist{
		ID:        fmt.Sprintf("pl_%d", time.Now().UnixNano()),
		Name:      name,
		SongIDs:   []string{},
		CreatedAt: time.Now(),
	}
	_, err := d.db.Exec(`INSERT INTO playlists (id, name, song_ids, created_at) VALUES (?, ?, '[]', ?)`, p.ID, p.Name, p.CreatedAt)
	return p, err
}

func (d *DB) GetPlaylists() ([]models.Playlist, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	rows, err := d.db.Query(`SELECT id, name, song_ids, created_at FROM playlists ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var playlists []models.Playlist
	for rows.Next() {
		var p models.Playlist
		var songIDsJSON string
		var createdAtStr string
		if err := rows.Scan(&p.ID, &p.Name, &songIDsJSON, &createdAtStr); err == nil {
			_ = json.Unmarshal([]byte(songIDsJSON), &p.SongIDs)
			p.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
			playlists = append(playlists, p)
		}
	}
	return playlists, nil
}

func (d *DB) UpdatePlaylistSongs(playlistID string, songIDs []string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	data, err := json.Marshal(songIDs)
	if err != nil {
		return err
	}
	_, err = d.db.Exec(`UPDATE playlists SET song_ids = ? WHERE id = ?`, string(data), playlistID)
	return err
}

func (d *DB) DeletePlaylist(playlistID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	_, err := d.db.Exec(`DELETE FROM playlists WHERE id = ?`, playlistID)
	return err
}

func (d *DB) UpdateLyrics(songID, lyrics string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	log.Printf("[DB] Updating lyrics for song %s (len: %d)", songID, len(lyrics))
	_, err := d.db.Exec(`UPDATE songs SET lyrics = ? WHERE id = ?`, lyrics, songID)
	return err
}
