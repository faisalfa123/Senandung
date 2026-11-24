# Release Notes — Senandung v3.2.2-beta.1 (Nightly Dev - Beta Candidate)

**Tanggal Rilis:** 24 November 2026  
**Status:** Nightly Dev — Beta Candidate (`v3.2.2-beta.1`)

## Ringkasan Perubahan (Changelog)

### Perbaikan & Fitur Baru
1. **Perbaikan Tampilan Mobile (`Semua Lagu` & `History`)**
   - Memperbaiki layout baris lagu di mode mobile agar judul lagu dan nama artis tampil penuh dan tidak terpotong menjadi 1 huruf.
   - Memperbaiki header `History` di mobile agar tombol *Bersihkan History* dan navigasi tidak bertumpuk.
2. **Antrian Download di Tab Eksplorasi**
   - Menambahkan tombol & panel **Antrian Unduhan STB** khusus di pojok kanan atas tab *Eksplorasi* untuk memantau lagu yang sedang diunduh dan antrian aktif secara real-time.
3. **Sinkronisasi Room Mode Hingga Detik Berjalan Bersama**
   - Menghapus batas maksimal 10 detik pada `lateSec` saat perangkat baru bergabung ke Room yang sedang memutar lagu.
   - Menambahkan *continuous drift-correction* setiap 2 detik agar posisi detik pemutaran antar perangkat di Room tetap sinkron.
4. **Ikon Baru: Flat Cloud + Play Button**
   - Mengganti ikon aplikasi (favicon & header brand) menjadi ikon flat awan dengan tombol *Play* di tengahnya.
5. **Now Playing Full Modal (Ketuk Bar Musik Bawah)**
   - Mengetuk area lagu pada bar pemutar bawah kini membuka tampilan *Now Playing* penuh dengan kontrol lengkap (*Shuffle*, *Previous*, *Play/Pause*, *Next*, *Repeat*), progress bar interaktif, detail lagu, dan panel lirik.
6. **Animasi Mikro Halus**
   - Menambahkan transisi halus pada kartu media, tombol, dan animasi *sheet* pada modal *Now Playing* agar antarmuka terasa lebih hidup.
7. **Kontrol Lock Screen & Notifikasi (iOS & Android)**
   - Menonaktifkan handler `seekbackward` / `seekforward` (+/- 10 detik) pada MediaSession API sehingga sistem operasi menampilkan tombol **Previous** dan **Next** di lock screen & notifikasi, dilengkapi kontrol *Shuffle* dan *Repeat* di pemutar.
