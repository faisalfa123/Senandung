use std::io::SeekFrom;
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::core::state::{AppState, DownloadTaskStatus, DEFAULT_ROOM_ID};
use crate::core::sync::current_epoch_ms;
use crate::server::downloader::{search_youtube_async, DownloadJob};

/// 8KB chunk size for audio streaming so audio never buffers inside server RAM.
const STREAM_CHUNK_SIZE: usize = 8 * 1024;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub arch: String,
    pub db_path: String,
    pub cache_dir: String,
    pub music_storage_path: String,
    pub music_storage_fallback: bool,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DownloadRequest {
    pub youtube_id: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub duration_sec: Option<u64>,
    pub thumbnail_url: Option<String>,
    pub room_id: Option<String>,
    pub requested_by: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DownloadEnqueueResponse {
    pub task_id: String,
    pub status: String,
    pub room_id: String,
}

pub async fn health_handler(State(state): State<AppState>) -> impl IntoResponse {
    let storage = state.config.resolve_music_storage();
    Json(HealthResponse {
        status: "ok",
        version: "3.2.0-beta",
        arch: state.config.arch.clone(),
        db_path: state.db.db_path.to_string_lossy().to_string(),
        cache_dir: state.config.cache_dir.to_string_lossy().to_string(),
        music_storage_path: storage.active_path.to_string_lossy().to_string(),
        music_storage_fallback: storage.is_fallback,
    })
}

pub async fn search_handler(
    Query(params): Query<SearchQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let query = params.q.unwrap_or_default();
    if query.trim().is_empty() {
        return Ok(Json(serde_json::json!({ "results": [] })));
    }

    match search_youtube_async(&query).await {
        Ok(results) => Ok(Json(serde_json::json!({ "results": results }))),
        Err(err) => Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "error": "Failed to search YouTube via yt-dlp",
                "details": err.to_string()
            })),
        )),
    }
}

pub async fn enqueue_download_handler(
    State(state): State<AppState>,
    Json(req): Json<DownloadRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let yt_id = req.youtube_id.trim().to_string();
    if yt_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "youtube_id is required" })),
        ));
    }

    let task_id = Uuid::new_v4().to_string();
    let room_id = req
        .room_id
        .filter(|r| !r.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ROOM_ID.to_string());
    let title = req
        .title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| format!("Track {}", yt_id));
    let artist = req
        .artist
        .filter(|a| !a.trim().is_empty())
        .unwrap_or_else(|| "YouTube Music".to_string());
    let requested_by = req
        .requested_by
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| "Listener".to_string());
    let thumbnail_url = req
        .thumbnail_url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", yt_id));

    let job = DownloadJob {
        task_id: task_id.clone(),
        youtube_id: yt_id.clone(),
        title: title.clone(),
        artist,
        duration_sec: req.duration_sec.unwrap_or(0),
        thumbnail_url,
        room_id: room_id.clone(),
        requested_by: requested_by.clone(),
    };

    {
        let mut downloads = state.downloads.write().await;
        downloads.insert(
            task_id.clone(),
            DownloadTaskStatus {
                task_id: task_id.clone(),
                youtube_id: yt_id,
                title,
                room_id: room_id.clone(),
                requested_by,
                status: "queued".to_string(),
                error: None,
                track: None,
                updated_at_ms: current_epoch_ms(),
            },
        );
    }

    if state.download_tx.send(job).await.is_err() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Download worker queue is unavailable" })),
        ));
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(DownloadEnqueueResponse {
            task_id,
            status: "queued".to_string(),
            room_id,
        }),
    ))
}

pub async fn download_status_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let downloads = state.downloads.read().await;
    if let Some(status) = downloads.get(&id) {
        Ok(Json(status.clone()))
    } else {
        Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Download task not found" })),
        ))
    }
}

pub async fn list_tracks_handler(State(state): State<AppState>) -> impl IntoResponse {
    let tracks = crate::utils::system::scan_local_music_dirs(&state.config, &state.db);
    Json(serde_json::json!({ "tracks": tracks }))
}

