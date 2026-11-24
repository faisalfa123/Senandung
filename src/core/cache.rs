use std::fs;
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use anyhow::{anyhow, Context, Result};
use lru::LruCache;
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Debug, Clone)]
pub struct CachedThumbnailEntry {
    pub path: PathBuf,
    pub size_bytes: u64,
    pub last_modified_http: String,
    pub etag: String,
}

/// Tier 3: LRU Disk Cache for dynamic thumbnails/artwork.
/// Strictly bounded to maximum 500 items and 50MB total size on disk.
pub struct ThumbnailCache {
    cache: LruCache<String, CachedThumbnailEntry>,
    pub max_size_bytes: u64,
    pub current_size_bytes: u64,
    pub cache_dir: PathBuf,
}

impl ThumbnailCache {
    pub fn new(base_cache_dir: &Path, max_size_mb: u64) -> Self {
        let thumb_dir = base_cache_dir.join("thumbnails");
        let _ = fs::create_dir_all(&thumb_dir);

        let bounded_mb = max_size_mb.clamp(1, 100);
        let mut instance = Self {
            cache: LruCache::new(NonZeroUsize::new(500).unwrap()),
            max_size_bytes: bounded_mb * 1024 * 1024,
            current_size_bytes: 0,
            cache_dir: thumb_dir,
        };
        instance.hydrate_existing_files();
        instance
    }

    fn hydrate_existing_files(&mut self) {
        let Ok(entries) = fs::read_dir(&self.cache_dir) else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jpg") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if let Ok(meta) = entry.metadata() {
                let size = meta.len();
                if size == 0 {
                    let _ = fs::remove_file(&path);
                    continue;
                }
                let entry_info = CachedThumbnailEntry {
                    path: path.clone(),
                    size_bytes: size,
                    last_modified_http: chrono::Utc::now().to_rfc2822(),
                    etag: format!("\"thumb-{}-{}\"", stem, size),
                };
                self.insert_with_eviction(stem.to_string(), entry_info);
            }
        }
    }

    pub async fn get_or_download(
        &mut self,
        video_id: &str,
        music_dir: &Path,
        fallback_music_dir: &Path,
    ) -> Result<CachedThumbnailEntry> {
        let clean_id: String = video_id
            .trim_end_matches(".jpg")
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();

        if clean_id.is_empty() {
            return Err(anyhow!("Invalid thumbnail ID"));
        }

        // 1. Check LRU memory index + verify file exists on disk
        if let Some(existing) = self.cache.get(&clean_id) {
            if existing.path.exists() {
                return Ok(existing.clone());
            }
        }

        let target_cache_path = self.cache_dir.join(format!("{}.jpg", clean_id));

        // 2. Check if yt-dlp already downloaded thumbnail alongside the MP3 file
        let local_candidates = [
            music_dir.join(format!("{}.jpg", clean_id)),
            fallback_music_dir.join(format!("{}.jpg", clean_id)),
        ];
        for candidate in &local_candidates {
            if candidate.exists() {
                let _ = fs::copy(candidate, &target_cache_path);
                break;
            }
        }

        // 3. Otherwise download via curl with 10s timeout
        if !target_cache_path.exists() {
            let url = format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", clean_id);
            let out_str = target_cache_path.to_string_lossy().to_string();
            let mut cmd = Command::new("curl");
            cmd.args(["-sL", "--fail", "--max-time", "10", "-o", &out_str, &url]);

            let output = timeout(Duration::from_secs(12), cmd.output())
                .await
                .context("Thumbnail download timed out")?
                .context("Failed to spawn curl for thumbnail")?;

            if !output.status.success() || !target_cache_path.exists() {
                let _ = fs::remove_file(&target_cache_path);
                return Err(anyhow!("Failed to download thumbnail for {}", clean_id));
            }
        }

        let meta = fs::metadata(&target_cache_path)?;
        let size = meta.len();
        if size == 0 {
            let _ = fs::remove_file(&target_cache_path);
            return Err(anyhow!("Downloaded thumbnail is empty"));
        }

        let entry_info = CachedThumbnailEntry {
            path: target_cache_path,
            size_bytes: size,
            last_modified_http: chrono::Utc::now().to_rfc2822(),
            etag: format!("\"thumb-{}-{}\"", clean_id, size),
        };

        self.insert_with_eviction(clean_id, entry_info.clone());
        Ok(entry_info)
    }

    fn insert_with_eviction(&mut self, key: String, entry: CachedThumbnailEntry) {
        // If capacity (500 items) is full, pop LRU first
        if self.cache.len() >= self.cache.cap().get() && !self.cache.contains(&key) {
            if let Some((_, evicted)) = self.cache.pop_lru() {
                self.current_size_bytes = self.current_size_bytes.saturating_sub(evicted.size_bytes);
                let _ = fs::remove_file(&evicted.path);
            }
        }

        // Evict oldest items while total size exceeds 50MB
        while self.current_size_bytes + entry.size_bytes > self.max_size_bytes {
            let Some((_, evicted)) = self.cache.pop_lru() else {
                break;
            };
            self.current_size_bytes = self.current_size_bytes.saturating_sub(evicted.size_bytes);
            let _ = fs::remove_file(&evicted.path);
        }

        if let Some(old) = self.cache.put(key, entry.clone()) {
            self.current_size_bytes = self.current_size_bytes.saturating_sub(old.size_bytes);
        }
        self.current_size_bytes += entry.size_bytes;
    }
}
