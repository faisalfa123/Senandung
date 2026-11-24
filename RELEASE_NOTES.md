# Release Notes — Senandung v3.2.3-beta-candidate (Nightly Dev)

**Tanggal Rilis:** 24 November 2026  
**Versi Crate / API:** `3.2.2`  
**Branch:** `nightly-dev`  
**Status:** Beta Candidate (`v3.2.3-beta-candidate`)

## Ringkasan Perubahan (Changelog)

### 1. Perbaikan Tampilan & Responsivitas Mobile
- Tata letak baris lagu di mobile diperbaiki (`flex-wrap`, `min-width: 0`) agar judul lagu, artis, dan metadata tidak terpotong.
- Semua tombol interaktif di mobile kini memiliki tap target minimal **44px**.

### 2. Pramuat YouTube & Panel Antrean Unduhan (Tab Eksplorasi)
- Menambahkan tombol **Antrian** dengan badge jumlah unduhan aktif di pojok kanan atas tab *Eksplorasi*.
- Panel antrean menampilkan lagu yang sedang diunduh beserta progresnya dan daftar antrean menunggu.

### 3. Sinkronisasi Detik Audio Real-Time di Mode Room
- Menerapkan *micro-rate pitch adjustment* (`playbackRate` 0.98–1.02) untuk drift kecil (50–300ms) dan *seamless seek* untuk drift > 300ms agar detik pemutaran berjalan presisi bersama di semua perangkat.

### 4. Perbaikan Thumbnail Desktop
- Memperbaiki *aspect ratio* container thumbnail di desktop (`aspect-ratio: 1 / 1`, `object-fit: cover`) agar cover tidak terdistorsi.

### 5. Perbaikan Pengaturan & Metadata di Mobile
- Memperbaiki tampilan header & metadata perangkat di mobile agar nama lagu dan info perangkat tetap terlihat jelas.

### 6. Ikon Baru: Flat Awan dengan Tombol Play
- Mengganti logo header navbar dan favicon menjadi ikon flat awan dengan tombol *Play* di tengahnya.

### 7. Now Playing Bottom Sheet (Lirik & Antrean)
- Mengetuk bar pemutar bawah membuka *Now Playing Bottom Sheet* dengan artwork besar, scrubber, kontrol penuh, tab **Antrean Lagu**, dan tab **Lirik & Detail** (auto-fetch dari LRCLIB + pencarian lirik manual).

### 8. Sentuhan Animasi Halus
- Animasi *slide-up* pada *Now Playing Bottom Sheet*, animasi equalizer mini, serta efek transisi halus pada kartu dan tombol.

### 9. Kontrol Lock Screen / Media Session (iOS & Android)
- Menonaktifkan `seekbackward` / `seekforward` (+/- 10 detik) agar lock screen menampilkan **Previous Track** dan **Next Track**, serta mendukung kontrol *Shuffle* dan *Repeat*.
