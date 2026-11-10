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
	ID          string         `json:"id"`
	Listeners   int            `json:"listeners"`
	IsPlaying   bool           `json:"is_playing"`
	CurrentSong *models.Song   `json:"current_song,omitempty"`
	Members     []string       `json:"members"`
	Queue       []*models.Song `json:"queue,omitempty"`
}

type SavedRoomState struct {
	RoomID      string         `json:"room_id"`
	CurrentSong *models.Song   `json:"current_song,omitempty"`
	PositionSec float64        `json:"position_sec"`
	Queue       []*models.Song `json:"queue,omitempty"`
	SavedAt     int64          `json:"saved_at"`
}

type Message struct {
	Action       string          `json:"action"` // "join", "ping", "pong", "play", "pause", "seek", "track_change", "sync_state", "reaction", "room_list", "queue_add", "queue_remove", "queue_reorder", "queue_clear", "queue_next", "room_resume_prompt", "room_resume_confirm"
	RoomID       string          `json:"room_id,omitempty"`
	ClientTimeMs int64           `json:"client_time_ms,omitempty"`
	ServerTimeMs int64           `json:"server_time_ms,omitempty"`
	PositionSec  float64         `json:"position_sec,omitempty"`
	IsPlaying    bool            `json:"is_playing,omitempty"`
	Song         *models.Song    `json:"song,omitempty"`
	Queue        []*models.Song  `json:"queue,omitempty"`
	QueueIndex   int             `json:"queue_index,omitempty"`
	SavedState   *SavedRoomState `json:"saved_state,omitempty"`
	ResumeChoice bool            `json:"resume_choice,omitempty"`
	Listeners    int             `json:"listeners,omitempty"`
	Members      []string        `json:"members,omitempty"`
	Emoji        string          `json:"emoji,omitempty"`
	Rooms        []RoomInfo      `json:"rooms,omitempty"`
}

type Room struct {
	ID           string
	CurrentSong  *models.Song
	IsPlaying    bool
	PositionSec  float64
	LastUpdateMs int64
	LeaderID     string
	Queue        []*models.Song
	Clients      map[*Client]bool
	mu           sync.RWMutex
}

