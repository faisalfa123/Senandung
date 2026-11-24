use std::path::{Path, PathBuf};
use std::time::Duration;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use std::sync::Arc;
use tokio::sync::{mpsc, Semaphore};
use tokio::time::timeout;

use crate::core::state::{
    AppState, DownloadTaskStatus, RoomBroadcastEvent, Track,
};
use crate::core::sync::current_epoch_ms;
use crate::logging::safe_log_error;
use crate::utils::system::is_supported_audio_ext;

pub type DownloadSender = mpsc::Sender<DownloadJob>;

#[derive(Debug, Clone)]
pub struct DownloadJob {
    pub task_id: String,
    pub youtube_id: String,
    pub title: String,
    pub artist: String,
    pub duration_sec: u64,
    pub thumbnail_url: String,
    pub room_id: String,
    pub requested_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub youtube_id: String,
    pub title: String,
    pub artist: String,
    pub duration_sec: u64,
    pub duration_label: String,
    pub views_label: String,
    pub thumbnail_url: String,
}

/// Initializes the concurrent background download queue with bounded channel (Phase 5 Task 5.2).
pub fn spawn_download_worker() -> (DownloadSender, mpsc::Receiver<DownloadJob>) {
    mpsc::channel::<DownloadJob>(64)
}

/// Runs concurrent download workers bounded to 2 simultaneous jobs to keep CPU <30% on STB ARM64.
pub async fn run_download_worker(mut rx: mpsc::Receiver<DownloadJob>, state: AppState) {
    let semaphore = Arc::new(Semaphore::new(2));

    while let Some(job) = rx.recv().await {
        let permit = match semaphore.clone().acquire_owned().await {
            Ok(p) => p,
            Err(_) => break,
        };
        let state_clone = state.clone();

        tokio::spawn(async move {
            process_single_job(&state_clone, job).await;
            drop(permit);
        });
    }
}

async fn process_single_job(state: &AppState, job: DownloadJob) {
    // Check if track already exists in Sled DB (e.g. from local HDD library)
    if let Ok(Some(existing)) = state.db.get_track(&job.youtube_id) {
        if existing.file_path.exists() {
            state
                .add_track_to_room(&job.room_id, existing.clone())
                .await;
            update_task_status(state, &job, "completed", None, Some(existing)).await;
            return;
        }
    }

    update_task_status(state, &job, "downloading", None, None).await;

    let storage = state.config.resolve_music_storage();
    let target_dir = storage.active_path;

    let mut last_err = None;
    for attempt in 1..=2 {
        match execute_yt_dlp_download(&job, &target_dir).await {
            Ok(file_path) => {
                let track = Track {
                    id: job.youtube_id.clone(),
                    youtube_id: job.youtube_id.clone(),
                    title: job.title.clone(),
                    artist: job.artist.clone(),
                    duration_sec: job.duration_sec,
                    thumbnail_url: if job.thumbnail_url.starts_with("/api/v1/thumbnail/") {
                        job.thumbnail_url.clone()
                    } else {
                        format!("/api/v1/thumbnail/{}", job.youtube_id)
                    },
                    file_path,
                    added_by: job.requested_by.clone(),
                    added_at_ms: current_epoch_ms(),
                };

                state.add_track_to_room(&job.room_id, track.clone()).await;
                update_task_status(state, &job, "completed", None, Some(track)).await;
                return;
            }
            Err(e) => {
                safe_log_error(
                    &format!("yt-dlp download attempt {} failed for {}", attempt, job.youtube_id),
                    &e,
                );
                last_err = Some(e.to_string());
            }
        }
    }

    update_task_status(state, &job, "failed", last_err, None).await;
}

async fn update_task_status(
    state: &AppState,
    job: &DownloadJob,
    status: &str,
    error: Option<String>,
    track: Option<Track>,
) {
    {
        let mut downloads = state.downloads.write().await;
        downloads.insert(
            job.task_id.clone(),
            DownloadTaskStatus {
                task_id: job.task_id.clone(),
                youtube_id: job.youtube_id.clone(),
                title: job.title.clone(),
                room_id: job.room_id.clone(),
                requested_by: job.requested_by.clone(),
                status: status.to_string(),
                error: error.clone(),
                track,
                updated_at_ms: current_epoch_ms(),
            },
        );
    }

    let room_handle = state.get_or_create_room(&job.room_id).await;
    let _ = room_handle.tx.send(RoomBroadcastEvent::DownloadProgress {
        task_id: job.task_id.clone(),
        youtube_id: job.youtube_id.clone(),
        title: job.title.clone(),
        status: status.to_string(),
        message: error,
    });
}

