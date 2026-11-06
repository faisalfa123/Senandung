#!/usr/bin/env bash
# ==============================================================================
#  🎵 SENANDUNG - TUI INTERACTIVE SETUP & INSTALLATION WIZARD
#  Ultra-Lightweight Spotify-like PWA with Hi-Res FLAC & Multi-Device Audio Sync
#  Target Platform: DietPi OS / STB HG680P / Odroid C2 (Amlogic S905X)
# ==============================================================================

set -e

# Warna ANSI untuk Fallback
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

APP_NAME="senandung"
INSTALL_DIR="/opt/${APP_NAME}"
SYSTEMD_FILE="/etc/systemd/system/${APP_NAME}.service"
CONFIG_FILE="/etc/${APP_NAME}/${APP_NAME}.conf"

# Cek Izin Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Harap jalankan wizard installer ini dengan akses root:${NC}"
  echo -e "${YELLOW}  sudo bash install-tui.sh${NC}"
  exit 1
fi

# ------------------------------------------------------------------------------
# 1. DETEKSI TUI ENGINE (whiptail / dialog / fallback ANSI)
# ------------------------------------------------------------------------------
TUI_BIN=""
if command -v whiptail >/dev/null 2>&1; then
  TUI_BIN="whiptail"
elif command -v dialog >/dev/null 2>&1; then
  TUI_BIN="dialog"
else
  # Pasang whiptail otomatis jika di Debian/DietPi
  echo -e "${CYAN}[*] Memasang dependensi ringan antarmuka TUI (whiptail)...${NC}"
  apt-get update -qq && apt-get install -y -qq whiptail >/dev/null 2>&1 || true
  if command -v whiptail >/dev/null 2>&1; then
    TUI_BIN="whiptail"
  fi
fi

# TUI Helper Functions
tui_msgbox() {
  local title="$1"
  local msg="$2"
  if [ -n "$TUI_BIN" ]; then
    $TUI_BIN --title "$title" --msgbox "$msg" 14 74
  else
    echo -e "\n${BOLD}${CYAN}=== $title ===${NC}\n$msg\n"
    read -p "Tekan Enter untuk melanjutkan..." -r
  fi
}

tui_yesno() {
  local title="$1"
  local msg="$2"
  if [ -n "$TUI_BIN" ]; then
    $TUI_BIN --title "$title" --yesno "$msg" 12 74
    return $?
  else
    echo -e "\n${BOLD}${CYAN}=== $title ===${NC}\n$msg"
    read -p "(y/n) [default: y]: " ans
    ans=${ans:-y}
    [[ "$ans" =~ ^[Yy]$ ]] && return 0 || return 1
  fi
}

tui_input() {
  local title="$1"
  local msg="$2"
  local default_val="$3"
  if [ -n "$TUI_BIN" ]; then
    $TUI_BIN --title "$title" --inputbox "$msg" 12 74 "$default_val" 3>&1 1>&2 2>&3
  else
    echo -e "\n${BOLD}${CYAN}=== $title ===${NC}\n$msg"
    read -p "[$default_val]: " val
    echo "${val:-$default_val}"
  fi
}

