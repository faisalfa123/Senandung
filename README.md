# 🎵 Senandung

> **Ultra-Lightweight Self-Hosted Spotify-like PWA with Multi-Device Audio Sync for DietPi / STB HG680P & Odroid C2**

Senandung adalah pemutar musik self-hosted *Spotify-like* yang dirancang khusus untuk hardware berdaya rendah (*Single Board Computer* / STB Amlogic S905X seperti HG680P atau Odroid C2) yang menjalankan **DietPi**.

Dibangun sebagai **single-binary Go** hemat RAM (< 25MB) dengan frontend **Vanilla PWA** (tanpa framework berat), Senandung memungkinkan Anda mendengarkan koleksi musik lokal atau unduhan YouTube secara serentak di berbagai perangkat (*Listen Together Party Mode*) tanpa delay jaringan, serta menyimpan lagu ke memori smartphone untuk diputar saat offline.

---

## ✨ Fitur Utama

- ⚡ **Ultra-Ringan & Cepat:** Single binary Go dengan Go-Embed frontend statis. Konsumsi memori sangat kecil (~15–25MB RAM), aman dijalankan bersamaan dengan Immich.
- 📻 **Multi-Device Synchronized Audio (Party Mode):** Web Audio API + WebSocket Clock Sync (NTP offset) memungkinkan pemutaran audio serentak di smartphone, laptop, dan smart speaker di rumah tanpa suara gema/tumpang tindih.
- ⬇️ **Safe YouTube Downloader (yt-dlp):** Single-worker background queue dengan prioritas rendah (`nice 19`, `ionice -c 3`) dan ffmpeg bawaan OS sehingga proses download tidak membuat STB freeze atau mengganggu Immich.
- 📲 **PWA Offline Mode:** Install langsung ke layar utama Android/iOS. Tekan tombol *Save Offline* untuk menyimpan file stream langsung ke Cache API browser.
- 📁 **Local Music Scanner:** Pindai otomatis file audio (`.mp3`, `.flac`, `.ogg`, `.m4a`, `.opus`) yang ada di penyimpanan internal atau flashdisk USB STB.
- 🎤 **Lirik Sinkron Karaoke:** Tampilan lirik lagu otomatis (`.lrc`) dengan autoscroll dan highlight baris yang sedang dinyanyikan.
- 🎚️ **Equalizer 5-Band & Bass Booster:** Ditenagai Web Audio API langsung di sisi browser pengguna (0% beban CPU server).
- ⏱️ **Sleep Timer:** Pengatur waktu tidur otomatis (15m, 30m, 45m, 60m) untuk menghentikan musik sebelum Anda terlelap.
- 🔀 **Smart Queue, Shuffle & Repeat:** Navigasi playlist, antrean acak cerdas, dan pengulangan trek.

---

## ⚖️ Manajemen Prioritas OS (DietPi Cgroups & Nice)

Senandung menyertakan script integrasi prioritas CPU & I/O agar layanan penting seperti Immich tetap menjadi prioritas tertinggi:

| Layanan | Nice Priority | CPU Quota | IO Class | Deskripsi |
| :--- | :--- | :--- | :--- | :--- |
| **Immich** | `-5` | `150%` | High / Best-effort | Prioritas Utama #1 |
| **Senandung** | `0` | `50%` | Normal | Prioritas Utama #2 (Musik) |
| **Dompet Mungil** | `0` | `30%` | Normal | Prioritas Utama #2 (Keuangan) |
| **Kompic** | `10` | `30%` | Idle | Prioritas #3 |
| **Bumiayu** | `15` | `20%` | Idle | Prioritas #4 |

---

## 🚀 Instalasi Cepat di DietPi (STB HG680P / Odroid C2)

Cukup clone repositori ini dan jalankan installer satu-klik:

```bash
git clone https://github.com/faisalfa123/Senandung.git
cd Senandung
sudo bash install.sh
```

Installer otomatis akan:
1. Memasang paket dependensi (`ffmpeg`, `curl`, `ca-certificates`).
2. Mengunduh binary standalone `yt-dlp` terbaru.
3. Memasang dan mengaktifkan service systemd `/etc/systemd/system/senandung.service`.
4. Menerapkan aturan cgroups & nice prioritas di seluruh service terkait.

Buka browser di ponsel atau PC Anda:
```
http://<IP-STB-ANDA>:8989
```

---

## 🛠️ Kompilasi dari Source

```bash
# Kompilasi native
go build -ldflags="-s -w" -o senandung .

# Jalankan secara lokal
./senandung -port 8989 -data-dir ./data -music-dir ./data/music
```

---

## 📄 Lisensi

Didistribusikan di bawah lisensi MIT. Silakan gunakan dan kembangkan secara bebas untuk homelab keluarga Anda!
