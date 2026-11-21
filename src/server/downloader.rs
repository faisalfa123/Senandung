use std::path::PathBuf;
use std::time::Duration;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::timeout;

use crate::core::state::{
    AppState, DownloadTaskStatus, RoomBroadcastEvent, Track,
};
use crate::core::sync::current_epoch_ms;

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
    pub thumbnail_url: String,
}

/// Initializes the single-worker background download queue (Bug #2 fix).
pub fn spawn_download_worker() -> (DownloadSender, mpsc::Receiver<DownloadJob>) {
    mpsc::channel::<DownloadJob>(64)
}

pub async fn run_download_worker(mut rx: mpsc::Receiver<DownloadJob>, state: AppState) {
    while let Some(job) = rx.recv().await {
        process_single_job(&state, job).await;
    }
}

async fn process_single_job(state: &AppState, job: DownloadJob) {
    update_task_status(
        state,
        &job,
        "downloading",
        None,
        None,
    )
    .await;

    // Resolve active storage path with automatic fallback if external HDD is disconnected
    let storage = state.config.resolve_music_storage();
    let target_dir = storage.active_path;

    // Retry up to 1 time (2 attempts total), each with a strict 60s timeout
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

                // Add track to the target room playlist & broadcast to all connected clients (Bug #3 fix)
                state.add_track_to_room(&job.room_id, track.clone()).await;

                update_task_status(
                    state,
                    &job,
                    "completed",
                    None,
                    Some(track),
                )
                .await;
                return;
            }
            Err(e) => {
                tracing::warn!(
                    task_id = %job.task_id,
                    youtube_id = %job.youtube_id,
                    attempt = attempt,
                    error = %e,
                    "yt-dlp download attempt failed"
                );
                last_err = Some(e.to_string());
            }
        }
    }

    update_task_status(
        state,
        &job,
        "failed",
        last_err,
        None,
    )
    .await;
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

/// Runs `nice -n 19 ionice -c 3 yt-dlp` asynchronously with a 60-second timeout.
/// Outputs `.mp3` at 128K audio quality and writes thumbnail alongside the audio file.
async fn execute_yt_dlp_download(job: &DownloadJob, target_dir: &PathBuf) -> Result<PathBuf> {
    let safe_id: String = job
        .youtube_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();

    if safe_id.is_empty() {
        return Err(anyhow!("Invalid YouTube ID"));
    }

    let final_mp3_path = target_dir.join(format!("{}.mp3", safe_id));
    if final_mp3_path.exists() {
        return Ok(final_mp3_path);
    }

    let output_template = target_dir
        .join(format!("{}.%(ext)s", safe_id))
        .to_string_lossy()
        .to_string();
    let url = format!("https://www.youtube.com/watch?v={}", safe_id);

    let mut cmd = Command::new("nice");
    cmd.args([
        "-n",
        "19",
        "ionice",
        "-c",
        "3",
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "128K",
        "--write-thumbnail",
        "--convert-thumbnails",
        "jpg",
        "-o",
        &output_template,
        &url,
    ]);

    let child_future = cmd.output();
    let output = timeout(Duration::from_secs(60), child_future)
        .await
        .context("yt-dlp download timed out after 60 seconds")?
        .context("Failed to spawn nice/ionice yt-dlp process")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("yt-dlp exited with error: {}", stderr.trim()));
    }

    if final_mp3_path.exists() {
        Ok(final_mp3_path)
    } else {
        Err(anyhow!(
            "Download finished but target MP3 file was not found at {}",
            final_mp3_path.display()
        ))
    }
}

/// Searches YouTube asynchronously via `nice -n 19 ionice -c 3 yt-dlp --dump-json --flat-playlist`.
pub async fn search_youtube_async(query: &str) -> Result<Vec<SearchResultItem>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let search_spec = format!("ytsearch8:{}", trimmed);
    let mut cmd = Command::new("nice");
    cmd.args([
        "-n",
        "19",
        "ionice",
        "-c",
        "3",
        "yt-dlp",
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
        &search_spec,
    ]);

    let output = timeout(Duration::from_secs(25), cmd.output())
        .await
        .context("YouTube search timed out after 25s")?
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
            let thumbnail_url = format!("/api/v1/thumbnail/{}", id);

            results.push(SearchResultItem {
                youtube_id: id,
                title,
                artist,
                duration_sec,
                thumbnail_url,
            });
        }
    }

    Ok(results)
}