tui_menu() {
  local title="$1"
  local prompt="$2"
  shift 2
  if [ -n "$TUI_BIN" ]; then
    $TUI_BIN --title "$title" --menu "$prompt" 18 74 8 "$@" 3>&1 1>&2 2>&3
  else
    echo -e "\n${BOLD}${CYAN}=== $title ===${NC}\n$prompt"
    local idx=1
    while [ $# -gt 0 ]; do
      echo "  $idx) $1 - $2"
      shift 2
      idx=$((idx + 1))
    done
    read -p "Pilih angka [1]: " c
    echo "${c:-1}"
  fi
}

# ------------------------------------------------------------------------------
# 2. AUTODETEKSI FOLDER MUSIK & HARDWARE
# ------------------------------------------------------------------------------
detect_music_folder() {
  local candidates=(
    "/mnt/dietpi_userdata/music"
    "/mnt/dietpi_userdata/Music"
    "/mnt/storage/music"
    "/media/music"
    "/home/$SUDO_USER/Music"
    "/home/$SUDO_USER/music"
    "/mnt/sda1/music"
    "/mnt/sdb1/music"
  )
  for dir in "${candidates[@]}"; do
    if [ -d "$dir" ]; then
      echo "$dir"
      return
    fi
  done
  # Default fallback
  echo "/mnt/dietpi_userdata/music"
}

AUTODETECTED_MUSIC_DIR=$(detect_music_folder)

# Deteksi IP LAN & Tailscale
DETECTED_LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
DETECTED_LAN_IP=${DETECTED_LAN_IP:-"127.0.0.1"}

DETECTED_TAILSCALE_IP=""
if command -v tailscale >/dev/null 2>&1; then
  DETECTED_TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || true)
fi

# ------------------------------------------------------------------------------
# 3. SPLASH SCREEN TUI
# ------------------------------------------------------------------------------
SPLASH_TEXT="Selamat datang di Wizard Instalasi Senandung!\n\n"
SPLASH_TEXT+="Senandung adalah pemutar musik self-hosted Spotify-like ultra-ringan\n"
SPLASH_TEXT+="dengan dukungan Hi-Res FLAC 24-bit/96kHz, sinkronisasi audio antar perangkat\n"
SPLASH_TEXT+="(Listen Together Party Mode), dan PWA Offline Player untuk ponsel.\n\n"
SPLASH_TEXT+="STB Terdeteksi: Amlogic S905X / ARM (DietPi OS)\n"
SPLASH_TEXT+="IP Lokal: ${DETECTED_LAN_IP}"
if [ -n "$DETECTED_TAILSCALE_IP" ]; then
  SPLASH_TEXT+="\nTailscale IP: ${DETECTED_TAILSCALE_IP}"
fi

tui_msgbox "🎵 SENANDUNG - SETUP WIZARD" "$SPLASH_TEXT"

# ------------------------------------------------------------------------------
# 4. MENU KONFIGURASI INTERAKTIF (SEBELUM INSTALASI)
# ------------------------------------------------------------------------------

# 1. Folder Musik (Autodetect + opsi ganti)
CONF_MUSIC_DIR=$(tui_input "1. LOKASI PENYIMPANAN MUSIK" \
  "Folder musik otomatis terdeteksi di bawah ini.\nBisa diarahkan ke harddisk eksternal atau flashdisk USB:" \
  "$AUTODETECTED_MUSIC_DIR")
CONF_MUSIC_DIR=${CONF_MUSIC_DIR:-$AUTODETECTED_MUSIC_DIR}

# 2. Port Web Server
CONF_PORT=$(tui_input "2. PORT WEB SERVER" \
  "Tentukan port HTTP untuk mengakses Web PWA Senandung dari browser HP / PC:" \
  "8989")
CONF_PORT=${CONF_PORT:-8989}

# 3. Kualitas Unduhan Default
CONF_QUALITY=$(tui_menu "3. FORMAT AUDIO DEFAULT" \
  "Pilih format kualitas audio utama untuk streaming & unduhan:" \
  "flac" "✨ Hi-Res Lossless FLAC 24-bit/96kHz (1411 kbps Audio Murni)" \
  "mp3"  "🎵 Standar MP3 320 kbps (Hemat Memori & Bandwidth)")
CONF_QUALITY=${CONF_QUALITY:-flac}

# 4. Nama Ruangan Utama (Default Party Room)
CONF_DEFAULT_ROOM=$(tui_input "4. NAMA RUANG UTAMA (PARTY ROOM)" \
  "Nama ruangan default untuk sinkronisasi audio bersama:" \
  "Ruang Tamu")
CONF_DEFAULT_ROOM=${CONF_DEFAULT_ROOM:-"Ruang Tamu"}

