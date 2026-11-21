# 🗺️ PROJECT MAP - SENANDUNG v3.0.1 Nightly Dev

> **PANDUAN NAVIGASI FILE — JANGAN SCAN REPO, GUNAKAN FILE INI**

## 📁 Struktur Direktori

```text
senandung/
├── .antigravity/
│   └── rules.md              # Protokol eksekusi AI
├── src/
│   ├── main.rs               # Entry point, Axum init, Tokio runtime, graceful shutdown
│   ├── server/
│   │   ├── api.rs            # REST endpoints (search, download, health, stream)
│   │   ├── ws.rs             # WebSocket handler (Live Room, NTP sync)
│   │   ├── downloader.rs     # yt-dlp wrapper async (single-worker, nice 19)
│   │   └── static_cache.rs   # Handler file statis dari RAM (Tier 1 caching)
│   ├── core/
│   │   ├── state.rs          # Shared state (Arc<RwLock>) untuk playlist & room
│   │   ├── db.rs             # Sled DB integration (ACID, hemat I/O)
│   │   ├── sync.rs           # NTP offset & Web Audio API scheduling
│   │   ├── audio_engine.rs   # [DORMANT] Symphonia module (feature-gated)
│   │   └── cache.rs          # LRU disk cache untuk thumbnail/artwork (Tier 3)
│   ├── logging/
│   │   └── mod.rs            # Tracing setup + rotation + journald fallback
│   └── utils/
│       └── system.rs         # Arch detection, flexible storage router, nice/IO priority
├── web/                      # Frontend statis (Vanilla JS + CSS, NO framework)
│   ├── index.html
│   ├── app.js                # UI logic, Web Audio API, WebSocket client
│   ├── sw.js                 # Service Worker untuk PWA caching
│   └── style.css             # YouTube Music-like Dark Theme
├── scripts/
│   ├── install.sh            # Native installation script
│   └── mastermind.sh         # Mastermind ecosystem integration
├── Cargo.toml                # Rust dependencies
├── PROJECT_MAP.md            # This file
└── README.md                 # Documentation
```

## 🔑 File Kunci per Fitur

### Live Room Sync
- `src/server/ws.rs` — WebSocket handler
- `src/core/state.rs` — Room state management (Multi-room + Lobby default)
- `src/core/sync.rs` — NTP offset calculation
- `web/app.js` — Web Audio API scheduling

### YouTube Download & Flexible Storage
- `src/server/downloader.rs` — yt-dlp wrapper (single-worker queue, MP3 128K)
- `src/server/api.rs` — Download & 8KB chunk audio stream endpoints
- `src/utils/system.rs` — Flexible storage router (`/mnt/hdd1/senandung` -> fallback `/var/lib/senandung/tracks`)

### Caching
- `src/server/static_cache.rs` — Tier 1 (RAM via rust-embed)
- `src/core/cache.rs` — Tier 3 (LRU disk, max 50MB / 500 items)
- `web/sw.js` — Client-side PWA caching

### Database
- `src/core/db.rs` — Sled integration
- Location: `/var/lib/senandung/state.db`

### Logging
- `src/logging/mod.rs` — Tracing setup
- Default level: WARN
- Fallback: stderr → systemd-journald
