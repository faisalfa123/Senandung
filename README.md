# 🎵 Senandung v3.0.1 Nightly Dev (Rust)

> Ultra-Lightweight Self-Hosted Spotify-like PWA with Multi-Device Audio Sync

Senandung **v3.0.1-nightly-dev** adalah perombakan total (*Total Rewrite*) dari Go-Lang ke **Rust**, dirancang khusus untuk perangkat **STB HG680P (Amlogic S905X)**, **Odroid C2**, dan server homelab berbasis **DietPi / Linux**.

---

## ⚠️ Masih Ingin Menggunakan Versi Go?
Jika Anda belum siap bermigrasi ke versi Rust, gunakan versi Go terakhir yang stabil (`v2.1.2-stable`) di branch `versi-GO-Lang`:
```bash
git checkout versi-GO-Lang
git checkout v2.1.2-stable
```
> Catatan: Apabila menggunakan alias dengan spasi, gunakan `git checkout "versi GO-Lang"`.

---

## ✨ Fitur Utama (Rust Edition v3.0.1)

1. **Efisiensi Memori & Binary Ekstrem**:
   - Konsumsi RAM saat idle hanya **~3.6 MB** (target `< 20 MB`, jauh lebih ringan dibanding batas 96 MB pada versi Go).
   - Ukuran single-file binary release hanya **~4.5 MB** (target `< 15 MB`) dengan seluruh aset UI ter-embed di dalamnya (`rust-embed`).
2. **Live Room Multi-Device Audio Sync Presisi Tinggi**:
   - Sinkronisasi waktu berbasis perhitungan `ntp_offset_ms`, `play_timestamp`, jitter buffer `100ms`, dan penjadwalan `Web Audio API`.
   - Mendukung **Multi-Room dinamis** (otomatis bergabung ke room `"Lobby"`, serta dapat membuat atau pindah ke room kustom seperti `"TestRoom"`).
   - Pengiriman `room_state_snapshot` seketika saat bergabung (`join_room`) dan urutan lagu yang dikontrol otoritatif oleh server (`current_track_index`).
3. **Async Single-Worker YouTube Downloader & Flexible Storage Auto-Reroute**:
   - Mengunduh lagu dari YouTube menggunakan `tokio::process::Command` dengan prioritas rendah (`nice -n 19 ionice -c 3 yt-dlp --extract-audio --audio-format mp3 --audio-quality 128K`), timeout 60 detik, dan retry otomatis 1x.
   - **Auto-Reroute Penyimpanan**: Prioritas penyimpanan di harddisk eksternal (`/mnt/hdd1/senandung/tracks`) dengan pengalihan otomatis (*auto-reroute*) ke penyimpanan internal (`/var/lib/senandung/tracks`) jika harddisk tidak terpasang/terputus.
4. **3-Tier Hybrid Intelligent Caching (Zero Loading Screen Time)**:
   - **Tier 1 (RAM Static Cache)**: Seluruh file HTML/CSS/JS disajikan langsung dari RAM (<1ms) dengan `Cache-Control: public, max-age=31536000, immutable` dan `ETag`.
   - **Tier 2 (Client HTTP & PWA Service Worker)**: Delegasi cache browser (`max-age=86400`) untuk thumbnail/artwork dan Service Worker `sw.js` untuk waktu muat kunjungan kedua `< 50ms`.
   - **Tier 3 (LRU Disk Cache & 8KB Stream)**: Cache thumbnail di disk dibatasi maksimal **50 MB / 500 item**, dan audio di-stream menggunakan chunk **8 KB** (HTTP Range supported) tanpa menahan file audio di RAM server.
5. **Perlindungan SD Card (Anti-Write Exhaustion & Anti-Penuh)**:
   - Database embedded `sled` (ACID) dengan batch flush setiap 5 detik.
   - Default log level `WARN` (tanpa spam `INFO`/`DEBUG`), rotasi log maksimal **2 MB** (`2 x 1 MB`), deduplikasi error anti-spam, serta *graceful degradation* otomatis ke `stderr` (`systemd-journald`) saat disk penuh (`ENOSPC`).
6. **Antarmuka YouTube Music Dark Theme (100% Vanilla HTML/CSS/JS)**:
   - Indikator garis buffering abu-abu (`rgba(255, 255, 255, 0.3)`) di bawah garis progres merah (`#ff0000`).
   - Penamaan perangkat otomatis (`Senandung-ARM64-XXXX`) yang dapat diubah melalui modal identitas perangkat.
   - Deteksi otomatis layar *Mobile/Desktop* disertai tombol toggle manual di header.

---

