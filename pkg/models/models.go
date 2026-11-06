package models

import "time"

// Song merepresentasikan metadata trek musik
type Song struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Artist      string    `json:"artist"`
	Album       string    `json:"album"`
	Duration    float64   `json:"duration"` // durasi dalam detik
	FilePath    string    `json:"file_path"`
	CoverURL    string    `json:"cover_url"`
	Source      string    `json:"source"`   // "local" atau "youtube"
	YoutubeURL  string    `json:"youtube_url,omitempty"`
	Lyrics      string    `json:"lyrics,omitempty"` // format LRC atau plain text
	CreatedAt   time.Time `json:"created_at"`
}

// Playlist merepresentasikan daftar putar buatan pengguna
type Playlist struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	SongIDs   []string  `json:"song_ids"`
	CreatedAt time.Time `json:"created_at"`
}

// DownloadJob status antrean unduhan dari YouTube
type DownloadJob struct {
	ID          string `json:"id"`
	Query       string `json:"query"` // URL atau kata kunci
	Title       string `json:"title"`
	Status      string `json:"status"` // "pending", "downloading", "completed", "failed"
	Progress    string `json:"progress"`
	Error       string `json:"error,omitempty"`
	DownloadedSongID string `json:"downloaded_song_id,omitempty"`
}

// SyncState status room sinkronisasi Web Audio
type SyncState struct {
	RoomID       string    `json:"room_id"`
	CurrentSong  *Song     `json:"current_song,omitempty"`
	IsPlaying    bool      `json:"is_playing"`
	PositionSec  float64   `json:"position_sec"`
	ServerTimeMs int64     `json:"server_time_ms"` // Epoch time server dalam milidetik
	LeaderID     string    `json:"leader_id"`
	Listeners    int       `json:"listeners"`
}
