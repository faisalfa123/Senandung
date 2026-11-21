# 🤖 ANTIGRAVITY EXECUTION RULES

## 🎯 Core Principles
1. **Token Efficiency**: Gunakan `PROJECT_MAP.md` untuk navigasi, jangan scan repo
2. **Direct Execution**: Tulis kode langsung, jangan tanya "file mana yang harus diedit?"
3. **Hardware-Aware**: Target STB HG680P/Odroid C2 — ringan, stabil, zero-latency
4. **Language**: Penjelasan = Bahasa Indonesia, Kode = Bahasa Inggris

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
- RAM usage <25MB saat idle
- UI load <50ms (kunjungan ke-2)
- Zero crash, zero segfault
- Graceful shutdown tanpa data loss
