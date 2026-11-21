use std::path::{Path, PathBuf};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::core::state::{RoomState, Track};

const ROOMS_TREE: &str = "rooms_v3";
const TRACKS_TREE: &str = "tracks_v3";

#[derive(Debug, Serialize, Deserialize)]
struct PersistedRoom {
    pub room_id: String,
    pub playlist: Vec<Track>,
    pub current_track_index: usize,
}

pub struct Database {
    db: sled::Db,
    pub db_path: PathBuf,
}

impl Database {
    /// Initializes Sled embedded DB at `/var/lib/senandung/state.db` (or configured data_dir/state.db).
    /// Configured with low memory cache capacity and periodic flush to protect SD Card I/O.
    pub fn open(data_dir: &Path) -> Result<Self> {
        let db_path = data_dir.join("state.db");
        let db = sled::Config::new()
            .path(&db_path)
            .cache_capacity(256 * 1024) // 256KB page cache
            .segment_size(8_192)        // 8KB segment size prevents 20MB+ IO buffer preallocation
            .flush_every_ms(Some(5000)) // Batch writes every 5s to protect SD Card
            .open()
            .with_context(|| format!("Failed to open sled DB at {}", db_path.display()))?;

        Ok(Self { db, db_path })
    }

    pub fn save_room_state(&self, room: &RoomState) -> Result<()> {
        let tree = self.db.open_tree(ROOMS_TREE)?;
        let persisted = PersistedRoom {
            room_id: room.room_id.clone(),
            playlist: room.playlist.clone(),
            current_track_index: room.current_track_index,
        };
        let bytes = serde_json::to_vec(&persisted)?;
        tree.insert(room.room_id.as_bytes(), bytes)?;
        Ok(())
    }

    pub fn load_room_state(&self, room_id: &str) -> Result<RoomState> {
        let tree = self.db.open_tree(ROOMS_TREE)?;
        if let Some(bytes) = tree.get(room_id.as_bytes())? {
            let persisted: PersistedRoom = serde_json::from_slice(&bytes)?;
            let mut state = RoomState::new(&persisted.room_id);
            // Filter out tracks whose files no longer exist on disk
            state.playlist = persisted
                .playlist
                .into_iter()
                .filter(|t| t.file_path.exists())
                .collect();
            if persisted.current_track_index < state.playlist.len() {
                state.current_track_index = persisted.current_track_index;
            }
            return Ok(state);
        }
        Ok(RoomState::new(room_id))
    }

    pub fn save_track(&self, track: &Track) -> Result<()> {
        let tree = self.db.open_tree(TRACKS_TREE)?;
        let bytes = serde_json::to_vec(track)?;
        tree.insert(track.id.as_bytes(), bytes)?;
        Ok(())
    }

    pub fn get_track(&self, track_id: &str) -> Result<Option<Track>> {
        let tree = self.db.open_tree(TRACKS_TREE)?;
        if let Some(bytes) = tree.get(track_id.as_bytes())? {
            let track: Track = serde_json::from_slice(&bytes)?;
            return Ok(Some(track));
        }
        Ok(None)
    }

    pub fn list_all_tracks(&self) -> Result<Vec<Track>> {
        let tree = self.db.open_tree(TRACKS_TREE)?;
        let mut tracks = Vec::new();
        for item in tree.iter() {
            if let Ok((_, val)) = item {
                if let Ok(track) = serde_json::from_slice::<Track>(&val) {
                    if track.file_path.exists() {
                        tracks.push(track);
                    }
                }
            }
        }
        tracks.sort_by(|a, b| b.added_at_ms.cmp(&a.added_at_ms));
        Ok(tracks)
    }

    pub async fn flush_async(&self) -> Result<usize> {
        let flushed = self.db.flush_async().await?;
        Ok(flushed)
    }
}
