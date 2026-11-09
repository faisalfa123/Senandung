#!/usr/bin/env bash
# ==============================================================================
# Installer Otomatis Senandung untuk DietPi (STB HG680P / Odroid C2 ARM64 & ARMv7)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  🎵 Installer Senandung - Ultra-Light Spotify-like   ${NC}"
echo -e "${GREEN}  DietPi STB HG680P / Odroid C2 (Amlogic S905X)       ${NC}"
echo -e "${GREEN}=====================================================${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[-] Harap jalankan script ini sebagai root (sudo bash install.sh)${NC}"
  exit 1
fi

INSTALL_DIR="/opt/senandung"
DATA_DIR="/mnt/dietpi_userdata/senandung"
MUSIC_DIR="/mnt/dietpi_userdata/music"

echo -e "${BLUE}[1/5] Memeriksa & memasang dependensi paket OS (ffmpeg, curl)...${NC}"
apt-get update -y
apt-get install -y ffmpeg curl ca-certificates

echo -e "${BLUE}[2/5] Memasang yt-dlp binary standalone terbaru...${NC}"
if ! command -v yt-dlp &> /dev/null; then
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  chmod a+rx /usr/local/bin/yt-dlp
  echo "    yt-dlp berhasil dipasang di /usr/local/bin/yt-dlp"
else
  echo "    yt-dlp sudah terpasang."
fi

echo -e "${BLUE}[3/5] Menyiapkan direktori aplikasi & penyimpanan musik...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR/covers"
mkdir -p "$MUSIC_DIR"

# Deteksi arsitektur CPU dan salin binary yang sesuai dari bin/ atau root
ARCH=$(uname -m)
COPIED=0

if [ -f "./senandung" ]; then
  cp "./senandung" "$INSTALL_DIR/senandung"
  chmod +x "$INSTALL_DIR/senandung"
  COPIED=1
elif [ "$ARCH" = "aarch64" ] && [ -f "./bin/senandung-linux-aarch64" ]; then
  echo "    Terdeteksi arsitektur aarch64 (ARM64), memasang bin/senandung-linux-aarch64..."
  cp "./bin/senandung-linux-aarch64" "$INSTALL_DIR/senandung"
  chmod +x "$INSTALL_DIR/senandung"
  COPIED=1
elif { [ "$ARCH" = "armv7l" ] || [ "$ARCH" = "armv6l" ] || [ "$ARCH" = "armhf" ]; } && [ -f "./bin/senandung-linux-armv7l" ]; then
  echo "    Terdeteksi arsitektur $ARCH (ARM 32-bit), memasang bin/senandung-linux-armv7l..."
  cp "./bin/senandung-linux-armv7l" "$INSTALL_DIR/senandung"
  chmod +x "$INSTALL_DIR/senandung"
  COPIED=1
elif [ "$ARCH" = "x86_64" ] && [ -f "./bin/senandung-linux-x86_64" ]; then
  echo "    Terdeteksi arsitektur x86_64 (PC/Server), memasang bin/senandung-linux-x86_64..."
  cp "./bin/senandung-linux-x86_64" "$INSTALL_DIR/senandung"
  chmod +x "$INSTALL_DIR/senandung"
  COPIED=1
elif [ -f "./main.go" ]; then
  echo "    Mengompilasi binary langsung di target OS..."
  if command -v go &> /dev/null; then
    go build -ldflags="-s -w" -o "$INSTALL_DIR/senandung" .
    COPIED=1
  else
    echo -e "${RED}[!] Go compiler tidak ditemukan dan binary precompiled tidak tersedia.${NC}"
    exit 1
  fi
fi

if [ "$COPIED" -eq 0 ]; then
  echo -e "${RED}[!] Gagal menemukan binary yang cocok untuk arsitektur $ARCH.${NC}"
  exit 1
fi

echo -e "${BLUE}[4/5] Memasang Service Systemd...${NC}"
cp ./scripts/senandung.service /etc/systemd/system/senandung.service
systemctl daemon-reload
systemctl enable senandung
systemctl restart senandung

echo -e "${BLUE}[5/5] Menerapkan pengaturan prioritas cgroups & Nice...${NC}"
if [ -f "./scripts/apply-priority.sh" ]; then
  bash ./scripts/apply-priority.sh
fi

IP_ADDR=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}  ✔ Senandung Berhasil Dipasang & Berjalan!          ${NC}"
echo -e "${GREEN}  Akses Web PWA: http://${IP_ADDR}:8989              ${NC}"
echo -e "${GREEN}  Folder Musik: ${MUSIC_DIR}                         ${NC}"
echo -e "${GREEN}=====================================================${NC}"
