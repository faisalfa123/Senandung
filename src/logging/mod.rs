use std::collections::HashMap;
use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::panic;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, EnvFilter};

/// Maximum size per log file: 1 MB. With at most 2 files (`senandung.log` and `senandung.log.1`),
/// total disk usage for logs never exceeds ~2 MB.
const MAX_LOG_FILE_BYTES: u64 = 1024 * 1024;
const MAX_ROTATED_FILES: usize = 2;

/// Minimum interval (in seconds) before logging an identical error signature again,
/// preventing log spam inside fast loops or recurring network glitches.
const ERROR_DEDUP_WINDOW_SEC: u64 = 30;

static DEDUP_STATE: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();

/// Initializes structured logging with default level `WARN` to protect SD Cards from write exhaustion.
/// If `SENANDUNG_LOG_FILE=1` or `--log-file` is enabled, uses a bounded size-rotated writer (max 2MB)
/// that degrades gracefully to `stderr` (`systemd-journald`) on `ENOSPC` (disk full).
pub fn init_logging() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("warn"));

    let use_file_log = env::var("SENANDUNG_LOG_FILE")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
        || env::args().any(|a| a == "--log-file");

    if use_file_log {
        let log_dir = env::var("SENANDUNG_LOG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/var/log/senandung"));

        let use_daily_appender = env::var("SENANDUNG_LOG_DAILY")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        if use_daily_appender {
            let file_appender = RollingFileAppender::new(
                Rotation::DAILY,
                &log_dir,
                "senandung.log",
            );
            let _ = prune_old_logs(&log_dir, MAX_ROTATED_FILES);
            let _ = fmt()
                .with_env_filter(filter)
                .with_target(false)
                .with_ansi(false)
                .with_writer(file_appender)
                .try_init();
            return;
        }

        if let Ok(writer) = BoundedResilientLogWriter::new(&log_dir, "senandung.log") {
            let make_writer = Mutex::new(writer);
            let _ = fmt()
                .with_env_filter(filter)
                .with_target(false)
                .with_ansi(false)
                .with_writer(make_writer)
                .try_init();
            return;
        }
    }

    // Default safe mode: write WARN/ERROR directly to stderr (captured by systemd-journald in RAM)
    let _ = fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_writer(io::stderr)
        .try_init();
}

/// Resilient size-bounded file writer (max 2 files x 1MB = 2MB total).
/// Automatically falls back to `stderr` if disk becomes full (`ENOSPC`) without ever panicking.
pub struct BoundedResilientLogWriter {
    log_dir: PathBuf,
    active_path: PathBuf,
    rotated_path: PathBuf,
    current_size: u64,
    file: Option<File>,
}

impl BoundedResilientLogWriter {
    pub fn new(log_dir: &Path, filename: &str) -> io::Result<Self> {
        fs::create_dir_all(log_dir)?;
        let _ = prune_old_logs(log_dir, MAX_ROTATED_FILES);

        let active_path = log_dir.join(filename);
        let rotated_path = log_dir.join(format!("{}.1", filename));
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&active_path)?;
        let current_size = file.metadata().map(|m| m.len()).unwrap_or(0);

        Ok(Self {
            log_dir: log_dir.to_path_buf(),
            active_path,
            rotated_path,
            current_size,
            file: Some(file),
        })
    }

    fn rotate_if_needed(&mut self, incoming_len: u64) {
        if self.current_size + incoming_len <= MAX_LOG_FILE_BYTES {
            return;
        }
        // Close current file and overwrite .1 rotated file so max 2 files ever exist
        self.file = None;
        let _ = fs::rename(&self.active_path, &self.rotated_path);
        let _ = prune_old_logs(&self.log_dir, MAX_ROTATED_FILES);

        match OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&self.active_path)
        {
            Ok(new_file) => {
                self.current_size = 0;
                self.file = Some(new_file);
            }
            Err(e) => {
                let _ = writeln!(
                    io::stderr(),
                    "[FALLBACK] Log rotation failed ({}), switching to stderr",
                    e
                );
            }
        }
    }
}

