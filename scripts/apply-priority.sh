#!/usr/bin/env bash
# ==============================================================================
# Senandung - Setup Prioritas Systemd OS untuk STB HG680P / Odroid C2 (DietPi)
# Urutan Prioritas:
# 1. Immich          (Nice -5,  CPUQuota 150%, IO High)
# 2. Senandung       (Nice 0,   CPUQuota 50%,  IO Normal)
# 3. Dompet Mungil   (Nice 0,   CPUQuota 30%,  IO Normal)
# 4. Kompic          (Nice 10,  CPUQuota 30%,  IO Idle)
# 5. Bumiayu         (Nice 15,  CPUQuota 20%,  IO Idle)
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "[-] Harap jalankan script ini sebagai root (sudo bash apply-priority.sh)"
  exit 1
fi

echo "[+] Menerapkan aturan cgroups & Nice prioritas di DietPi..."

apply_override() {
  local service_name="$1"
  local nice_val="$2"
  local cpu_quota="$3"
  local io_class="$4"

  local dropin_dir="/etc/systemd/system/${service_name}.d"
  mkdir -p "$dropin_dir"

  cat <<EOF > "${dropin_dir}/priority.conf"
[Service]
Nice=${nice_val}
CPUQuota=${cpu_quota}
IOSchedulingClass=${io_class}
EOF
  echo "    * Override diterapkan untuk ${service_name} (Nice: ${nice_val}, CPUQuota: ${cpu_quota})"
}

# 1. Immich
apply_override "immich" "-5" "150%" "best-effort"

# 2. Senandung
apply_override "senandung" "0" "50%" "best-effort"

# 3. Dompet Mungil
apply_override "dompetmungil" "0" "30%" "best-effort"

# 4. Kompic
apply_override "kompic" "10" "30%" "idle"

# 5. Bumiayu TUI / DE
apply_override "bumiayu" "15" "20%" "idle"

echo "[+] Melakukan daemon-reload systemd..."
systemctl daemon-reload

echo "[✔] Berhasil! Urutan prioritas OS telah dikonfigurasi:"
echo "    Immich > Senandung + Dompet Mungil > Kompic > Bumiayu"
