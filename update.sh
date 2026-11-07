#!/usr/bin/env bash
# ==============================================================================
# SENANDUNG AUTO-UPDATE SCRIPT
# Menarik pembaruan dari GitHub, menyalin binary & web assets, lalu restart service
# ==============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Harap jalankan script update ini dengan sudo:${NC}"
  echo -e "${YELLOW}  sudo bash update.sh${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}=====================================================${NC}"
echo -e "${CYAN}  🔄 MEMULAI AUTO-UPDATE SENANDUNG                   ${NC}"
echo -e "${CYAN}=====================================================${NC}"

echo -e "\n${YELLOW}[1/4] Menarik pembaruan kode terbaru dari git...${NC}"
git fetch --all
git reset --hard origin/main

INSTALL_DIR="/opt/senandung"
mkdir -p "${INSTALL_DIR}"

echo -e "\n${YELLOW}[2/4] Menyinkronkan binary & executable untuk arsitektur STB...${NC}"
RAW_ARCH=$(uname -m)
TARGET_ARCH="$RAW_ARCH"
if [ "$RAW_ARCH" = "aarch64" ] || [ "$RAW_ARCH" = "arm64" ]; then
  TARGET_ARCH="aarch64"
elif [ "$RAW_ARCH" = "armv7l" ] || [ "$RAW_ARCH" = "armhf" ] || [ "$RAW_ARCH" = "arm" ]; then
  TARGET_ARCH="armv7l"
elif [ "$RAW_ARCH" = "x86_64" ] || [ "$RAW_ARCH" = "amd64" ]; then
  TARGET_ARCH="x86_64"
fi

BIN_SRC="${SCRIPT_DIR}/bin/senandung-linux-${TARGET_ARCH}"
if [ -f "$BIN_SRC" ]; then
  echo -e "    * Menautkan binary: senandung-linux-${TARGET_ARCH}"
  cp -f "$BIN_SRC" "${INSTALL_DIR}/senandung"
  chmod +x "${INSTALL_DIR}/senandung"
fi

echo -e "\n${YELLOW}[3/4] Menautkan aset web PWA (/opt/senandung/web -> ${SCRIPT_DIR}/web)...${NC}"
if [ -d "${SCRIPT_DIR}/web" ]; then
  rm -rf "${INSTALL_DIR}/web"
  ln -sfn "${SCRIPT_DIR}/web" "${INSTALL_DIR}/web"
  echo -e "    * Symlink aset web aktif: Pembaruan git pull langsung terlihat seketika!"
fi

echo -e "\n${YELLOW}[4/4] Merestart service Senandung...${NC}"
systemctl restart senandung

echo -e "\n${GREEN}=====================================================${NC}"
echo -e "${GREEN}  ✔ SENANDUNG BERHASIL DIPERBARUI & BERJALAN!       ${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo -e "  Silakan refresh browser HP Anda (F5 / tarik ke bawah)!"
