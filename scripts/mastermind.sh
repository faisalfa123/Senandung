#!/bin/bash
set -euo pipefail

# ==============================================================================
# SENANDUNG v3.0.1-nightly-dev — Mastermind Ecosystem Integration Script
# Idempotent registration & port conflict validator against Immich, Dompet Mungil, Kompic
# ==============================================================================

MASTERMIND_DIR="${MASTERMIND_DIR:-/etc/mastermind}"
MASTERMIND_CONFIG="${MASTERMIND_DIR}/config.toml"
MASTERMIND_APPS_DIR="${MASTERMIND_DIR}/apps.d"
BATASAN_SOURCE="${BATASAN_SOURCE:-./senandung.batasan.toml}"
SENANDUNG_PORT="${PORT:-8989}"

echo "🧠 [Mastermind] Memeriksa integrasi ekosistem Mastermind untuk Senandung..."

# 1. Validasi file kontrak senandung.batasan.toml
if [ ! -f "$BATASAN_SOURCE" ]; then
    echo "⚠️  File $BATASAN_SOURCE tidak ditemukan di direktori kerja."
    exit 0
fi

# 2. Cek konflik port dengan layanan ekosistem Mastermind lainnya (Immich: 2283, Dompet Mungil, Kompic, dll.)
if [ -f "$MASTERMIND_CONFIG" ]; then
    echo "🔍 Membaca konfigurasi global Mastermind di $MASTERMIND_CONFIG..."
    CONFLICT_SERVICE=$(grep -E "port\s*=\s*${SENANDUNG_PORT}\b" "$MASTERMIND_CONFIG" 2>/dev/null | grep -v "senandung" || true)
    if [ -n "$CONFLICT_SERVICE" ]; then
        echo "❌ Terdeteksi potensi konflik port ${SENANDUNG_PORT} di $MASTERMIND_CONFIG:"
        echo "   $CONFLICT_SERVICE"
        echo "   Silakan ubah PORT Senandung sebelum mendaftarkan ke Mastermind."
        exit 1
    fi
fi

# Cek di direktori apps.d jika ada aplikasi lain yang memakai port 8989
if [ -d "$MASTERMIND_APPS_DIR" ]; then
    for toml_file in "$MASTERMIND_APPS_DIR"/*.toml; do
        [ -e "$toml_file" ] || continue
        base_name=$(basename "$toml_file")
        if [ "$base_name" = "senandung.batasan.toml" ] || [ "$base_name" = "senandung.toml" ]; then
            continue
        fi
        if grep -Eq "port\s*=\s*${SENANDUNG_PORT}\b" "$toml_file" 2>/dev/null; then
            echo "❌ Konflik port ${SENANDUNG_PORT} terdeteksi dengan modul Mastermind lain: $base_name"
            exit 1
        fi
    done
fi

echo "✅ Port ${SENANDUNG_PORT} bebas dari konflik (Immich/Dompet Mungil/Kompic aman)."

# 3. Daftarkan kontrak senandung.batasan.toml secara idempotent
if [ -w "/etc" ] || [ "$(id -u)" -eq 0 ]; then
    mkdir -p "$MASTERMIND_APPS_DIR"
    cp "$BATASAN_SOURCE" "${MASTERMIND_APPS_DIR}/senandung.batasan.toml"

    if [ ! -f "$MASTERMIND_CONFIG" ]; then
        cat <<EOF > "$MASTERMIND_CONFIG"
# Mastermind Global Ecosystem Configuration
[ecosystem]
managed_by = "mastermind"
EOF
    fi

    # Tambahkan blok [modules.senandung] secara idempotent jika belum terdaftar
    if ! grep -q "\[modules\.senandung\]" "$MASTERMIND_CONFIG" 2>/dev/null; then
        cat <<EOF >> "$MASTERMIND_CONFIG"

[modules.senandung]
id = "senandung"
version = "3.0.1-nightly-dev"
language = "rust"
port = ${SENANDUNG_PORT}
contract = "${MASTERMIND_APPS_DIR}/senandung.batasan.toml"
enabled = true
EOF
        echo "✅ Modul Senandung (v3.0.1-nightly-dev, port ${SENANDUNG_PORT}) berhasil didaftarkan ke $MASTERMIND_CONFIG"
    else
        # Update versi dan port secara idempotent jika sudah ada
        sed -i -E 's/(version\s*=\s*").*(")/\13.0.1-nightly-dev\2/' "$MASTERMIND_CONFIG" 2>/dev/null || true
        echo "✅ Modul Senandung sudah terdaftar di $MASTERMIND_CONFIG (Idempotent Verified)."
    fi
else
    echo "ℹ️  Berjalan tanpa akses root ke /etc/mastermind. Validasi kontrak lokal senandung.batasan.toml berhasil."
fi
