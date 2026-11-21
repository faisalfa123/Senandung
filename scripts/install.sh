#!/bin/bash
set -euo pipefail

# ==============================================================================
# SENANDUNG v3.0.1-nightly-dev (Rust) — Native DietPi / Linux Installer
# Target Hardware: STB HG680P (Amlogic S905X) / Odroid C2 / x86_64
# ==============================================================================

REPO="faisalfa123/Senandung"
VERSION="v3.0.1-nightly-dev"
PORT="${PORT:-8989}"
DATA_DIR="${DATA_DIR:-/var/lib/senandung}"
CACHE_DIR="${CACHE_DIR:-/var/cache/senandung}"
LOG_DIR="${LOG_DIR:-/var/log/senandung}"
PRIMARY_MUSIC_DIR="${SENANDUNG_MUSIC_DIR:-/mnt/hdd1/senandung/tracks}"

echo "🎵 Memulai instalasi Senandung ${VERSION} (Rust Edition)..."

# 1. Deteksi arsitektur
ARCH=$(uname -m)
case "$ARCH" in
    aarch64|arm64)
        BINARY="senandung-linux-arm64"
        ;;
    armv7l|armv7)
        BINARY="senandung-linux-armv7l"
        ;;
    x86_64|amd64)
        BINARY="senandung-linux-x86_64"
        ;;
    *)
        echo "❌ Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

echo "✅ Arsitektur terdeteksi: ${ARCH} -> target binary: ${BINARY}"

mkdir -p bin

# 2. Cari binary lokal, download pre-compiled dari GitHub Releases, atau compile dari source
if [ -f "target/release/senandung" ] && [ ! -f "bin/$BINARY" ]; then
    cp target/release/senandung "bin/$BINARY"
fi

if [ ! -f "bin/$BINARY" ]; then
    echo "⚠️  Binary lokal bin/$BINARY belum tersedia."
    echo -n "Apakah Anda ingin compile langsung dari source Rust sekarang? (y/n) [default: n]: "
    read -r response || response="n"
    if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
        if ! command -v cargo >/dev/null 2>&1; then
            echo "❌ Toolchain Rust (cargo) tidak ditemukan. Silakan install rustup terlebih dahulu."
            exit 1
        fi
        echo "🦀 Mengompilasi Senandung dengan profil release (LTO + Strip)..."
        cargo build --release
        cp target/release/senandung "bin/$BINARY"
    else
        RELEASE_URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY}"
        echo "⬇️  Mengunduh binary pre-compiled dari ${RELEASE_URL}..."
        if command -v curl >/dev/null 2>&1; then
            curl -fL --retry 2 -o "bin/$BINARY" "$RELEASE_URL"
        elif command -v wget >/dev/null 2>&1; then
            wget -qO "bin/$BINARY" "$RELEASE_URL"
        else
            echo "❌ curl atau wget tidak ditemukan."
            exit 1
        fi
    fi
fi

# 3. Install binary ke /usr/local/bin/senandung
echo "📦 Memasang binary ke /usr/local/bin/senandung..."
sudo cp "bin/$BINARY" /usr/local/bin/senandung
sudo chmod +x /usr/local/bin/senandung

# 4. Buat user sistem & folder data, cache, log, serta fallback musik
if ! id -u senandung >/dev/null 2>&1; then
    echo "👤 Membuat system user 'senandung'..."
    sudo useradd --system --no-create-home --shell /usr/sbin/nologin senandung || true
fi

echo "📁 Menyiapkan direktori sistem..."
sudo mkdir -p "$DATA_DIR/tracks"
sudo mkdir -p "$CACHE_DIR/thumbnails"
sudo mkdir -p "$LOG_DIR"

if [ -d "/mnt/hdd1" ]; then
    sudo mkdir -p "$PRIMARY_MUSIC_DIR" || true
    sudo chown -R senandung:senandung "/mnt/hdd1/senandung" 2>/dev/null || true
fi

sudo chown -R senandung:senandung "$DATA_DIR" "$CACHE_DIR" "$LOG_DIR" 2>/dev/null || true

# 5. Buat systemd service
echo "⚙️  Mengonfigurasi systemd service (/etc/systemd/system/senandung.service)..."
sudo tee /etc/systemd/system/senandung.service > /dev/null <<EOF
[Unit]
Description=Senandung Music Server (Rust v3.0.1-nightly-dev)
After=network.target

[Service]
Type=simple
User=senandung
Environment="PORT=${PORT}"
Environment="DATA_DIR=${DATA_DIR}"
Environment="SENANDUNG_MUSIC_DIR=${PRIMARY_MUSIC_DIR}"
Environment="RUST_LOG=warn"
ExecStart=/usr/local/bin/senandung --port ${PORT} --data-dir ${DATA_DIR} --music-dir ${PRIMARY_MUSIC_DIR}
Restart=on-failure
RestartSec=5
Nice=0
IOSchedulingClass=best-effort
LimitNOFILE=65536
MemoryMax=48M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
EOF

# 6. Enable dan start service
echo "🚀 Mengaktifkan dan menjalankan layanan senandung..."
sudo systemctl daemon-reload
sudo systemctl enable senandung
sudo systemctl restart senandung

# 7. Jalankan registrasi Mastermind jika script tersedia
if [ -x "scripts/mastermind.sh" ]; then
    ./scripts/mastermind.sh || true
fi

# 8. Tampilkan URL akses lokal dan Tailscale
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "${LOCAL_IP:-}" ]; then
    LOCAL_IP="127.0.0.1"
fi
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "not configured")

echo ""
echo "=========================================================="
echo "✅ Instalasi Senandung ${VERSION} berhasil!"
echo "🌐 Akses Lokal     : http://${LOCAL_IP}:${PORT}"
if [ "$TAILSCALE_IP" != "not configured" ] && [ -n "$TAILSCALE_IP" ]; then
    echo "🌐 Akses Tailscale : http://${TAILSCALE_IP}:${PORT}"
fi
echo "💾 Data & Sled DB  : ${DATA_DIR}/state.db"
echo "🎵 Penyimpanan MP3 : ${PRIMARY_MUSIC_DIR} (Auto-Reroute ke ${DATA_DIR}/tracks jika HDD lepas)"
echo "=========================================================="