type Hub struct {
	rooms        map[string]*Room
	savedRooms   map[string]*SavedRoomState
	roomsMu      sync.RWMutex
	savedRoomsMu sync.RWMutex
	register     chan *Client
	unregister   chan *Client
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		savedRooms: make(map[string]*SavedRoomState),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			h.roomsMu.RLock()
			var activeRooms []string
			for id, room := range h.rooms {
				room.mu.RLock()
				if len(room.Clients) > 0 {
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
			isNewRoom := !exists

			if isNewRoom {
				room = &Room{
					ID:           client.roomID,
					Clients:      make(map[*Client]bool),
					LastUpdateMs: time.Now().UnixMilli(),
					Queue:        make([]*models.Song, 0),
				}
				h.rooms[client.roomID] = room
			}

			room.mu.Lock()
			wasEmpty := len(room.Clients) == 0
			room.Clients[client] = true
			if room.LeaderID == "" {
				room.LeaderID = client.clientID
			}
			listenerCount := len(room.Clients)
			room.mu.Unlock()
			h.roomsMu.Unlock()

			// Cek apakah ada saved session state untuk room ini saat pengguna pertama masuk
			if wasEmpty {
				h.savedRoomsMu.RLock()
				saved, hasSaved := h.savedRooms[client.roomID]
				h.savedRoomsMu.RUnlock()

				if hasSaved && saved != nil && (saved.CurrentSong != nil || len(saved.Queue) > 0) {
					// Kirim prompt dialog khusus ke klien ini untuk konfirmasi resume
					promptMsg := Message{
						Action:     "room_resume_prompt",
						RoomID:     client.roomID,
						SavedState: saved,
					}
					promptData, _ := json.Marshal(promptMsg)
					select {
					case client.send <- promptData:
					default:
					}
				}
			}

			// Broadcast status room ke semua listener
			h.broadcastRoomState(client.roomID)
			log.Printf("[SyncHub] Klien %s bergabung ke room '%s' (Total listener: %d)", client.clientID, client.roomID, listenerCount)

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
					// Simpan sesi room sebelum ditutup agar bisa dilanjutkan kembali
					now := time.Now().UnixMilli()
					currentPos := room.PositionSec
					if room.IsPlaying {
						elapsed := float64(now-room.LastUpdateMs) / 1000.0
						currentPos += elapsed
					}

					queueCopy := make([]*models.Song, len(room.Queue))
					copy(queueCopy, room.Queue)

					h.savedRoomsMu.Lock()
					h.savedRooms[client.roomID] = &SavedRoomState{
						RoomID:      client.roomID,
						CurrentSong: room.CurrentSong,
						PositionSec: currentPos,
						Queue:       queueCopy,
						SavedAt:     now,
					}
					h.savedRoomsMu.Unlock()

					room.mu.Unlock()
					delete(h.rooms, client.roomID)
					log.Printf("[SyncHub] Room '%s' kosong. Sesi lagu & antrean disimpan untuk resume.", client.roomID)
				} else {
					room.mu.Unlock()
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

	queueCopy := make([]*models.Song, len(room.Queue))
	copy(queueCopy, room.Queue)

	msg := Message{
		Action:       "sync_state",
		RoomID:       room.ID,
		Song:         room.CurrentSong,
		IsPlaying:    room.IsPlaying,
		PositionSec:  currentPos,
		ServerTimeMs: now,
		Listeners:    len(room.Clients),
		Members:      members,
		Queue:        queueCopy,
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
		queueCopy := make([]*models.Song, len(room.Queue))
		copy(queueCopy, room.Queue)

		result = append(result, RoomInfo{
			ID:          room.ID,
			Listeners:   len(room.Clients),
			IsPlaying:   room.IsPlaying,
			CurrentSong: room.CurrentSong,
			Members:     members,
			Queue:       queueCopy,
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
			data, _ := json.Marshal(reply)
			c.send <- data
			continue
		}

		// Aksi kontrol pemutaran & Antrean Room
		c.hub.roomsMu.RLock()
		room, exists := c.hub.rooms[c.roomID]
		c.hub.roomsMu.RUnlock()
		if !exists {
			continue
		}

		room.mu.Lock()
		switch msg.Action {
		case "get_state":
			// Minta broadcast state terkini secara instan ke seluruh listener di room
			room.mu.Unlock()
			c.hub.broadcastRoomState(c.roomID)
			continue
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

		// Antrean Room (Room Up Next Queue)
		case "queue_add":
			if msg.Song != nil {
				room.Queue = append(room.Queue, msg.Song)
				// Jika saat ini room belum memutar lagu, langsung mainkan lagu ini
				if room.CurrentSong == nil {
					room.CurrentSong = msg.Song
					room.PositionSec = 0
					room.IsPlaying = true
					room.LastUpdateMs = now
					// Hapus dari antrean pertama
					if len(room.Queue) > 0 {
						room.Queue = room.Queue[1:]
					}
				}
			}
		case "queue_remove":
			if msg.QueueIndex >= 0 && msg.QueueIndex < len(room.Queue) {
				room.Queue = append(room.Queue[:msg.QueueIndex], room.Queue[msg.QueueIndex+1:]...)
			}
		case "queue_clear":
			room.Queue = make([]*models.Song, 0)
		case "queue_next":
			// Lagu saat ini selesai, putar lagu berikutnya dari antrean jika ada
			if len(room.Queue) > 0 {
				nextSong := room.Queue[0]
				room.Queue = room.Queue[1:]
				room.CurrentSong = nextSong
				room.PositionSec = 0
				room.IsPlaying = true
				room.LastUpdateMs = now
			} else {
				room.IsPlaying = false
				room.PositionSec = 0
				room.LastUpdateMs = now
			}

		// Resume session confirmation
		case "room_resume_confirm":
			c.hub.savedRoomsMu.Lock()
			saved, hasSaved := c.hub.savedRooms[c.roomID]
			if hasSaved && saved != nil {
				if msg.ResumeChoice {
					// Pulihkan lagu, posisi, dan antrean sebelumnya
					room.CurrentSong = saved.CurrentSong
					room.PositionSec = saved.PositionSec
					room.Queue = saved.Queue
					room.IsPlaying = true
					room.LastUpdateMs = now
					log.Printf("[SyncHub] Room '%s' dipulihkan ke lagu '%s' pada posisi %.1f detik.", c.roomID, saved.CurrentSong.Title, saved.PositionSec)
				}
				// Hapus saved state setelah keputusan diambil
				delete(c.hub.savedRooms, c.roomID)
			}
			c.hub.savedRoomsMu.Unlock()

		case "reaction":
			// Teruskan reaksi emoji ke klien lain di room
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

		// Broadcast state terupdate ke semua listener di room
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
