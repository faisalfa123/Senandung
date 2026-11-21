use std::fs;
use std::sync::Arc;
use std::collections::HashMap;

use axum::{
    body::Body,
    http::{header, Request, StatusCode},
    routing::get,
    Router,
};
use http_body_util::BodyExt;
use tempfile::tempdir;
use tokio::sync::{broadcast, Mutex, RwLock};
use tower::ServiceExt;

use senandung::core::{
    cache::ThumbnailCache,
    db::Database,
    state::{AppState, Track},
};
use senandung::server::api::stream_track_handler;
use senandung::server::downloader::spawn_download_worker;
use senandung::utils::system::AppConfig;

#[tokio::test]
async fn test_streaming_track_with_range_requests() {
    let tmp = tempdir().expect("create temp dir");
    let music_dir = tmp.path().join("music");
    let data_dir = tmp.path().join("data");
    let cache_dir = tmp.path().join("cache");
    fs::create_dir_all(&music_dir).unwrap();
    fs::create_dir_all(&data_dir).unwrap();
    fs::create_dir_all(&cache_dir).unwrap();

    // Create dummy mp3 file with 16384 bytes
    let sample_mp3 = music_dir.join("test_song.mp3");
    let mut dummy_bytes = Vec::with_capacity(16384);
    for i in 0..16384 {
        dummy_bytes.push((i % 256) as u8);
    }
    fs::write(&sample_mp3, &dummy_bytes).unwrap();

    let db = Arc::new(Database::open(&data_dir).unwrap());
    let (download_tx, _download_rx) = spawn_download_worker();
    let (global_tx, _) = broadcast::channel(16);
    let thumbnail_cache = Arc::new(Mutex::new(ThumbnailCache::new(&cache_dir)));

    let track = Track {
        id: "test_song_123".to_string(),
        youtube_id: "test_song_123".to_string(),
        title: "Test Song".to_string(),
        artist: "Test Artist".to_string(),
        duration_sec: 120,
        thumbnail_url: "".to_string(),
        file_path: sample_mp3.clone(),
        added_by: "system".to_string(),
        added_at_ms: 1000,
    };
    db.save_track(&track).unwrap();

    let config = AppConfig {
        port: 8989,
        data_dir,
        cache_dir,
        primary_music_dir: music_dir,
        fallback_music_dir: tmp.path().join("fallback"),
        arch: "X64".to_string(),
    };

    let app_state = AppState {
        config,
        db,
        rooms: Arc::new(RwLock::new(HashMap::new())),
        downloads: Arc::new(RwLock::new(HashMap::new())),
        download_tx,
        global_tx,
        thumbnail_cache,
    };

    let app = Router::new()
        .route("/api/v1/stream/:track_id", get(stream_track_handler))
        .with_state(app_state);

    // 1. Test full stream (Status 200 OK)
    let req = Request::builder()
        .uri("/api/v1/stream/test_song_123")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "audio/mpeg"
    );
    assert_eq!(
        response.headers().get(header::ACCEPT_RANGES).unwrap(),
        "bytes"
    );
    assert_eq!(
        response.headers().get(header::CONTENT_LENGTH).unwrap(),
        "16384"
    );

    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(body_bytes.len(), 16384);
    assert_eq!(&body_bytes[..], &dummy_bytes[..]);

    // 2. Test Range request: bytes=0-1023 (Status 206 Partial Content, exactly 1024 bytes)
    let req_range = Request::builder()
        .uri("/api/v1/stream/test_song_123")
        .header(header::RANGE, "bytes=0-1023")
        .body(Body::empty())
        .unwrap();

    let response_range = app.clone().oneshot(req_range).await.unwrap();
    assert_eq!(response_range.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        response_range.headers().get(header::CONTENT_RANGE).unwrap(),
        "bytes 0-1023/16384"
    );
    assert_eq!(
        response_range.headers().get(header::CONTENT_LENGTH).unwrap(),
        "1024"
    );

    let range_bytes = response_range.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(range_bytes.len(), 1024);
    assert_eq!(&range_bytes[..], &dummy_bytes[0..1024]);
}