/// Streams audio file (`.mp3`, `.flac`, `.m4a`, `.opus`, `.ogg`, `.wav`) from disk in 8KB chunks
/// with HTTP Range support. Never loads full audio file into server RAM.
pub async fn stream_track_handler(
    State(state): State<AppState>,
    Path(track_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let raw_trimmed = track_id
        .trim_end_matches(".mp3")
        .trim_end_matches(".flac")
        .trim_end_matches(".m4a")
        .trim_end_matches(".opus")
        .trim_end_matches(".ogg")
        .trim_end_matches(".wav");

    let clean_id: String = raw_trimmed
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();

    let lookup_track = |id_key: &str| -> Option<std::path::PathBuf> {
        if let Ok(Some(t)) = state.db.get_track(id_key) {
            if t.file_path.exists() {
                return Some(t.file_path);
            }
        }
        if let Ok(all) = state.db.list_all_tracks() {
            if let Some(found) = all.into_iter().find(|t| {
                t.id.eq_ignore_ascii_case(id_key) || t.youtube_id.eq_ignore_ascii_case(id_key)
            }) {
                if found.file_path.exists() {
                    return Some(found.file_path);
                }
            }
        }
        None
    };

    let file_path = if let Some(p) = lookup_track(raw_trimmed).or_else(|| lookup_track(&clean_id)) {
        p
    } else {
        let _ = crate::utils::system::scan_local_music_dirs(&state.config, &state.db);
        if let Some(p) = lookup_track(raw_trimmed).or_else(|| lookup_track(&clean_id)) {
            p
        } else {
            let storage = state.config.resolve_music_storage();
            let candidate = storage.active_path.join(format!("{}.mp3", clean_id));
            if candidate.exists() {
                candidate
            } else {
                state.config.fallback_music_dir.join(format!("{}.mp3", clean_id))
            }
        }
    };

    let content_type = crate::utils::system::audio_mime_for_path(&file_path);

    let mut file = match File::open(&file_path).await {
        Ok(f) => f,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Audio file not found on storage" })),
            )
                .into_response();
        }
    };

    let total_size = match file.metadata().await {
        Ok(m) => m.len(),
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to read audio metadata" })),
            )
                .into_response();
        }
    };

    if total_size == 0 {
        return (StatusCode::NO_CONTENT, Body::empty()).into_response();
    }

    // Parse optional Range header: "bytes=start-end"
    if let Some(range_val) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some((start, end)) = parse_byte_range(range_val, total_size) {
            if file.seek(SeekFrom::Start(start)).await.is_err() {
                return StatusCode::RANGE_NOT_SATISFIABLE.into_response();
            }
            let length = end - start + 1;
            let limited = file.take(length);
            let stream = ReaderStream::with_capacity(limited, STREAM_CHUNK_SIZE);
            let content_range = format!("bytes {}-{}/{}", start, end, total_size);

            return Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, content_type)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, length.to_string())
                .header(header::CONTENT_RANGE, content_range)
                .body(Body::from_stream(stream))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    }

    let stream = ReaderStream::with_capacity(file, STREAM_CHUNK_SIZE);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, total_size.to_string())
        .body(Body::from_stream(stream))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn parse_byte_range(header_val: &str, total_size: u64) -> Option<(u64, u64)> {
    let prefix = "bytes=";
    if !header_val.starts_with(prefix) {
        return None;
    }
    let range_part = &header_val[prefix.len()..];
    let mut parts = range_part.splitn(2, '-');
    let start_str = parts.next()?.trim();
    let end_str = parts.next()?.trim();

    let start: u64 = start_str.parse().ok()?;
    if start >= total_size {
        return None;
    }
    let end: u64 = if end_str.is_empty() {
        total_size - 1
    } else {
        end_str.parse::<u64>().ok()?.min(total_size - 1)
    };

    if start <= end {
        Some((start, end))
    } else {
        None
    }
}

