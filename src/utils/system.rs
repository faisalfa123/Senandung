use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crate::core::db::Database;
use crate::core::state::Track;
use crate::core::sync::current_epoch_ms;

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub data_dir: PathBuf,
    pub primary_music_dir: PathBuf,
    pub fallback_music_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub arch: String,
    pub thumb_cache_mb: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StorageStatus {
    pub active_path: PathBuf,
    pub is_fallback: bool,
    pub primary_configured: PathBuf,
}

impl AppConfig {
    pub fn from_env_and_args() -> Self {
        let args: Vec<String> = env::args().collect();

        let mut port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(8989);

        let mut cli_data_dir: Option<PathBuf> = None;
        let mut music_dir_override: Option<PathBuf> = env::var("SENANDUNG_MUSIC_DIR")
            .or_else(|_| env::var("MUSIC_DIR"))
            .ok()
            .filter(|s| !s.trim().is_empty())
            .map(PathBuf::from);

        let mut i = 1;
        while i < args.len() {
            match args[i].as_str() {
                "--port" | "-port" | "-p" if i + 1 < args.len() => {
                    if let Ok(p) = args[i + 1].parse::<u16>() {
                        port = p;
                    }
                    i += 1;
                }
                "--data-dir" | "-data-dir" | "-d" if i + 1 < args.len() => {
                    cli_data_dir = Some(PathBuf::from(&args[i + 1]));
                    i += 1;
                }
                "--music-dir" | "-music-dir" | "-m" if i + 1 < args.len() => {
                    music_dir_override = Some(PathBuf::from(&args[i + 1]));
                    i += 1;
                }
                arg if arg.starts_with("--port=") || arg.starts_with("-port=") => {
                    if let Some(val) = arg.split('=').nth(1) {
                        if let Ok(p) = val.parse::<u16>() {
                            port = p;
                        }
                    }
                }
                arg if arg.starts_with("--data-dir=") || arg.starts_with("-data-dir=") => {
                    if let Some(val) = arg.split('=').nth(1) {
                        cli_data_dir = Some(PathBuf::from(val));
                    }
                }
                arg if arg.starts_with("--music-dir=") || arg.starts_with("-music-dir=") => {
                    if let Some(val) = arg.split('=').nth(1) {
                        music_dir_override = Some(PathBuf::from(val));
                    }
                }
                _ => {}
            }
            i += 1;
        }

        let mut data_candidates: Vec<PathBuf> = Vec::new();
        if let Some(d) = cli_data_dir {
            data_candidates.push(d);
        }
        if let Ok(env_data) = env::var("DATA_DIR") {
            if !env_data.trim().is_empty() {
                data_candidates.push(PathBuf::from(env_data));
            }
        }
        if let Ok(state_dir) = env::var("STATE_DIRECTORY") {
            for part in state_dir.split(':').filter(|s| !s.trim().is_empty()) {
                data_candidates.push(PathBuf::from(part));
            }
        }
        data_candidates.push(PathBuf::from("/mnt/hdd1/senandung/data"));
        data_candidates.push(PathBuf::from("/mnt/hdd1/senandung"));
        data_candidates.push(PathBuf::from("/var/lib/mastermind/senandung"));
        data_candidates.push(PathBuf::from("/var/lib/senandung"));
        data_candidates.push(PathBuf::from("./data"));
        data_candidates.push(env::temp_dir().join("senandung"));
        data_candidates.push(PathBuf::from("/tmp/senandung"));

        let resolved_data_dir = resolve_first_writable_dir(&data_candidates);

        // Use /mnt/hdd1/senandung directly so existing songs in root & subfolders are discovered
        let primary_music_dir = music_dir_override
            .unwrap_or_else(|| PathBuf::from("/mnt/hdd1/senandung"));

        let fallback_music_dir = resolved_data_dir.join("tracks");
        let _ = fs::create_dir_all(&fallback_music_dir);

        let cache_candidates = [
            resolved_data_dir.join("cache"),
            PathBuf::from("/var/cache/senandung"),
            env::temp_dir().join("senandung/cache"),
            PathBuf::from("/tmp/senandung/cache"),
        ];
        let cache_dir = resolve_first_writable_dir(&cache_candidates);

        let thumb_cache_mb = env::var("SENANDUNG_THUMB_CACHE_MB")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(20)
            .clamp(1, 100);

        Self {
            port,
            data_dir: resolved_data_dir,
            primary_music_dir,
            fallback_music_dir,
            cache_dir,
            arch: detect_arch(),
            thumb_cache_mb,
        }
    }

    /// Resolves the active music storage path dynamically.
    /// Automatically reroutes to fallback_music_dir if primary HDD mount is unavailable or unwritable.
    pub fn resolve_music_storage(&self) -> StorageStatus {
        if is_dir_usable(&self.primary_music_dir) {
            StorageStatus {
                active_path: self.primary_music_dir.clone(),
                is_fallback: false,
                primary_configured: self.primary_music_dir.clone(),
            }
        } else {
            let _ = fs::create_dir_all(&self.fallback_music_dir);
            StorageStatus {
                active_path: self.fallback_music_dir.clone(),
                is_fallback: true,
                primary_configured: self.primary_music_dir.clone(),
            }
        }
    }
}

pub fn detect_arch() -> String {
    match env::consts::ARCH {
        "aarch64" => "ARM64".to_string(),
        "arm" => "ARMv7".to_string(),
        "x86_64" => "X64".to_string(),
        other => other.to_uppercase(),
    }
}

pub fn resolve_first_writable_dir(candidates: &[PathBuf]) -> PathBuf {
    for candidate in candidates {
        if is_dir_usable(candidate) {
            return candidate.clone();
        }
    }
    let tmp = env::temp_dir().join("senandung");
    let _ = fs::create_dir_all(&tmp);
    tmp
}

