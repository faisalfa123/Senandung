use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub data_dir: PathBuf,
    pub primary_music_dir: PathBuf,
    pub fallback_music_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub arch: String,
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

        let mut data_dir = env::var("DATA_DIR")
            .or_else(|_| env::var("STATE_DIRECTORY"))
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                let mm_jail = PathBuf::from("/var/lib/mastermind/senandung");
                if mm_jail.exists() {
                    mm_jail
                } else {
                    PathBuf::from("/var/lib/senandung")
                }
            });

        let mut music_dir_override: Option<PathBuf> = env::var("SENANDUNG_MUSIC_DIR")
            .or_else(|_| env::var("MUSIC_DIR"))
            .ok()
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
                    data_dir = PathBuf::from(&args[i + 1]);
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
                _ => {}
            }
            i += 1;
        }

        // Verify data_dir is writable; fallback to ./data when running unprivileged in dev/sandbox
        let resolved_data_dir = ensure_writable_dir(&data_dir, &PathBuf::from("./data"));

        let primary_music_dir = music_dir_override
            .unwrap_or_else(|| PathBuf::from("/mnt/hdd1/senandung/tracks"));

        let fallback_music_dir = resolved_data_dir.join("tracks");
        let _ = fs::create_dir_all(&fallback_music_dir);

        let default_cache = resolved_data_dir.join("cache");
        let fallback_cache = PathBuf::from("./data/cache");
        let cache_dir = ensure_writable_dir(&default_cache, &fallback_cache);

        Self {
            port,
            data_dir: resolved_data_dir,
            primary_music_dir,
            fallback_music_dir,
            cache_dir,
            arch: detect_arch(),
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

pub fn ensure_writable_dir(preferred: &Path, fallback: &Path) -> PathBuf {
    if is_dir_usable(preferred) {
        preferred.to_path_buf()
    } else {
        let _ = fs::create_dir_all(fallback);
        fallback.to_path_buf()
    }
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