/// Tier 2 (HTTP Cache Delegation: Cache-Control max-age=86400, ETag, Last-Modified)
/// backed by Tier 3 (LRU Disk Cache bounded to 50MB / 500 items).
pub async fn thumbnail_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    req_headers: HeaderMap,
) -> Response {
    let storage = state.config.resolve_music_storage();
    let entry_res = {
        let mut cache = state.thumbnail_cache.lock().await;
        cache
            .get_or_download(&id, &storage.active_path, &state.config.fallback_music_dir)
            .await
    };

    let Ok(entry) = entry_res else {
        // Fallback SVG placeholder when offline or video has no remote thumbnail
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#181818"/><circle cx="80" cy="80" r="34" stroke="#ff0000" stroke-width="4" fill="none"/><circle cx="80" cy="80" r="10" fill="#f1f1f1"/></svg>"##;
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/svg+xml")
            .header(header::CACHE_CONTROL, "public, max-age=86400")
            .body(Body::from(svg))
            .unwrap_or_else(|_| StatusCode::NOT_FOUND.into_response());
    };

    if let Some(if_none_match) = req_headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
    {
        if if_none_match.trim() == entry.etag {
            return Response::builder()
                .status(StatusCode::NOT_MODIFIED)
                .header(header::CACHE_CONTROL, "public, max-age=86400")
                .header(header::ETAG, entry.etag)
                .header(header::LAST_MODIFIED, entry.last_modified_http)
                .body(Body::empty())
                .unwrap_or_else(|_| StatusCode::NOT_MODIFIED.into_response());
        }
    }

    match tokio::fs::read(&entry.path).await {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/jpeg")
            .header(header::CACHE_CONTROL, "public, max-age=86400")
            .header(header::ETAG, entry.etag)
            .header(header::LAST_MODIFIED, entry.last_modified_http)
            .body(Body::from(bytes))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response()),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

// ============================================================================
// Phase 3: Server-Side Custom Playlist REST API
// ============================================================================

/// GET /api/v1/playlists
pub async fn list_playlists_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.db.load_custom_playlists() {
        Ok(playlists) => (StatusCode::OK, Json(serde_json::json!({ "playlists": playlists }))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
}

/// POST /api/v1/playlists/{name}/tracks
pub async fn add_playlist_track_handler(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(track): Json<crate::core::state::Track>,
) -> impl IntoResponse {
    let mut playlists = match state.db.load_custom_playlists() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        }
    };

    let list = playlists.entry(name.clone()).or_insert_with(Vec::new);
    if !list.iter().any(|t| t.id == track.id) {
        list.push(track);
    }

    match state.db.save_custom_playlist(&name, list) {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "ok", "playlist": list })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
}

/// DELETE /api/v1/playlists/{name}/tracks/{track_id}
pub async fn remove_playlist_track_handler(
    State(state): State<AppState>,
    Path((name, track_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let mut playlists = match state.db.load_custom_playlists() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        }
    };

    let list = playlists.entry(name.clone()).or_insert_with(Vec::new);
    list.retain(|t| t.id != track_id);

    match state.db.save_custom_playlist(&name, list) {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "ok", "playlist": list })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
}

/// DELETE /api/v1/playlists/{name}
pub async fn delete_playlist_handler(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if name == "Favorit" {
        // Favorit cannot be completely removed, clear it instead
        let _ = state.db.save_custom_playlist("Favorit", &[]);
        return (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "ok", "cleared": true })),
        );
    }

    match state.db.delete_custom_playlist(&name) {
        Ok(deleted) => (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "ok", "deleted": deleted })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
}

/// POST /api/v1/migrate-playlists
/// Bulk import custom playlists from client localStorage
pub async fn migrate_playlists_handler(
    State(state): State<AppState>,
    Json(payload): Json<std::collections::HashMap<String, Vec<crate::core::state::Track>>>,
) -> impl IntoResponse {
    let mut imported = 0;
    for (name, tracks) in payload {
        if let Ok(_) = state.db.save_custom_playlist(&name, &tracks) {
            imported += 1;
        }
    }
    (
        StatusCode::OK,
        Json(serde_json::json!({ "status": "ok", "imported_count": imported })),
    )
}