fn resolve_yt_dlp_binary() -> String {
    let candidates = [
        "./sandbox/bin/yt-dlp",
        "/opt/mastermind/apps/senandung/sandbox/bin/yt-dlp",
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
    ];
    for c in &candidates {
        if Path::new(c).exists() {
            return (*c).to_string();
        }
    }
    "yt-dlp".to_string()
}

/// Runs `yt-dlp` asynchronously inside Mastermind's sandbox (without `ionice`, which is blocked in ProtectSystem=strict).
/// Uses `nice -n 19` if `/usr/bin/nice` is accessible, otherwise invokes `yt-dlp` directly.
async fn execute_yt_dlp_download(job: &DownloadJob, target_dir: &PathBuf) -> Result<PathBuf> {
    let safe_id: String = job
        .youtube_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();

    if safe_id.is_empty() {
        return Err(anyhow!("Invalid YouTube ID"));
    }

    // Check if an audio file with this ID already exists in target_dir
    if let Some(found) = find_downloaded_audio_by_id(target_dir, &safe_id) {
        return Ok(found);
    }

    let clean_title: String = job
        .title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || " -_().".contains(c) {
                c
            } else {
                '_'
            }
        })
        .take(64)
        .collect();
    let base_prefix = if clean_title.trim().is_empty() {
        safe_id.clone()
    } else {
        format!("{} [{}]", clean_title.trim(), safe_id)
    };

    let output_template = target_dir
        .join(format!("{}.%(ext)s", base_prefix))
        .to_string_lossy()
        .to_string();
    let url = format!("https://www.youtube.com/watch?v={}", safe_id);
    let yt_bin = resolve_yt_dlp_binary();

    // Primary attempt: extract MP3 128K via ffmpeg
    let mut cmd = if Path::new("/usr/bin/nice").exists() {
        let mut c = Command::new("/usr/bin/nice");
        c.args(["-n", "19", &yt_bin]);
        c
    } else {
        Command::new(&yt_bin)
    };

    cmd.args([
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "128K",
        "-o",
        &output_template,
        &url,
    ]);

    let output = timeout(Duration::from_secs(120), cmd.output())
        .await
        .context("yt-dlp download timed out after 120 seconds")?
        .context("Failed to spawn yt-dlp process")?;

    if let Some(found) = find_downloaded_audio_by_id(target_dir, &safe_id) {
        return Ok(found);
    }

    // Fallback: if ffmpeg conversion failed inside sandbox, download bestaudio directly (m4a/opus)
    let mut fallback_cmd = Command::new(&yt_bin);
    fallback_cmd.args([
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "-f",
        "bestaudio[ext=m4a]/bestaudio",
        "-o",
        &output_template,
        &url,
    ]);

    let fb_output = timeout(Duration::from_secs(90), fallback_cmd.output())
        .await
        .context("yt-dlp bestaudio fallback timed out")?
        .context("Failed to spawn yt-dlp fallback")?;

    if let Some(found) = find_downloaded_audio_by_id(target_dir, &safe_id) {
        return Ok(found);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let fb_stderr = String::from_utf8_lossy(&fb_output.stderr);
    Err(anyhow!(
        "yt-dlp failed: {} | fallback: {}",
        stderr.trim(),
        fb_stderr.trim()
    ))
}

fn find_downloaded_audio_by_id(dir: &Path, safe_id: &str) -> Option<PathBuf> {
    let bracket_tag = format!("[{}]", safe_id);
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || !is_supported_audio_ext(&path) {
            continue;
        }
        let fname = path.file_name()?.to_string_lossy();
        if fname.starts_with(safe_id) || fname.contains(&bracket_tag) {
            return Some(path);
        }
    }
    None
}

/// Fast YouTube Search (<1 second) via YouTube Innertube JSON API using `curl`,
/// matching the proven architecture of Senandung Go v2.1.2-stable.
pub async fn search_youtube_async(query: &str) -> Result<Vec<SearchResultItem>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    // Tier 1: Fast YouTube Innertube API via curl
    if let Ok(results) = search_via_innertube_curl(trimmed).await {
        if !results.is_empty() {
            return Ok(results);
        }
    }

    // Tier 2: Fallback to yt-dlp --flat-playlist if Innertube is unreachable
    search_via_yt_dlp_fallback(trimmed).await
}

