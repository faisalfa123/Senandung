# Aturan Rilis & Pembaruan Senandung (Release & Update Rules)

Setiap kali merilis versi baru (Canary / Nightly Dev / Beta Candidate / Stable), ikuti langkah wajib berikut agar aplikasi Senandung dan GitHub Releases selalu sinkron dan terbaca oleh sistem auto-update:

1. **Sinkronisasi Versi di Semua File**:
   - `Cargo.toml` -> `version = "<X.Y.Z>"` (atau `<X.Y.Z>-beta.N`)
   - `web/index.html` -> cache key `senandung-v<X.Y.Z>`, query string `style.css?v=<X.Y.Z>`, `app.js?v=<X.Y.Z>`, dan label `.ytm-brand-remake-tag`
   - `RELEASE_NOTES.md` -> catat changelog lengkap dengan tanggal rilis dan status rilis
2. **Verifikasi Build & Test**:
   - Jalankan `cargo test` dan pastikan seluruh unit & integration test lulus (`0 failed`).
3. **Commit, Tag, & Push**:
   - Commit perubahan dengan format `release: v<X.Y.Z> (<Channel>)`
   - Buat annotated tag: `git tag -a v<X.Y.Z> -m "Senandung v<X.Y.Z>"`
   - Push ke GitHub: `git push origin main --tags`
4. **Publikasikan GitHub Release**:
   - Jalankan `gh release create v<X.Y.Z> --title "Senandung v<X.Y.Z>" --notes-file RELEASE_NOTES.md` (tambahkan `--prerelease` untuk Nightly/Beta jika belum siap jadi `Latest`).
   - Pastikan `.github/workflows/build.yml` tidak meng-hardcode `tag_name` versi lama; gunakan `${{ startsWith(github.ref, 'refs/tags/v') && github.ref_name || 'v<X.Y.Z>' }}` agar asset binary (`senandung-linux-arm64`, `checksums.txt`, dll.) otomatis terunggah ke rilis terbaru.
