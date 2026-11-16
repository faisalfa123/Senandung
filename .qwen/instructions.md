# Qwen Coder AI Instructions for Senandung Project

You are assisting in developing **Senandung**, an ultra-lightweight, self-hosted Spotify-like Progressive Web App (PWA) with synchronized multi-device audio streaming (Party Mode), automatic background playback, and native Linux sandboxing integration.

## Architecture Overview
1. **Backend**:
   - Written in pure Go (`CGO_ENABLED=0`, statically linked).
   - Embedded static frontend using `embed.FS` (`//go:embed web/*`).
   - SQLite database for persistent queue, history, and library.
   - Low-latency WebSocket Hub (`pkg/sync`) for multi-device synchronized audio playback.
   - Downloader queue (`pkg/downloader`) using `yt-dlp` and `ffmpeg`.
   - Local storage scanner (`pkg/scanner`).

2. **Mastermind Integration**:
   - Configuration manifest: `senandung.batasan.toml` at repository root.
   - Runs in hardened systemd sandbox with `DynamicUser=yes`, `StateDirectory=mastermind/senandung`.
   - Environment variables: reads `PORT`, `DATA_DIR`, `MUSIC_DIR`, and `STATE_DIRECTORY`.
   - Default music storage: `/mnt/hdd1/senandung` (read-write permission in batasan).
   - Graceful restart: `handleRestartService` cleanly exits (`os.Exit(0)`) so systemd `Restart=always` can immediately restart the process without requiring root `systemctl` privileges.

3. **Frontend PWA**:
   - Located in `/web/index.html`, `/web/app.js`, `/web/sw.js`.
   - Vanilla JS without heavy frameworks (Vue/React) to keep it responsive on low-spec client devices (STB, TV, mobile).
   - Audio Context and MediaSession API support for background playback.

## Development & Testing Commands
- **Run dev server**: `go run . -port 8080 -data-dir ./data -music-dir ./data/music`
- **Build Linux binary**: `CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/senandung-dev .`
- **Run tests**: `go test ./...`
- **Validate Mastermind rules**: `mastermind validate senandung.batasan.toml`