pub fn is_dir_usable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".senandung_write_probe");
    match fs::write(&probe, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Recursively scans `/mnt/hdd1/senandung` and configured music directories for audio files
/// (`.mp3`, `.flac`, `.m4a`, `.opus`, `.ogg`, `.wav`) and registers them into Sled DB.
pub fn scan_local_music_dirs(config: &AppConfig, db: &Database) -> Vec<Track> {
    let mut scan_roots = Vec::new();
    let root_hdd = PathBuf::from("/mnt/hdd1/senandung");
    if root_hdd.exists() {
        scan_roots.push(root_hdd);
    }
    if config.primary_music_dir.exists() && !scan_roots.contains(&config.primary_music_dir) {
        scan_roots.push(config.primary_music_dir.clone());
    }
    if config.fallback_music_dir.exists() && !scan_roots.contains(&config.fallback_music_dir) {
        scan_roots.push(config.fallback_music_dir.clone());
    }

    let existing_tracks = db.list_all_tracks().unwrap_or_default();
    let mut known_paths: std::collections::HashSet<PathBuf> =
        existing_tracks.iter().map(|t| t.file_path.clone()).collect();

    let mut discovered_files = Vec::new();
    for root in &scan_roots {
        collect_audio_files_recursive(root, 0, &mut discovered_files);
    }

    for file_path in discovered_files {
        if known_paths.contains(&file_path) {
            continue;
        }
        if let Some(track) = build_track_from_file(&file_path) {
            let _ = db.save_track(&track);
            known_paths.insert(file_path);
        }
    }

    db.list_all_tracks().unwrap_or_default()
}

fn collect_audio_files_recursive(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') || name == "state.db" || name == "cache" || name == "data" {
            continue;
        }

        if path.is_dir() {
            collect_audio_files_recursive(&path, depth + 1, out);
        } else if is_supported_audio_ext(&path) {
            out.push(path);
        }
    }
}

pub fn is_supported_audio_ext(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return false;
    };
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "mp3" | "flac" | "m4a" | "opus" | "ogg" | "wav"
    )
}

pub fn audio_mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("flac") => "audio/flac",
        Some("m4a") => "audio/mp4",
        Some("opus") => "audio/ogg; codecs=opus",
        Some("ogg") => "audio/ogg",
        Some("wav") => "audio/wav",
        _ => "audio/mpeg",
    }
}

fn build_track_from_file(path: &Path) -> Option<Track> {
    let meta = fs::metadata(path).ok()?;
    if meta.len() == 0 {
        return None;
    }

    let stem = path.file_stem()?.to_string_lossy().to_string();
    let mut raw_title = stem.clone();
    let mut youtube_id = String::new();

    // Check if filename ends with " [VIDEO_ID]" (standard yt-dlp format from Go v2)
    if let Some(open_idx) = raw_title.rfind(" [") {
        if raw_title.ends_with(']') {
            let candidate = &raw_title[open_idx + 2..raw_title.len() - 1];
            if candidate.len() == 11
                && candidate
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                youtube_id = candidate.to_string();
                raw_title = raw_title[..open_idx].trim().to_string();
            }
        }
    }

    // Or check if filename itself is an 11-char YouTube ID (e.g. "dQw4w9WgXcQ.mp3")
    if youtube_id.is_empty()
        && stem.len() == 11
        && stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        youtube_id = stem.clone();
    }

    let (artist, title) = if let Some((a, t)) = raw_title.split_once(" - ") {
        (a.trim().to_string(), t.trim().to_string())
    } else {
        ("Koleksi STB".to_string(), raw_title)
    };

    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or_else(current_epoch_ms);

    let track_id = if !youtube_id.is_empty() {
        youtube_id.clone()
    } else {
        // Stable deterministic hash ID from full path
        let mut h: u64 = 0xcbf29ce484222325;
        for &b in path.to_string_lossy().as_bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        format!("local_{:016x}", h)
    };

    let thumbnail_url = if !youtube_id.is_empty() {
        format!("/api/v1/thumbnail/{}", youtube_id)
    } else {
        String::new()
    };

    // Rough duration estimate from file size (~128kbps = 16KB/s) when metadata is absent
    let estimated_duration = (meta.len() / 16_000).max(1);

    Some(Track {
        id: track_id.clone(),
        youtube_id: if youtube_id.is_empty() {
            track_id
        } else {
            youtube_id
        },
        title,
        artist,
        duration_sec: estimated_duration,
        thumbnail_url,
        file_path: path.to_path_buf(),
        added_by: "Storage HDD".to_string(),
        added_at_ms: mtime_ms,
    })
}

/// Periodic Storage Health Check & Auto-Migration (Phase 5 Task 5.3)
/// Every 5 minutes, checks if the primary HDD has reconnected.
/// If reconnected after fallback, automatically migrates files from fallback directory back to HDD
/// and updates track file_path in Sled DB.
pub fn start_storage_health_checker(config: AppConfig, db: std::sync::Arc<Database>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;

            // Only attempt migration if primary music directory is usable and fallback has files
            if is_dir_usable(&config.primary_music_dir) && config.fallback_music_dir.exists() {
                if let Ok(entries) = fs::read_dir(&config.fallback_music_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() && is_supported_audio_ext(&path) {
                            if let Some(filename) = path.file_name() {
                                let target_path = config.primary_music_dir.join(filename);
                                // Move file back to HDD
                                if fs::rename(&path, &target_path).is_ok() || fs::copy(&path, &target_path).map(|_| { let _ = fs::remove_file(&path); () }).is_ok() {
                                    // Update track in DB if present
                                    if let Some(track) = build_track_from_file(&target_path) {
                                        let _ = db.save_track(&track);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}