# 5. Batas CPU Quota (Cgroups)
CONF_CPU_QUOTA=$(tui_menu "5. BATAS CPU QUOTA (CGROUPS)" \
  "Batas beban CPU STB agar Immich & OS tidak overheat:" \
  "50%" "50% CPU Quota (Direkomendasikan untuk S905X / Odroid C2)" \
  "30%" "30% CPU Quota (Ultra-Dingin / Low Power)" \
  "75%" "75% CPU Quota (Performa Tinggi)")
CONF_CPU_QUOTA=${CONF_CPU_QUOTA:-"50%"}

# 6. Batas RAM Memory Limit (OOM Guard)
CONF_RAM_LIMIT=$(tui_menu "6. BATAS PENGGUNAAN MEMORI RAM" \
  "Batas maksimal konsumsi RAM sebelum OOM Protection aktif:" \
  "200M" "200 MB RAM (Sangat Aman & Hemat)" \
  "350M" "350 MB RAM (Standar untuk Library Besar >10.000 lagu)" \
  "unlimited" "Tanpa Batas RAM")
CONF_RAM_LIMIT=${CONF_RAM_LIMIT:-"200M"}

# 7. Penerapan Prioritas OS DietPi (Immich > Senandung > Kompic > Bumiayu)
CONF_PRIORITY="yes"
if tui_yesno "7. MANAJEMEN PRIORITAS OS DIETPI" \
  "Terapkan prioritas otomatis di Systemd?\n\nUrutan: Immich (Nice -5) > Senandung (Nice 0) > Kompic (Nice 10) > Bumiayu (Nice 15)\n\nFitur ini menjamin Immich tidak akan pernah lag."; then
  CONF_PRIORITY="yes"
else
  CONF_PRIORITY="no"
fi

# 8. Auto-Scan Folder Musik saat Boot
CONF_AUTOSCAN="yes"
if tui_yesno "8. AUTO-SCAN SAAT STARTUP" \
  "Apakah Senandung otomatis memindai file lagu baru di folder musik setiap kali STB menyala?"; then
  CONF_AUTOSCAN="yes"
else
  CONF_AUTOSCAN="no"
fi

# 9. Auto-Attach Sidecar Lyrics (.LRC)
CONF_AUTOLYRICS="yes"
if tui_yesno "9. SIDECAR LIRIK KARAOKE (.LRC)" \
  "Otomatis tautkan file lirik (.lrc) jika memiliki nama file yang sama dengan lagu?"; then
  CONF_AUTOLYRICS="yes"
else
  CONF_AUTOLYRICS="no"
fi

# 10. Konfigurasi Password Keamanan Akses LAN
CONF_PASSWORD=$(tui_input "10. KEAMANAN AKSES (OPTIONAL)" \
  "Kosongkan jika ingin Open LAN untuk keluarga (tanpa password),\natau ketik password jika ingin diproteksi:" \
  "")

# ------------------------------------------------------------------------------
# 5. REVIEW KONFIGURASI SEBELUM EKSEKUSI
# ------------------------------------------------------------------------------
REVIEW_TEXT="Harap tinjau ringkasan konfigurasi sebelum dipasang:\n\n"
REVIEW_TEXT+="* Folder Musik     : ${CONF_MUSIC_DIR}\n"
REVIEW_TEXT+="* Port Web PWA     : ${CONF_PORT}\n"
REVIEW_TEXT+="* Format Audio     : ${CONF_QUALITY^^}\n"
REVIEW_TEXT+="* Ruang Default    : ${CONF_DEFAULT_ROOM}\n"
REVIEW_TEXT+="* CPU Limit        : ${CONF_CPU_QUOTA}\n"
REVIEW_TEXT+="* RAM Limit        : ${CONF_RAM_LIMIT}\n"
REVIEW_TEXT+="* Prioritas OS     : ${CONF_PRIORITY}\n"
REVIEW_TEXT+="* Auto-Scan Boot   : ${CONF_AUTOSCAN}\n"
REVIEW_TEXT+="* Sidecar Lirik    : ${CONF_AUTOLYRICS}\n"
REVIEW_TEXT+="* Proteksi Sandi   : $([ -n "$CONF_PASSWORD" ] && echo "Aktif" || echo "Nonaktif (Open LAN)")\n\n"
REVIEW_TEXT+="Lanjutkan proses instalasi sekarang?"

