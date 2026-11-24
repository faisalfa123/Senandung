use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, Mutex, RwLock};

use crate::core::cache::ThumbnailCache;
use crate::core::db::Database;
use crate::core::sync::{current_epoch_ms, target_server_play_timestamp};
use crate::server::downloader::DownloadSender;
use crate::utils::system::AppConfig;

pub const DEFAULT_ROOM_ID: &str = "Lobby";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Track {
    pub id: String,
    pub youtube_id: String,
    pub title: String,
    pub artist: String,
    pub duration_sec: u64,
    pub thumbnail_url: String,
    pub file_path: PathBuf,
    pub added_by: String,
    pub added_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub client_id: String,
    pub device_name: String,
    pub arch: String,
    pub joined_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomState {
    pub room_id: String,
    pub playlist: Vec<Track>,
    pub current_track_index: usize,
    pub is_playing: bool,
    pub play_timestamp: u64,
    pub seek_position_sec: f64,
    pub ntp_offset_ms: i64,
    pub connected_users: Vec<DeviceInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pin_hash: Option<String>,
}

impl RoomState {
    pub fn new(room_id: &str) -> Self {
        Self {
            room_id: room_id.to_string(),
            playlist: Vec::new(),
            current_track_index: 0,
            is_playing: false,
            play_timestamp: current_epoch_ms(),
            seek_position_sec: 0.0,
            ntp_offset_ms: 0,
            connected_users: Vec::new(),
            pin_hash: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", content = "data")]
pub enum RoomBroadcastEvent {
    #[serde(rename = "room_state_snapshot")]
    RoomStateSnapshot(RoomState),
    #[serde(rename = "playlist_updated")]
    PlaylistUpdated {
        room_id: String,
        playlist: Vec<Track>,
        current_track_index: usize,
    },
    #[serde(rename = "playback_sync")]
    PlaybackSync {
        room_id: String,
        current_track_index: usize,
        is_playing: bool,
        play_timestamp: u64,
        seek_position_sec: f64,
        server_now_ms: u64,
    },
    #[serde(rename = "users_updated")]
    UsersUpdated {
        room_id: String,
        connected_users: Vec<DeviceInfo>,
    },
    #[serde(rename = "download_progress")]
    DownloadProgress {
        task_id: String,
        youtube_id: String,
        title: String,
        status: String,
        message: Option<String>,
    },
    #[serde(rename = "server_shutdown")]
    ServerShutdown {
        message: String,
    },
    #[serde(rename = "join_denied")]
    JoinDenied {
        room_id: String,
        reason: String,
    },
}

/// Simple fast salted SHA-256 hash representation for Room PIN protection (hemat CPU STB ARM64)
pub fn hash_room_pin(pin: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    "senandung_pin_salt_v3".hash(&mut hasher);
    pin.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn verify_room_pin(pin: &str, expected_hash: &str) -> bool {
    hash_room_pin(pin) == expected_hash
}

pub struct RoomHandle {
    pub state: Arc<RwLock<RoomState>>,
    pub tx: broadcast::Sender<RoomBroadcastEvent>,
}

impl RoomHandle {
    pub fn new(initial_state: RoomState) -> Self {
        let (tx, _) = broadcast::channel(32);
        Self {
            state: Arc::new(RwLock::new(initial_state)),
            tx,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTaskStatus {
    pub task_id: String,
    pub youtube_id: String,
    pub title: String,
    pub room_id: String,
    pub requested_by: String,
    pub status: String, // "queued", "downloading", "completed", "failed"
    pub error: Option<String>,
    pub track: Option<Track>,
    pub updated_at_ms: u64,
}

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub db: Arc<Database>,
    pub rooms: Arc<RwLock<HashMap<String, Arc<RoomHandle>>>>,
    pub downloads: Arc<RwLock<HashMap<String, DownloadTaskStatus>>>,
    pub download_tx: DownloadSender,
    pub global_tx: broadcast::Sender<RoomBroadcastEvent>,
    pub thumbnail_cache: Arc<Mutex<ThumbnailCache>>,
}

impl AppState {
    pub async fn get_or_create_room(&self, room_id: &str) -> Arc<RoomHandle> {
        let normalized = if room_id.trim().is_empty() {
            DEFAULT_ROOM_ID
        } else {
            room_id.trim()
        };

        {
            let rooms = self.rooms.read().await;
            if let Some(handle) = rooms.get(normalized) {
                return handle.clone();
            }
        }

        let mut rooms = self.rooms.write().await;
        if let Some(handle) = rooms.get(normalized) {
            return handle.clone();
        }

        let persisted = self
            .db
            .load_room_state(normalized)
            .unwrap_or_else(|_| RoomState::new(normalized));
        let handle = Arc::new(RoomHandle::new(persisted));
        rooms.insert(normalized.to_string(), handle.clone());
        handle
    }

    /// Bug #3 fix: Adds track to room playlist, persists to Sled DB, and broadcasts immediately.
    pub async fn add_track_to_room(&self, room_id: &str, track: Track) {
        let _ = self.db.save_track(&track);
        let handle = self.get_or_create_room(room_id).await;
        let (playlist, current_track_index, snapshot) = {
            let mut state = handle.state.write().await;
            if !state.playlist.iter().any(|t| t.id == track.id) {
                state.playlist.push(track);
            }
            if state.current_track_index >= state.playlist.len() && !state.playlist.is_empty() {
                state.current_track_index = 0;
            }
            let _ = self.db.save_room_state(&state);
            (
                state.playlist.clone(),
                state.current_track_index,
                state.clone(),
            )
        };

        let _ = handle.tx.send(RoomBroadcastEvent::PlaylistUpdated {
            room_id: snapshot.room_id,
            playlist,
            current_track_index,
        });
    }

    /// Bug #4 fix: Server authoritatively advances or selects track index and broadcasts sync.
    pub async fn advance_to_next_track(&self, room_id: &str) -> Option<usize> {
        let handle = self.get_or_create_room(room_id).await;
        let event = {
            let mut state = handle.state.write().await;
            if state.playlist.is_empty() {
                state.is_playing = false;
                state.current_track_index = 0;
                return None;
            }
            state.current_track_index = (state.current_track_index + 1) % state.playlist.len();
            state.seek_position_sec = 0.0;
            state.is_playing = true;
            state.play_timestamp = target_server_play_timestamp();
            let _ = self.db.save_room_state(&state);

            RoomBroadcastEvent::PlaybackSync {
                room_id: state.room_id.clone(),
                current_track_index: state.current_track_index,
                is_playing: state.is_playing,
                play_timestamp: state.play_timestamp,
                seek_position_sec: state.seek_position_sec,
                server_now_ms: current_epoch_ms(),
            }
        };

        let next_idx = match &event {
            RoomBroadcastEvent::PlaybackSync {
                current_track_index,
                ..
            } => Some(*current_track_index),
            _ => None,
        };
        let _ = handle.tx.send(event);
        next_idx
    }
}
