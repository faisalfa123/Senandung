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

        // Build ordered candidate list for writable data_dir.
        // In Mastermind systemd sandbox (DynamicUser=yes + ProtectSystem=strict),
        // WorkingDirectory (/opt/mastermind/apps/senandung) is read-only (EROFS os error 30),
        // and /var/lib/mastermind/senandung may be owned by root:root 0755 if pre-created by helper.
        // We probe every candidate in priority order until we find one that is genuinely writable,
        // ending with /tmp/senandung (always writable under PrivateTmp=yes).
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

        let primary_music_dir = music_dir_override
            .unwrap_or_else(|| PathBuf::from("/mnt/hdd1/senandung/tracks"));

        let fallback_music_dir = resolved_data_dir.join("tracks");
        let _ = fs::create_dir_all(&fallback_music_dir);

        let cache_candidates = [
            resolved_data_dir.join("cache"),
            PathBuf::from("/var/cache/senandung"),
            env::temp_dir().join("senandung/cache"),
            PathBuf::from("/tmp/senandung/cache"),
        ];
        let cache_dir = resolve_first_writable_dir(&cache_candidates);

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
