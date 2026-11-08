package sync

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/faisalfa123/Senandung/pkg/models"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Perbolehkan origin dari mana saja di LAN lokal
	},
}

type Client struct {
	hub        *Hub
	conn       *websocket.Conn
	send       chan []byte
	roomID     string
	clientID   string
	deviceName string
}

type RoomInfo struct {
	ID          string       `json:"id"`
	Listeners   int          `json:"listeners"`
	IsPlaying   bool         `json:"is_playing"`
	CurrentSong *models.Song `json:"current_song,omitempty"`
	Members     []string     `json:"members"`
	QueueCount  int          `json:"queue_count"`
}

type Message struct {
	Action          string        `json:"action"` // "join", "ping", "pong", "play", "pause", "seek", "track_change", "sync_state", "reaction", "room_list", "queue_add", "queue_remove", "queue_reorder", "queue_play", "queue_next", "restore_queue", "dismiss_recovery", "room_first_entry"
	RoomID          string        `json:"room_id,omitempty"`
	ClientTimeMs    int64         `json:"client_time_ms,omitempty"`
	ServerTimeMs    int64         `json:"server_time_ms,omitempty"`
	ScheduledAtMs   int64         `json:"scheduled_at_ms,omitempty"`
	PositionSec     float64       `json:"position_sec,omitempty"`
	IsPlaying       bool          `json:"is_playing,omitempty"`
	Song            *models.Song  `json:"song,omitempty"`
	Queue           []models.Song `json:"queue,omitempty"`
	SavedSongsCount int           `json:"saved_songs_count,omitempty"`
	TargetIndex     int           `json:"target_index,omitempty"`
	IndexFrom       int           `json:"index_from,omitempty"`
	IndexTo         int           `json:"index_to,omitempty"`
	Listeners       int           `json:"listeners,omitempty"`
	Members         []string      `json:"members,omitempty"`
	Emoji           string        `json:"emoji,omitempty"`
	Rooms           []RoomInfo    `json:"rooms,omitempty"`
}

type RoomSnapshot struct {
	Queue       []models.Song
	CurrentSong *models.Song
	SavedAt     time.Time
}

type Room struct {
	ID           string
	CurrentSong  *models.Song
	IsPlaying    bool
	PositionSec  float64
	LastUpdateMs int64
	LeaderID     string
	Queue        []models.Song
	Clients      map[*Client]bool
	mu           sync.RWMutex
}

type Hub struct {
	rooms      map[string]*Room
	savedRooms map[string]*RoomSnapshot // Snapshot antrean saat room kosong
	roomsMu    sync.RWMutex
	register   chan *Client
	unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		savedRooms: make(map[string]*RoomSnapshot),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			h.roomsMu.RLock()
			var activeRooms []string
			for id, room := range h.rooms {
				room.mu.RLock()
				if room.IsPlaying && len(room.Clients) > 0 {
					activeRooms = append(activeRooms, id)
				}
				room.mu.RUnlock()
			}
			h.roomsMu.RUnlock()

			for _, id := range activeRooms {
				h.broadcastRoomState(id)
			}

		case client := <-h.register:
			h.roomsMu.Lock()
			room, exists := h.rooms[client.roomID]
			isFirstUser := false

			if !exists {
				isFirstUser = true
				room = &Room{
					ID:           client.roomID,
					Clients:      make(map[*Client]bool),
					Queue:        make([]models.Song, 0),
					LastUpdateMs: time.Now().UnixMilli(),
				}
				h.rooms[client.roomID] = room
			} else {
				room.mu.RLock()
				if len(room.Clients) == 0 {
					isFirstUser = true
				}
				room.mu.RUnlock()
			}

			room.mu.Lock()
			room.Clients[client] = true
			if room.LeaderID == "" {
				room.LeaderID = client.clientID
			}
			listenerCount := len(room.Clients)
			room.mu.Unlock()

			// Cek apakah ada snapshot riwayat playlist untuk pengguna pertama
			var savedSnap *RoomSnapshot
			if isFirstUser {
				if snap, ok := h.savedRooms[client.roomID]; ok && len(snap.Queue) > 0 {
					savedSnap = snap
				}
			}
			h.roomsMu.Unlock()

			// Broadcast status room ke semua listener
			h.broadcastRoomState(client.roomID)

			// Kirim notifikasi pemulihan jika pengguna pertama masuk ke room kosong dengan snapshot
			if savedSnap != nil {
				promptMsg := Message{
					Action:          "room_first_entry",
					RoomID:          client.roomID,
					SavedSongsCount: len(savedSnap.Queue),
					ServerTimeMs:    time.Now().UnixMilli(),
				}
				if data, err := json.Marshal(promptMsg); err == nil {
					select {
					case client.send <- data:
					default:
					}
				}
			}

			log.Printf("[SyncHub] Klien %s (%s) bergabung ke room '%s' (Total listener: %d, First: %v)", client.clientID, client.deviceName, client.roomID, listenerCount, isFirstUser)

		case client := <-h.unregister:
			h.roomsMu.Lock()
			if room, exists := h.rooms[client.roomID]; exists {
				room.mu.Lock()
				delete(room.Clients, client)
				close(client.send)
				if room.LeaderID == client.clientID {
					// Berikan kepemimpinan room ke klien berikutnya jika ada
					for nextClient := range room.Clients {
						room.LeaderID = nextClient.clientID
						break
					}
				}
				clientCount := len(room.Clients)

				if clientCount == 0 {
					// Simpan snapshot playlist saat room ditinggalkan semua orang
					if len(room.Queue) > 0 || room.CurrentSong != nil {
						qCopy := make([]models.Song, len(room.Queue))
						copy(qCopy, room.Queue)
						h.savedRooms[client.roomID] = &RoomSnapshot{
							Queue:       qCopy,
							CurrentSong: room.CurrentSong,
							SavedAt:     time.Now(),
						}
						log.Printf("[SyncHub] Room '%s' kosong. Snapshot %d lagu disimpan.", client.roomID, len(qCopy))
					}
					// Kosongkan playlist aktif di room
					room.Queue = make([]models.Song, 0)
					room.CurrentSong = nil
					room.IsPlaying = false
					room.PositionSec = 0
				}
				room.mu.Unlock()

				if clientCount > 0 {
					h.broadcastRoomState(client.roomID)
				}
			}
			h.roomsMu.Unlock()
			log.Printf("[SyncHub] Klien %s meninggalkan room '%s'", client.clientID, client.roomID)
		}
	}
}

