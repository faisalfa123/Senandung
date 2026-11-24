# 🗺️ PROJECT MAP - SENANDUNG v3.0.5 Main/Stable

> **PANDUAN NAVIGASI FILE — JANGAN SCAN REPO, GUNAKAN FILE INI**

## 📁 Struktur Direktori

```text
senandung/
├── .antigravity/
│   └── rules.md              # Protokol eksekusi AI
├── src/
│   ├── main.rs               # Entry point, Axum router, worker pool, periodic storage checker
│   ├── server/
│   │   ├── api.rs            # REST endpoints (playlists, PIN, search, download, health, stream)
│   │   ├── ws.rs             # WebSocket handler (Live Room, Multi-Sample NTP sync, Delta updates, PIN)
│   │   ├── downloader.rs     # yt-dlp wrapper async (concurrent pool Semaphore 2, nice 19)
│   │   └── static_cache.rs   # Handler file statis dari RAM (Tier 1 caching)
│   ├── core/
│   │   ├── state.rs          # Shared state (Arc<RwLock>) untuk playlist, delta events & room PIN
│   │   ├── db.rs             # Sled DB integration (custom_playlists, rooms, tracks)
│   │   ├── sync.rs           # Multi-sample median NTP offset & Web Audio API scheduling
│   │   ├── audio_engine.rs   # [DORMANT] Symphonia module (feature-gated)
│   │   └── cache.rs          # LRU disk cache untuk thumbnail/artwork (Tier 3, configurable MB)
│   ├── logging/
│   │   └── mod.rs            # Tracing setup + rotation + journald fallback
│   └── utils/
│       └── system.rs         # Storage health checker, auto-migration, local HDD scanner
├── web/                      # Frontend statis (Vanilla JS + CSS, NO framework)
│   ├── index.html            # YouTube Music-like Dark Theme layout + Modals
│   ├── app.js                # UI logic, Media Session API, Toast system, Solo <-> Room preservation
│   ├── sw.js                 # Service Worker untuk PWA caching (Network-First)
│   └── style.css             # Responsive styling, toast container, animations
├── scripts/
│   ├── install.sh            # Native installation script
│   └── mastermind.sh         # Mastermind ecosystem integration
├── Cargo.toml                # Rust dependencies
├── PROJECT_MAP.md            # This file
├── RELEASE_NOTES.md          # Version release changelog
└── README.md                 # Documentation
```

## 🔑 File Kunci per Fitur

### Live Room Sync & Security
- `src/server/ws.rs` — WebSocket handler (multi-sample median NTP filter, delta updates, room PIN validation)
- `src/core/state.rs` — Room state management, PlaylistDelta, salted PIN hashing
- `src/core/sync.rs` — Multi-sample median NTP offset calculation
- `web/app.js` — Rapid ping NTP sync, Solo <-> Room state preservation via sessionStorage, Toast notifications

### YouTube Download & Concurrent Worker
- `src/server/downloader.rs` — yt-dlp wrapper (Semaphore(2) concurrent pool, nice 19)
- `src/server/api.rs` — Download, custom playlists, PIN management & 8KB chunk audio stream endpoints
- `src/utils/system.rs` — Storage router + 5-minute periodic auto-migration back to HDD

### Caching & PWA
- `src/server/static_cache.rs` — Tier 1 (RAM via rust-embed)
- `src/core/cache.rs` — Tier 3 (LRU disk, configurable via `SENANDUNG_THUMB_CACHE_MB`)
- `web/sw.js` — Client-side PWA caching

### Database
- `src/core/db.rs` — Sled integration (`rooms_v3`, `tracks_v3`, `custom_playlists_v3`)
- Location: `/var/lib/senandung/state.db` (auto-fallback to `/mnt/hdd1/senandung` or `/tmp`)