if ! tui_yesno "KONFIRMASI INSTALASI" "$REVIEW_TEXT"; then
  echo -e "\n${YELLOW}[!] Instalasi dibatalkan oleh pengguna.${NC}"
  exit 0
fi

# ------------------------------------------------------------------------------
# 6. EKSEKUSI INSTALASI REAL
# ------------------------------------------------------------------------------
clear
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  Memulai Instalasi Senandung Berdasarkan Konfigurasi ${NC}"
echo -e "${GREEN}=====================================================${NC}\n"

# 1. Pasang dependensi
echo -e "${CYAN}[1/6] Memeriksa & memasang dependensi paket OS (ffmpeg, curl, ca-certificates)...${NC}"
apt-get update -qq
apt-get install -y -qq ffmpeg curl ca-certificates >/dev/null

# 2. Pasang yt-dlp binary standalone terbaru
echo -e "${CYAN}[2/6] Memasang yt-dlp standalone binary terbaru...${NC}"
if ! command -v yt-dlp >/dev/null 2>&1; then
  curl -sSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  chmod a+rx /usr/local/bin/yt-dlp
fi

# 3. Siapkan folder
echo -e "${CYAN}[3/6] Menyiapkan direktori aplikasi & musik di ${CONF_MUSIC_DIR}...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "/etc/${APP_NAME}"
mkdir -p "/mnt/dietpi_userdata/senandung/covers"
mkdir -p "$CONF_MUSIC_DIR"

# Buat file konfigurasi
cat <<EOF > "$CONFIG_FILE"
# Konfigurasi Senandung
PORT=${CONF_PORT}
DATA_DIR=/mnt/dietpi_userdata/senandung
MUSIC_DIR=${CONF_MUSIC_DIR}
DEFAULT_QUALITY=${CONF_QUALITY}
DEFAULT_ROOM="${CONF_DEFAULT_ROOM}"
AUTOSCAN=${CONF_AUTOSCAN}
AUTOLYRICS=${CONF_AUTOLYRICS}
PASSWORD="${CONF_PASSWORD}"
EOF

# 4. Pasang binary
echo -e "${CYAN}[4/6] Menyiapkan executable Senandung...${NC}"
ARCH=$(uname -m)
BIN_FOUND=0

if [ -f "./bin/senandung-linux-${ARCH}" ]; then
  cp "./bin/senandung-linux-${ARCH}" "${INSTALL_DIR}/senandung"
  chmod +x "${INSTALL_DIR}/senandung"
  BIN_FOUND=1
elif [ -f "./senandung" ]; then
  cp "./senandung" "${INSTALL_DIR}/senandung"
  chmod +x "${INSTALL_DIR}/senandung"
  BIN_FOUND=1
fi

if [ "$BIN_FOUND" -eq 0 ]; then
  if command -v go >/dev/null 2>&1; then
    echo "    Mengompilasi binary langsung di target OS..."
    go build -ldflags="-s -w" -o "${INSTALL_DIR}/senandung" .
    chmod +x "${INSTALL_DIR}/senandung"
  else
    echo "    Mengunduh binary pre-compiled untuk ${ARCH}..."
    curl -sSL -o "${INSTALL_DIR}/senandung" "https://raw.githubusercontent.com/faisalfa123/Senandung/main/bin/senandung-linux-${ARCH}" || true
    chmod +x "${INSTALL_DIR}/senandung"
  fi
fi