## 🚀 Instalasi Native (DietPi / Debian / Ubuntu)

Jalankan skrip instalasi otomatis:
```bash
chmod +x scripts/install.sh scripts/mastermind.sh
./scripts/install.sh
```

Skrip `scripts/install.sh` akan:
1. Mendeteksi arsitektur perangkat (`aarch64`, `armv7l`, atau `x86_64`).
2. Memasang binary ke `/usr/local/bin/senandung`.
3. Menyiapkan direktori `/var/lib/senandung`, `/var/cache/senandung`, dan `/var/log/senandung`.
4. Mengaktifkan systemd service `senandung.service` pada port `8989`.
5. Menampilkan URL akses lokal dan Tailscale.

### Integrasi Ekosistem Mastermind
Untuk mendaftarkan Senandung secara idempotent ke ekosistem [Mastermind](https://github.com/faisalfa123/mastermind) dan memvalidasi tidak ada konflik port dengan Immich / Dompet Mungil / Kompic:
```bash
./scripts/mastermind.sh
```

---

## 🛠️ Kompilasi dari Source

Pastikan toolchain Rust (`cargo` dan `rustc`) telah terpasang:

### 1. Build Standar (Default — Ultra Ringan)
```bash
cargo build --release
./target/release/senandung --port 8989 --data-dir /var/lib/senandung --music-dir /mnt/hdd1/senandung/tracks
```

### 2. Mengaktifkan Fitur Dormant (`local-audio` — Symphonia & CPAL)
Senandung menyediakan modul *future-proofing* `LocalAudioEngine` (`src/core/audio_engine.rs`) untuk decoding dan pemutaran audio perangkat keras lokal menggunakan `symphonia` dan `cpal`. Secara default fitur ini **tidak dikompilasi** agar ukuran binary tetap di bawah 15 MB.

Untuk mengompilasi dengan fitur `local-audio`:
```bash
cargo build --release --features local-audio
```

---

## 🔧 Konfigurasi Parameter & Environment Variables

| Flag CLI | Environment Variable | Default | Deskripsi |
| :--- | :--- | :--- | :--- |
| `--port`, `-p` | `PORT` | `8989` | Port HTTP & WebSocket server |
| `--data-dir`, `-d` | `DATA_DIR` / `STATE_DIRECTORY` | `/var/lib/senandung` | Lokasi `state.db` (Sled) dan fallback musik |
| `--music-dir`, `-m` | `SENANDUNG_MUSIC_DIR` / `MUSIC_DIR` | `/mnt/hdd1/senandung/tracks` | Lokasi utama penyimpanan MP3 (otomatis fallback ke `DATA_DIR/tracks` jika HDD tidak terbaca) |
| `--log-file` | `SENANDUNG_LOG_FILE=1` | `false` (`stderr`) | Aktifkan penulisan log ke file dengan rotasi maks 2 MB |
| - | `SENANDUNG_THUMB_CACHE_MB` | `20` | Batas kapasitas disk cache thumbnail dalam MB (min: 1, maks: 100) |
| - | `RUST_LOG` | `warn` | Level log (`warn`, `error`, `info`, `debug`) |

---

## 📡 REST API Endpoints (v3.2.0)

| Endpoint | Method | Header | Deskripsi |
| :--- | :--- | :--- | :--- |
| `/api/v1/health` | `GET` | - | Status server, versi, path DB & storage musik |
| `/api/v1/search?q={query}` | `GET` | - | Cari lagu via yt-dlp & YouTube |
| `/api/v1/tracks` | `GET` | - | Daftar semua lagu yang tersimpan di disk |
| `/api/v1/stream/{track_id}` | `GET` | `Range` | Stream audio MP3 chunked 8KB (mendukung range request) |
| `/api/v1/thumbnail/{id}` | `GET` | - | Ambil gambar thumbnail/artwork track |
| `/api/v1/download` | `POST` | - | Antrekan unduhan musik baru ke worker latar belakang |
| `/api/v1/playlists` | `GET` | - | List semua playlist kustom server-side |
| `/api/v1/playlists/{name}/tracks` | `POST` | - | Tambah track ke playlist kustom |
| `/api/v1/playlists/{name}/tracks/{track_id}` | `DELETE` | - | Hapus track dari playlist kustom |
| `/api/v1/playlists/{name}` | `DELETE` | - | Hapus seluruh playlist kustom (Favorit di-reset kosong) |
| `/api/v1/migrate-playlists` | `POST` | - | Migrasi data playlist localStorage klien ke server Sled DB |

---

## 📄 Lisensi
MIT License — Hak Cipta © Fais-Alfa (`faisalfa123`).
