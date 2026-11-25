# 🤖 ANTIGRAVITY EXECUTION RULES

## 🎯 Core Principles
1. **Token Efficiency (Strict Targeting)**: Gunakan tabel **Meta-Map** di bawah untuk langsung menuju direktori/file target. **DILARANG** scan seluruh repo (`find`, `grep -r`, atau membaca file di luar target) kecuali simbol yang dicari tidak ada di file target.
2. **Direct Execution**: Tulis kode langsung, jangan tanya "file mana yang harus diedit?"
3. **Hardware-Aware**: Target STB HG680P/Odroid C2 — ringan, stabil, zero-latency
4. **Language**: Penjelasan = Bahasa Indonesia, Kode = Bahasa Inggris

## 🗺️ Meta-Map: Fungsionalitas -> Target Direktori & File

| Fungsionalitas / Area | Target Direktori & File Kunci |
|---|---|
| **Entry Point & Router** | `src/main.rs` |
| **REST API & Stream** | `src/server/api.rs` |
| **Live Room, WS & NTP Sync** | `src/server/ws.rs`, `src/core/state.rs`, `src/core/sync.rs` |
| **YouTube Downloader** | `src/server/downloader.rs` |
| **Static & Disk Cache** | `src/server/static_cache.rs`, `src/core/cache.rs` |
| **Database (Sled)** | `src/core/db.rs` |
| **Audio Engine (Dormant)** | `src/core/audio_engine.rs` |
| **Logging & Rotation** | `src/logging/mod.rs` |
| **System, Storage & HDD** | `src/utils/system.rs` |
| **Frontend UI & PWA** | `web/index.html`, `web/app.js`, `web/style.css`, `web/sw.js` |
| **Tests** | `tests/` |
| **Scripts & Config** | `scripts/`, `Cargo.toml`, `senandung.batasan.toml` |

> **Aturan Update Map**: Jika menambah/memindahkan file atau fitur baru, perbarui tabel di atas di akhir sesi.

## 📋 Execution Protocol
- Kerjakan **SATU FASE** per sesi
- Tunggu konfirmasi user sebelum lanjut fase berikutnya
- Validasi setiap fase sebelum selesai

## 🚫 Absolute Don'ts
- JANGAN gunakan NPM/Node.js/Docker di server
- JANGAN hard cache audio stream di RAM server
- JANGAN biarkan log melebihi 2MB
- JANGAN panic saat disk penuh — fallback ke stderr

## ✅ Quality Standards
- RAM usage <25MB saat idle, CPU <30% saat idle/streaming
- Binary release **< 15 MB** (feature `local-audio` tetap dormant secara default)
- UI load <50ms (kunjungan ke-2)
- Zero crash, zero segfault, graceful shutdown tanpa data loss

## 🚀 Release & Version Sync Rules
- **Branch**: `main` (rilis stabil `x.0.y`) | `nightly-dev` (pengembangan aktif `x.1.y` / `x.2.y`)
- **Sinkronisasi 4 File Wajib** setiap update versi:
  1. `Cargo.toml` (`version`)
  2. `src/server/api.rs` (`HealthResponse.version`)
  3. `web/index.html` (cache key, `?v=...`, badge versi)
  4. `web/sw.js` (`CACHE_NAME` & `ASSETS_TO_CACHE`)
- **CI/CD**: Jangan hardcode `tag_name` versi lama di `.github/workflows/build.yml` (gunakan ref dinamis).
- **Verifikasi Wajib**: `cargo test` dan `cargo build --release` sebelum commit/push, serta update `RELEASE_NOTES.md`.
