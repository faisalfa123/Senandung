mod core;
mod logging;
mod server;
mod utils;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use tokio::sync::{broadcast, Mutex, RwLock};
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
};

use crate::core::{
    cache::ThumbnailCache,
    db::Database,
    state::{AppState, RoomBroadcastEvent, DEFAULT_ROOM_ID},
};
use crate::logging::{init_logging, safe_log_error};
use crate::server::{
    api::{
        download_status_handler, enqueue_download_handler, health_handler,
        list_tracks_handler, search_handler, stream_track_handler, thumbnail_handler,
    },
    downloader::{run_download_worker, spawn_download_worker},
    static_cache::{serve_index_handler, serve_static_asset_handler},
    ws::ws_handler,
};
use crate::utils::system::AppConfig;

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() -> Result<()> {
    init_logging();

    let config = AppConfig::from_env_and_args();
    let db = Arc::new(Database::open(&config.data_dir)?);
    let thumbnail_cache = Arc::new(Mutex::new(ThumbnailCache::new(&config.cache_dir)));

    let (download_tx, download_rx) = spawn_download_worker();
    let (global_tx, _) = broadcast::channel(32);

    let app_state = AppState {
        config: config.clone(),
        db: db.clone(),
        rooms: Arc::new(RwLock::new(HashMap::new())),
        downloads: Arc::new(RwLock::new(HashMap::new())),
        download_tx,
        global_tx: global_tx.clone(),
        thumbnail_cache,
    };

    // Auto-scan local HDD1 & music directories at startup
    let discovered_tracks = crate::utils::system::scan_local_music_dirs(&config, &db);

    // Pre-initialize default Lobby room from Sled DB (and seed with discovered HDD tracks if room is empty)
    let lobby_handle = app_state.get_or_create_room(DEFAULT_ROOM_ID).await;
    {
        let mut lobby_state = lobby_handle.state.write().await;
        if lobby_state.playlist.is_empty() && !discovered_tracks.is_empty() {
            for t in discovered_tracks.into_iter().take(50) {
                lobby_state.playlist.push(t);
            }
            let _ = db.save_room_state(&lobby_state);
        }
    }

    // Spawn single-worker background download queue (nice -n 19 ionice -c 3 yt-dlp)
    let worker_state = app_state.clone();
    tokio::spawn(async move {
        run_download_worker(download_rx, worker_state).await;
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(serve_index_handler))
        .route("/api/v1/health", get(health_handler))
        .route("/api/v1/search", get(search_handler))
        .route("/api/v1/download", post(enqueue_download_handler))
        .route("/api/v1/download/status/:id", get(download_status_handler))
        .route("/api/v1/tracks", get(list_tracks_handler))
        .route("/api/v1/stream/:track_id", get(stream_track_handler))
        .route("/api/v1/thumbnail/:id", get(thumbnail_handler))
        .route("/api/v1/artwork/:id", get(thumbnail_handler))
        .route("/ws", get(ws_handler))
        .route("/*path", get(serve_static_asset_handler))
        .layer(CompressionLayer::new())
        .layer(cors)
        .with_state(app_state.clone());

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    let shutdown_state = app_state.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_state))
        .await?;

    // Final DB flush after HTTP server drains connections
    let _ = db.flush_async().await;
    Ok(())
}

async fn shutdown_signal(state: AppState) {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sigterm) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sigterm.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    // Broadcast shutdown notification to all active WebSocket connections
    let _ = state.global_tx.send(RoomBroadcastEvent::ServerShutdown {
        message: "server shutting down".to_string(),
    });

    // Persist all active room states and flush Sled DB
    let rooms = state.rooms.read().await;
    for handle in rooms.values() {
        let r_state = handle.state.read().await;
        if let Err(e) = state.db.save_room_state(&r_state) {
            safe_log_error("Failed to save room state during shutdown", &e);
        }
    }
    if let Err(e) = state.db.flush_async().await {
        safe_log_error("Failed to flush sled DB during shutdown", &e);
    }
}