async fn search_via_innertube_curl(query: &str) -> Result<Vec<SearchResultItem>> {
    let payload = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240726.00.00",
                "hl": "id",
                "gl": "ID"
            }
        },
        "query": query
    });
    let payload_str = serde_json::to_string(&payload)?;

    let mut cmd = Command::new("curl");
    cmd.args([
        "-sL",
        "--max-time",
        "8",
        "-X",
        "POST",
        "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
        "-H",
        "Content-Type: application/json",
        "-H",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "-H",
        "Accept-Language: id-ID,id;q=0.9,en-US;q=0.8",
        "-d",
        &payload_str,
    ]);

    let output = timeout(Duration::from_secs(10), cmd.output())
        .await
        .context("Innertube curl timed out")?
        .context("Failed to spawn curl for Innertube search")?;

    if !output.status.success() {
        return Err(anyhow!("curl Innertube returned non-zero exit code"));
    }

    let root: serde_json::Value = serde_json::from_slice(&output.stdout)
        .context("Failed to parse Innertube JSON response")?;

    parse_innertube_search_json(&root)
}

fn parse_innertube_search_json(root: &serde_json::Value) -> Result<Vec<SearchResultItem>> {
    let mut results = Vec::new();
    let sections = root
        .pointer("/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow!("Innertube sectionListRenderer not found"))?;

    for sec in sections {
        let Some(items) = sec
            .pointer("/itemSectionRenderer/contents")
            .and_then(|v| v.as_array())
        else {
            continue;
        };

        for item in items {
            let Some(vr) = item.get("videoRenderer") else {
                continue;
            };
            let video_id = vr
                .get("videoId")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if video_id.is_empty() {
                continue;
            }

            let title = vr
                .pointer("/title/runs/0/text")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if title.is_empty() {
                continue;
            }

            let artist = vr
                .pointer("/ownerText/runs/0/text")
                .or_else(|| vr.pointer("/longBylineText/runs/0/text"))
                .and_then(|v| v.as_str())
                .unwrap_or("YouTube Music")
                .to_string();

            let duration_label = vr
                .pointer("/lengthText/simpleText")
                .and_then(|v| v.as_str())
                .unwrap_or("3:30")
                .to_string();
            let duration_sec = parse_duration_str(&duration_label);

            let views_label = vr
                .pointer("/shortViewCountText/simpleText")
                .or_else(|| vr.pointer("/viewCountText/simpleText"))
                .and_then(|v| v.as_str())
                .unwrap_or("YouTube")
                .to_string();

            let thumbnail_url = format!("/api/v1/thumbnail/{}", video_id);

            results.push(SearchResultItem {
                youtube_id: video_id,
                title,
                artist,
                duration_sec,
                duration_label,
                views_label,
                thumbnail_url,
            });

            if results.len() >= 20 {
                return Ok(results);
            }
        }
    }

    Ok(results)
}

fn parse_duration_str(s: &str) -> u64 {
    let parts: Vec<u64> = s
        .split(':')
        .filter_map(|p| p.trim().parse::<u64>().ok())
        .collect();
    match parts.len() {
        3 => parts[0] * 3600 + parts[1] * 60 + parts[2],
        2 => parts[0] * 60 + parts[1],
        1 => parts[0],
        _ => 0,
    }
}

async fn search_via_yt_dlp_fallback(query: &str) -> Result<Vec<SearchResultItem>> {
    let yt_bin = resolve_yt_dlp_binary();
    let search_spec = format!("ytsearch10:{}", query);
    let mut cmd = Command::new(&yt_bin);
    cmd.args([
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
        "--no-check-certificates",
        &search_spec,
    ]);

    let output = timeout(Duration::from_secs(20), cmd.output())
        .await
        .context("YouTube search fallback timed out")?
        .context("Failed to execute yt-dlp for search")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("yt-dlp search failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();
    for line in stdout.lines() {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
            let id = val
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if id.is_empty() {
                continue;
            }
            let title = val
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown Title")
                .to_string();
            let artist = val
                .get("uploader")
                .or_else(|| val.get("channel"))
                .and_then(|v| v.as_str())
                .unwrap_or("YouTube Music")
                .to_string();
            let duration_sec = val
                .get("duration")
                .and_then(|v| v.as_f64())
                .map(|d| d as u64)
                .unwrap_or(0);
            let m = duration_sec / 60;
            let s = duration_sec % 60;

            results.push(SearchResultItem {
                youtube_id: id.clone(),
                title,
                artist,
                duration_sec,
                duration_label: format!("{}:{:02}", m, s),
                views_label: "YouTube".to_string(),
                thumbnail_url: format!("/api/v1/thumbnail/{}", id),
            });
        }
    }
    Ok(results)
}
