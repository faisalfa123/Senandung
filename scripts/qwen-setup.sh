#!/bin/bash
set -e

echo "🚀 Menyiapkan Lingkungan Senandung di Qwen Coder Cloud..."

# 1. Update package & dependensi audio jika user memiliki akses root/sudo
if [ "$(id -u)" -eq 0 ] 2>/dev/null; then
  echo "📦 Memasang ffmpeg, curl & dependensi (root)..."
  apt-get update -qq && apt-get install -y -qq ffmpeg curl ca-certificates git || true
elif command -v sudo >/dev/null 2>&1; then
  echo "📦 Memasang ffmpeg, curl & dependensi (sudo)..."
  sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg curl ca-certificates git || true
fi

# 2. Pasang yt-dlp jika belum ada
if ! command -v yt-dlp >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  echo "📥 Mengunduh binary yt-dlp..."
  curl -sSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$HOME/.local/bin/yt-dlp" || true
  chmod +x "$HOME/.local/bin/yt-dlp" || true
  export PATH="$HOME/.local/bin:$PATH"
fi

# 3. Siapkan struktur direktori data lokal
mkdir -p ./data/music ./data/covers ./bin

# 4. Unduh dependensi Go & verifikasi build
if command -v go >/dev/null 2>&1; then
  echo "🔨 Memeriksa dependensi Go..."
  go mod download
  CGO_ENABLED=0 go build -ldflags="-s -w" -o ./bin/senandung-dev .
  echo "✅ Build biner Senandung dev berhasil!"
fi

echo "✨ Lingkungan Qwen Coder siap digunakan!"
