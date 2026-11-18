# 🤖 AI Developer & Coding Agent Handbook — Senandung

Dokumen ringkasan arsitektur, cara kerja, dan panduan cepat bagi agen AI (Qwen Coder, Claude Code, Cursor, Copilot, ChatGPT, Antigravity, dll.) untuk mengembangkan fitur, memperbaiki bug, dan menjaga kompatibilitas ekosistem Senandung.

---

## 1. Profil & Filosofi Proyek

- **Nama Proyek**: Senandung
- **Deskripsi**: Aplikasi musik mandiri (self-hosted) Progressive Web App (PWA) mirip Spotify yang sangat ringan (ramah resource STB Amlogic S905X / HG680P, Odroid C2, Raspberry Pi, dan DietPi).
- **Fitur Utama**:
  - Pemutar audio lokal & unduhan YouTube instan via `yt-dlp` / `ffmpeg`.
  - Mode Pesta (*Party Mode*) dengan sinkronisasi audio multi-perangkat real-time via WebSocket.
  - Background playback & MediaSession API (layar mati tetap jalan).
  - Tampilan Lirik sinkron + offset karaoke.
  - Integrasi native sandboxing sistem Linux via [Mastermind](https://github.com/faisalfa123/mastermind).

---

## 2. Struktur Direktori Utama

```text
├── main.go                     # Entry point server HTTP Go & pembacaan konfigurasi environment
├── go.mod / go.sum             # Dependensi Go
├── senandung.batasan.toml      # Kontrak isolasi keamanan untuk Mastermind Zen App Manager
├── .devcontainer/              # Setup environment otomatis untuk GitHub Codespaces
├── .agents/plugins/superpowers # 16 skill metodologi AI (TDD, debugging, planning, dll.)
├── .qwen/instructions.md       # Panduan konteks cepat khusus Qwen Coder
├── scripts/
│   ├── qwen-setup.sh           # Setup environment cloud Qwen Coder
│   ├── apply-priority.sh       # Penyetelan nice & CPU priority untuk Linux STB
│   └── senandung.service       # Template service systemd
├── web/                        # Frontend PWA (Vanilla JS, HTML5, CSS)
│   ├── index.html              # Antarmuka utama aplikasi (Player, Library, Party, TV UI)
│   ├── app.js                  # Logika aplikasi, state audio, websocket, media session
│   ├── sw.js                   # Service Worker untuk caching offline & PWA install
│   └── manifest.json           # Manifest PWA
├── pkg/                        # Core backend modules (Go)
│   ├── api/                    # Handler REST API, streaming audio, sysinfo, restart
│   ├── db/                     # Layer SQLite untuk library, queue, bookmark, dan history
│   ├── downloader/             # Antrean download audio YouTube via yt-dlp & ffmpeg
│   ├── scanner/                # Pemindai direktori musik lokal disk/HDD
│   ├── searcher/               # Pencarian lagu & metadata YouTube
│   └── sync/                   # WebSocket Hub untuk sinkronisasi audio Party Mode
└── bin/                        # Binary rilis multi-arsitektur (ARM64, ARMv7, x86_64, checksums.txt)
```

---

## 3. Aturan Arsitektur Penting (Rules for AI)

### A. Backend (Go)
1. **Pure Go / Static Binary (`CGO_ENABLED=0`)**:
   - Selalu kompilasi dengan `CGO_ENABLED=0 go build -ldflags="-s -w"`.
   - Frontend di-embed langsung ke biner menggunakan `embed.FS` (`//go:embed web/*`), namun jika direktori `./web` lokal ada, server otomatis memuat langsung dari disk agar iterasi UI instan tanpa recompile.
2. **Environment Variables Overrides**:
   - Server Go wajib membaca variabel:
     - `PORT` (default: `8080`)
     - `STATE_DIRECTORY` (dari systemd Mastermind: `/var/lib/mastermind/senandung`)
     - `DATA_DIR` (default: `./data`)
     - `MUSIC_DIR` (default: `/mnt/hdd1/senandung`, dengan fallback otomatis ke `./data/music` jika harddisk eksternal belum terpasang).
3. **Graceful Restart di Lingkungan Sandbox**:
   - Fungsi restart di `pkg/api/server.go` (`handleRestartService`) menggunakan `os.Exit(0)` saat terdeteksi berjalan di dalam container/systemd sandbox (`INVOCATION_ID` atau `STATE_DIRECTORY`). Supervisor systemd (`Restart=always`) akan langsung menyalakan ulang service secara instan tanpa butuh akses root ke `systemctl`.

### B. Frontend (Web PWA)
1. **Vanilla JavaScript (Tanpa Framework Berat)**:
   - Hindari menambahkan framework berat (React, Vue, Angular) karena aplikasi harus lancar berjalan di TV Box/STB RAM 1 GB dan browser HP low-end.
2. **Background Audio & WakeLock**:
   - Kontrol pemutaran terhubung ke `navigator.mediaSession` (Metadata lagu, Play, Pause, Next, Prev, Seek).
   - Pastikan audio element tetap dipertahankan agar tidak dihentikan oleh battery saver mobile.
3. **Party Mode Synchronization**:
   - Sinkronisasi waktu pemutaran berbasis WebSocket frame dengan delta time adjustment (mengurangi drift latensi jaringan).

---

## 4. Ekosistem Integrasi

| Ekosistem | File Konfigurasi / Target | Keterangan |
|---|---|---|
| **Mastermind** | `senandung.batasan.toml` | Sandboxing Linux native, cgroups RAM Max 96 MB, CPU Quota 50%, Read-Write HDD `/mnt/hdd1/senandung`. |
| **Qwen Coder** | `scripts/qwen-setup.sh` & `.qwen/instructions.md` | Cloud development di `https://coder.qwen.ai/setting/caenvironment/new`. |
| **Superpowers** | `.agents/plugins/superpowers/` | 16 skill standar rekayasa software (TDD, debugging sistematis, branch review). |
| **Codespaces** | `.devcontainer/devcontainer.json` | Otomatis menjalankan `git submodule update --init --recursive`. |

---

## 5. Cheat Sheet Perintah untuk AI

```bash
# Menjalankan server development lokal
go run . -port 8080 -data-dir ./data -music-dir ./data/music

# Menjalankan seluruh pengujian unit test
go test ./...

# Memvalidasi konfigurasi sandboxing Mastermind
mastermind validate senandung.batasan.toml

# Membangun binary produksi multi-arsitektur
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o bin/senandung-linux-arm64 .
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/senandung-linux-x86_64 .

# Menghitung SHA-256 checksums untuk rilis
cd bin && sha256sum senandung-linux-arm64 senandung-linux-x86_64 > checksums.txt

# Inisialisasi submodule skill Superpowers
git submodule update --init --recursive
```

---

## 6. Prompt Template untuk Diberikan ke AI Baru

Jika Anda membuka sesi baru di **Claude Code**, **Cursor**, **ChatGPT**, atau **Qwen Coder**, cukup tempelkan prompt berikut:

> *"Halo! Saya sedang mengembangkan repositori **Senandung** (aplikasi Spotify-like PWA self-hosted berbasis Pure Go dan Vanilla JS untuk STB DietPi & Mastermind sandbox). Silakan baca file `AI_HANDBOOK.md` dan `.qwen/instructions.md` di root repositori untuk memahami arsitektur, environment variables, aturan kompilasi static binary, dan integrasi sandboxing sebelum memulai tugas ini."*