func (h *Hub) broadcastRoomState(roomID string) {
	h.roomsMu.RLock()
	room, exists := h.rooms[roomID]
	h.roomsMu.RUnlock()
	if !exists {
		return
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	now := time.Now().UnixMilli()
	currentPos := room.PositionSec
	if room.IsPlaying {
		elapsed := float64(now-room.LastUpdateMs) / 1000.0
		currentPos += elapsed
	}

	var members []string
	for c := range room.Clients {
		name := c.deviceName
		if name == "" {
			name = c.clientID
		}
		members = append(members, name)
	}

	qCopy := make([]models.Song, len(room.Queue))
	copy(qCopy, room.Queue)

	msg := Message{
		Action:       "sync_state",
		RoomID:       room.ID,
		Song:         room.CurrentSong,
		IsPlaying:    room.IsPlaying,
		PositionSec:  currentPos,
		ServerTimeMs: now,
		Queue:        qCopy,
		Listeners:    len(room.Clients),
		Members:      members,
	}
	data, _ := json.Marshal(msg)

	for c := range room.Clients {
		select {
		case c.send <- data:
		default:
		}
	}
}

func (h *Hub) HandleGetRooms(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	h.roomsMu.RLock()
	defer h.roomsMu.RUnlock()

	var result []RoomInfo
	for _, room := range h.rooms {
		room.mu.RLock()
		var members []string
		for c := range room.Clients {
			name := c.deviceName
			if name == "" {
				name = c.clientID
			}
			members = append(members, name)
		}
		result = append(result, RoomInfo{
			ID:          room.ID,
			Listeners:   len(room.Clients),
			IsPlaying:   room.IsPlaying,
			CurrentSong: room.CurrentSong,
			Members:     members,
			QueueCount:  len(room.Queue),
		})
		room.mu.RUnlock()
	}

	if result == nil {
		result = []RoomInfo{}
	}
	_ = json.NewEncoder(w).Encode(result)
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}

	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = "Ruang Tamu" // Room default
	}
	clientID := r.URL.Query().Get("client_id")
	if clientID == "" {
		clientID = "guest_" + time.Now().Format("150405")
	}
	deviceName := r.URL.Query().Get("device_name")
	if deviceName == "" {
		deviceName = clientID
	}

	client := &Client{
		hub:        h,
		conn:       conn,
		send:       make(chan []byte, 256),
		roomID:     roomID,
		clientID:   clientID,
		deviceName: deviceName,
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, messageData, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(messageData, &msg); err != nil {
			continue
		}

		now := time.Now().UnixMilli()

		// Tangani sinkronisasi clock NTP (ping/pong)
		if msg.Action == "ping" {
			reply := Message{
				Action:       "pong",
				ClientTimeMs: msg.ClientTimeMs,
				ServerTimeMs: now,
			}
			if data, err := json.Marshal(reply); err == nil {
				c.send <- data
			}
			continue
		}

		c.hub.roomsMu.RLock()
		room, exists := c.hub.rooms[c.roomID]
		c.hub.roomsMu.RUnlock()
		if !exists {
			continue
		}

		room.mu.Lock()
		switch msg.Action {
		case "play":
			room.IsPlaying = true
			room.PositionSec = msg.PositionSec
			room.LastUpdateMs = now
		case "pause":
			room.IsPlaying = false
			room.PositionSec = msg.PositionSec
			room.LastUpdateMs = now
		case "seek":
			room.PositionSec = msg.PositionSec
			room.LastUpdateMs = now
		case "track_change":
			room.CurrentSong = msg.Song
			room.PositionSec = 0
			room.IsPlaying = true
			room.LastUpdateMs = now
			msg.ScheduledAtMs = now + 300

		// Antrean Kolaboratif Ruang Party (Bebas Penuh)
		case "queue_add":
			if msg.Song != nil {
				if room.CurrentSong == nil {
					room.CurrentSong = msg.Song
					room.PositionSec = 0
					room.IsPlaying = true
					room.LastUpdateMs = now
					msg.ScheduledAtMs = now + 300
				} else {
					room.Queue = append(room.Queue, *msg.Song)
				}
			}

		case "queue_remove":
			if msg.TargetIndex >= 0 && msg.TargetIndex < len(room.Queue) {
				room.Queue = append(room.Queue[:msg.TargetIndex], room.Queue[msg.TargetIndex+1:]...)
			}

		case "queue_reorder":
			if msg.IndexFrom >= 0 && msg.IndexFrom < len(room.Queue) &&
				msg.IndexTo >= 0 && msg.IndexTo < len(room.Queue) && msg.IndexFrom != msg.IndexTo {
				item := room.Queue[msg.IndexFrom]
				room.Queue = append(room.Queue[:msg.IndexFrom], room.Queue[msg.IndexFrom+1:]...)
				if msg.IndexTo >= len(room.Queue) {
					room.Queue = append(room.Queue, item)
				} else {
					room.Queue = append(room.Queue[:msg.IndexTo], append([]models.Song{item}, room.Queue[msg.IndexTo:]...)...)
				}
			}

		case "queue_play":
			if msg.TargetIndex >= 0 && msg.TargetIndex < len(room.Queue) {
				selected := room.Queue[msg.TargetIndex]
				room.Queue = append(room.Queue[:msg.TargetIndex], room.Queue[msg.TargetIndex+1:]...)
				room.CurrentSong = &selected
				room.PositionSec = 0
				room.IsPlaying = true
				room.LastUpdateMs = now
				msg.ScheduledAtMs = now + 300
			}

		case "queue_next":
			if len(room.Queue) > 0 {
				nextSong := room.Queue[0]
				room.Queue = room.Queue[1:]
				room.CurrentSong = &nextSong
				room.PositionSec = 0
				room.IsPlaying = true
				room.LastUpdateMs = now
				msg.ScheduledAtMs = now + 300
			} else {
				room.CurrentSong = nil
				room.IsPlaying = false
				room.PositionSec = 0
			}

		case "restore_queue":
			c.hub.roomsMu.RLock()
			snap, hasSnap := c.hub.savedRooms[c.roomID]
			c.hub.roomsMu.RUnlock()
			if hasSnap && snap != nil && len(snap.Queue) > 0 {
				room.Queue = make([]models.Song, len(snap.Queue))
				copy(room.Queue, snap.Queue)
				if room.CurrentSong == nil && snap.CurrentSong != nil {
					room.CurrentSong = snap.CurrentSong
				}
				log.Printf("[SyncHub] Room '%s' berhasil dipulihkan: %d lagu.", c.roomID, len(room.Queue))
			}

		case "dismiss_recovery":
			c.hub.roomsMu.Lock()
			delete(c.hub.savedRooms, c.roomID)
			c.hub.roomsMu.Unlock()
			log.Printf("[SyncHub] Room '%s' snapshot dibersihkan (Mulai Kosong).", c.roomID)

		case "reaction":
			reply := Message{
				Action: "reaction",
				RoomID: c.roomID,
				Emoji:  msg.Emoji,
			}
			data, _ := json.Marshal(reply)
			for other := range room.Clients {
				if other != c {
					select {
					case other.send <- data:
					default:
					}
				}
			}
			room.mu.Unlock()
			continue
		}
		room.mu.Unlock()

		c.hub.broadcastRoomState(c.roomID)
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for message := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			break
		}
	}
}