impl Write for BoundedResilientLogWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.rotate_if_needed(buf.len() as u64);

        if let Some(ref mut f) = self.file {
            match f.write_all(buf) {
                Ok(()) => {
                    self.current_size += buf.len() as u64;
                    return Ok(buf.len());
                }
                Err(err) => {
                    // Graceful degradation on disk full (ENOSPC = OS error 28 on Linux) or I/O error
                    let _ = writeln!(
                        io::stderr(),
                        "[FALLBACK-DISK-FULL] File log write failed ({}), degrading to stderr: {}",
                        err,
                        String::from_utf8_lossy(buf).trim_end()
                    );
                    self.file = None;
                    return Ok(buf.len());
                }
            }
        }

        // If file handle was disabled due to full disk, forward safely to stderr
        let _ = io::stderr().write_all(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        if let Some(ref mut f) = self.file {
            if f.flush().is_err() {
                self.file = None;
            }
        }
        Ok(())
    }
}

fn prune_old_logs(log_dir: &Path, max_files: usize) -> io::Result<()> {
    let mut files: Vec<(PathBuf, SystemTime)> = fs::read_dir(log_dir)?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.is_file() {
                let mtime = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(UNIX_EPOCH);
                Some((path, mtime))
            } else {
                None
            }
        })
        .collect();

    files.sort_by(|a, b| b.1.cmp(&a.1));
    for (old_path, _) in files.into_iter().skip(max_files) {
        let _ = fs::remove_file(old_path);
    }
    Ok(())
}

/// Logs an error with clear context, deduplication against log spam, `catch_unwind` protection,
/// and automatic `stderr` fallback if the logger fails or disk is full.
pub fn safe_log_error(context: &str, err: &anyhow::Error) {
    let now_sec = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let signature = format!("{}::{}", context, err);
    let dedup_map = DEDUP_STATE.get_or_init(|| Mutex::new(HashMap::new()));

    if let Ok(mut guard) = dedup_map.lock() {
        if let Some(&last_logged) = guard.get(&signature) {
            if now_sec.saturating_sub(last_logged) < ERROR_DEDUP_WINDOW_SEC {
                return;
            }
        }
        // Keep dedup table bounded in RAM
        if guard.len() > 128 {
            guard.clear();
        }
        guard.insert(signature, now_sec);
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        tracing::error!(context = context, error = %err, "Operation failed");
    }));

    if result.is_err() {
        eprintln!("[FALLBACK] {}: {}", context, err);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_rotation_stays_under_2mb() {
        let tmp_dir = std::env::temp_dir().join("senandung_log_test");
        let _ = fs::remove_dir_all(&tmp_dir);
        let mut writer = BoundedResilientLogWriter::new(&tmp_dir, "senandung.log").unwrap();

        // Write 2.6 MB of log lines; writer must rotate at 1 MB and keep at most 2 files (<= 2 MB)
        let chunk = vec![b'A'; 64 * 1024];
        for _ in 0..42 {
            writer.write_all(&chunk).unwrap();
        }
        writer.flush().unwrap();

        let entries: Vec<_> = fs::read_dir(&tmp_dir).unwrap().flatten().collect();
        assert!(entries.len() <= 2, "Expected at most 2 log files, found {}", entries.len());

        let total_bytes: u64 = entries
            .iter()
            .filter_map(|e| e.metadata().ok().map(|m| m.len()))
            .sum();
        assert!(
            total_bytes <= 2 * MAX_LOG_FILE_BYTES,
            "Total log size {} exceeded 2MB cap",
            total_bytes
        );

        let _ = fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_safe_log_error_deduplication_and_no_panic() {
        let err = anyhow::anyhow!("Simulated ENOSPC: No space left on device");
        // Calling 10 times in a tight loop must not panic and must deduplicate
        for _ in 0..10 {
            safe_log_error("Failed to write playlist snapshot", &err);
        }
    }
}
