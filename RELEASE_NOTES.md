# 📦 RELEASE NOTES - SENANDUNG v3.0.5 Main/Stable

Senandung v3.0.5 adalah rilis **MAIN/STABLE** yang menggabungkan seluruh penyempurnaan dari Phase 1 hingga Phase 6:

## 🚀 Fitur Baru & Peningkatan Utama

### 1. Phase 1: Quick Wins (`v3.1.0`)
- **Penghematan RAM Ekstrem**: Kapasitas broadcast channel tokio diperkecil dari 128 ke 32 slots per room.
- **Konfigurasi Cache Thumbnail**: Parameter environment variable baru `SENANDUNG_THUMB_CACHE_MB` (default: 20MB, rentang 1-100MB).
- **Media Session API**: Integrasi kontrol pemutaran sistem (play, pause, next, prev, seek, cover art) di lock screen iOS Safari & Android notification tray.

### 2. Phase 2: Multi-Sample Median NTP Filter (`v3.1.1`)
- Menggunakan filter median dari 5 sampel ping bolak-balik (interval 50ms) saat memasuki Live Room.
- Mengeliminasi spike latensi jaringan WiFi lokal sehingga sinkronisasi antar-perangkat tetap di bawah ±30ms drift.

### 3. Phase 3: Server-Side Custom Playlist Persistence (`v3.2.0`)
- Penyimpanan playlist kustom di Sled DB (`custom_playlists_v3`).
- REST API lengkap: `GET /api/v1/playlists`, `POST /api/v1/playlists/{name}/tracks`, `DELETE /api/v1/playlists/{name}/tracks/{track_id}`, `DELETE /api/v1/playlists/{name}`, `POST /api/v1/migrate-playlists`.
- Sinkronisasi otomatis antar-perangkat dan fallback transparan ke localStorage saat offline.

### 4. Phase 4: Keamanan & Access Control Room PIN (`v3.2.1`)
- Proteksi Live Room menggunakan salted SHA-256 PIN hashing yang hemat CPU ARM64.
- Rate limiting anti brute-force: maksimal 5 percobaan salah per menit.
- Modal prompt PIN di frontend dengan pesan status informatif.

### 5. Phase 5: Performa & Reliabilitas (`v3.1.2`)
- **Delta Playlist Updates**: Mengirim delta event (`added`, `removed`, `reordered`, `index_changed`) alih-alih full snapshot, menghemat bandwidth WebSocket hingga >60%.
- **Concurrent Download Worker Pool**: Pemrosesan unduhan paralel terkontrol (Semaphore 2) dengan prioritas `nice -n 19 ionice -c 3`.
- **Storage Health Checker**: Pemeriksaan berkala 5 menit untuk mount HDD1; otomatis memindahkan track dari folder fallback kembali ke HDD begitu disk terhubung.

### 6. Phase 6: UX Polish & Stabilisasi (`v3.0.5`)
- **Toast Notification System**: Notifikasi status bertumpuk (stackable) auto-dismiss 5 detik dengan tombol aksi "Coba Lagi" saat unduhan gagal.
- **Solo <-> Room State Preservation**: Status putar solo (posisi detik, antrean, track aktif) disimpan di `sessionStorage` dan dikembalikan utuh saat keluar dari room.
- **iOS Silent Audio Buffer Fix**: Unlock Web Audio / HTML5 audio menggunakan base64 silent WAV 44-byte untuk mengeliminasi `AbortError` di iOS 17+ Safari.

---

## 💻 Panduan Migrasi dari v3.0.4

Binary bersifat drop-in replacement:
```bash
# Hentikan service
systemctl stop senandung # atau mastermind stop senandung

# Ganti binary dengan v3.0.5
cp senandung-linux-arm64 /usr/local/bin/senandung # atau target deploy

# Jalankan service kembali
systemctl start senandung
```
Semua file database `state.db` dan koleksi musik di `/mnt/hdd1/senandung` otomatis terbaca dan kompatibel penuh.
