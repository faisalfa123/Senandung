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
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	roomID   string
	clientID string
}

type Message struct {
	Action       string       `json:"action"` // "join", "ping", "pong", "play", "pause", "seek", "track_change", "sync_state"
	RoomID       string       `json:"room_id,omitempty"`
	ClientTimeMs int64        `json:"client_time_ms,omitempty"`
	ServerTimeMs int64        `json:"server_time_ms,omitempty"`
	PositionSec  float64      `json:"position_sec,omitempty"`
	IsPlaying    bool         `json:"is_playing,omitempty"`
	Song         *models.Song `json:"song,omitempty"`
	Listeners    int          `json:"listeners,omitempty"`
	Emoji        string       `json:"emoji,omitempty"`
}

type Room struct {
	ID           string
	CurrentSong  *models.Song
	IsPlaying    bool
	PositionSec  float64
	LastUpdateMs int64
	LeaderID     string
	Clients      map[*Client]bool
	mu           sync.RWMutex
}

type Hub struct {
	rooms      map[string]*Room
	roomsMu    sync.RWMutex
	register   chan *Client
	unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
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
			if !exists {
				room = &Room{
					ID:           client.roomID,
					Clients:      make(map[*Client]bool),
					LastUpdateMs: time.Now().UnixMilli(),
				}
				h.rooms[client.roomID] = room
			}
			room.mu.Lock()
			room.Clients[client] = true
			if room.LeaderID == "" {
				room.LeaderID = client.clientID
			}
			listenerCount := len(room.Clients)
			room.mu.Unlock()
			h.roomsMu.Unlock()

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
				room.mu.Unlock()

				if clientCount == 0 {
					delete(h.rooms, client.roomID)
				} else {
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

	msg := Message{
		Action:       "sync_state",
		RoomID:       room.ID,
		Song:         room.CurrentSong,
		IsPlaying:    room.IsPlaying,
		PositionSec:  currentPos,
		ServerTimeMs: now,
		Listeners:    len(room.Clients),
	}
	data, _ := json.Marshal(msg)

	for c := range room.Clients {
		select {
		case c.send <- data:
		default:
		}
	}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}

	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = "main_hall" // Room default untuk seluruh keluarga
	}
	clientID := r.URL.Query().Get("client_id")
	if clientID == "" {
		clientID = "guest_" + time.Now().Format("150405")
	}

	client := &Client{
		hub:      h,
		conn:     conn,
		send:     make(chan []byte, 256),
		roomID:   roomID,
		clientID: clientID,
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

		// Aksi kontrol pemutaran: Play / Pause / Seek / Track Change
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