if [ ! -s "${INSTALL_DIR}/senandung" ]; then
  echo -e "${RED}[ERROR] Gagal memasang binary ${INSTALL_DIR}/senandung!${NC}"
  exit 1
fi

# 5. Konfigurasi Systemd Unit
echo -e "${CYAN}[5/6] Menerapkan Systemd Service & Cgroups (${CONF_CPU_QUOTA} CPU, ${CONF_RAM_LIMIT} RAM)...${NC}"
cat <<EOF > "$SYSTEMD_FILE"
[Unit]
Description=Senandung - Ultra-Lightweight Spotify-like PWA with Audio Sync
After=network.target immich.service dompetmungil.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/senandung -port ${CONF_PORT} -data-dir /mnt/dietpi_userdata/senandung -music-dir ${CONF_MUSIC_DIR}
Restart=always
RestartSec=5

# Isolasi Resource Cgroups
Nice=0
CPUSchedulingPolicy=other
CPUQuota=${CONF_CPU_QUOTA}
EOF

if [ "$CONF_RAM_LIMIT" != "unlimited" ]; then
cat <<EOF >> "$SYSTEMD_FILE"
MemoryHigh=${CONF_RAM_LIMIT}
MemoryMax=${CONF_RAM_LIMIT}
EOF
fi

cat <<EOF >> "$SYSTEMD_FILE"
ProtectSystem=full
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable senandung >/dev/null 2>&1
systemctl restart senandung >/dev/null 2>&1

# 6. Terapkan Skema Prioritas OS DietPi jika disetujui
if [ "$CONF_PRIORITY" == "yes" ] && [ -f "./scripts/apply-priority.sh" ]; then
  echo -e "${CYAN}[6/6] Menerapkan hierarki prioritas DietPi (Immich > Senandung > Kompic > Bumiayu)...${NC}"
  bash ./scripts/apply-priority.sh >/dev/null 2>&1 || true
else
  echo -e "${CYAN}[6/6] Melewati penyesuaian prioritas DietPi.${NC}"
fi

# ------------------------------------------------------------------------------
# 7. SUKSES & RINGKASAN AKSES
# ------------------------------------------------------------------------------
FINISH_MSG="Selamat! Senandung telah berhasil dipasang & aktif.\n\n"
FINISH_MSG+="Akses Web PWA:\n"
FINISH_MSG+="* Jaringan LAN Lokal : http://${DETECTED_LAN_IP}:${CONF_PORT}\n"
if [ -n "$DETECTED_TAILSCALE_IP" ]; then
  FINISH_MSG+="* Tailscale Remote   : http://${DETECTED_TAILSCALE_IP}:${CONF_PORT}\n"
fi
FINISH_MSG+="\nInformasi Sistem:\n"
FINISH_MSG+="* Folder Musik       : ${CONF_MUSIC_DIR}\n"
FINISH_MSG+="* Kualitas Default   : ${CONF_QUALITY^^}\n"
FINISH_MSG+="* CPU Quota          : ${CONF_CPU_QUOTA}\n"
FINISH_MSG+="* Status Service     : systemctl status senandung\n\n"
FINISH_MSG+="Buka alamat URL di atas dari browser ponsel untuk mulai menikmati musik!"

tui_msgbox "🎉 INSTALASI SELESAI" "$FINISH_MSG"

clear
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  ✔ SENANDUNG BERHASIL DIPASANG & BERJALAN!          ${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo -e "  Akses Lokal LAN : ${BOLD}http://${DETECTED_LAN_IP}:${CONF_PORT}${NC}"
if [ -n "$DETECTED_TAILSCALE_IP" ]; then
  echo -e "  Akses Tailscale : ${BOLD}http://${DETECTED_TAILSCALE_IP}:${CONF_PORT}${NC}"
fi
echo -e "  Folder Musik    : ${CONF_MUSIC_DIR}"
echo -e "  Cek Log Service : journalctl -u senandung -f\n"
