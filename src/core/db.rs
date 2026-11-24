use std::env;
use std::path::{Path, PathBuf};
use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::core::state::{RoomState, Track};

const ROOMS_TREE: &str = "rooms_v3";
const TRACKS_TREE: &str = "tracks_v3";
const CUSTOM_PLAYLISTS_TREE: &str = "custom_playlists_v3";

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
    /// Initializes Sled embedded DB at `data_dir/state.db` with automatic fallback to `/tmp/senandung/state.db`
    /// and a final temporary in-memory Sled mode if all disk paths are read-only (`EROFS` / `EACCES`).
    pub fn open(data_dir: &Path) -> Result<Self> {
        let candidates = [
            data_dir.join("state.db"),
            PathBuf::from("/mnt/hdd1/senandung/state.db"),
            env::temp_dir().join("senandung_state.db"),
            PathBuf::from("/tmp/senandung_state.db"),
        ];

        for db_path in &candidates {
            if let Some(parent) = db_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let cfg = sled::Config::new()
                .path(db_path)
                .cache_capacity(256 * 1024) // 256KB page cache
                .segment_size(8_192)        // 8KB segment size prevents 20MB+ IO buffer preallocation
                .flush_every_ms(Some(5000)); // Batch writes every 5s to protect SD Card

            if let Ok(db) = cfg.open() {
                return Ok(Self {
                    db,
                    db_path: db_path.clone(),
                });
            }
        }

        // Ultimate zero-crash fallback: temporary Sled instance when entire filesystem is read-only
        let tmp_path = env::temp_dir().join("senandung_mem_state.db");
        let db = sled::Config::new()
            .path(&tmp_path)
            .temporary(true)
            .cache_capacity(256 * 1024)
            .segment_size(8_192)
            .open()?;

        Ok(Self {
            db,
            db_path: PathBuf::from("memory://temporary-sled"),
        })
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

    /// Save tracks for a specific custom playlist name
    pub fn save_custom_playlist(&self, name: &str, tracks: &[Track]) -> Result<()> {
        let tree = self.db.open_tree(CUSTOM_PLAYLISTS_TREE)?;
        let bytes = serde_json::to_vec(tracks)?;
        tree.insert(name.as_bytes(), bytes)?;
        Ok(())
    }

    /// Load all custom playlists as a HashMap of name -> tracks
    pub fn load_custom_playlists(&self) -> Result<std::collections::HashMap<String, Vec<Track>>> {
        let tree = self.db.open_tree(CUSTOM_PLAYLISTS_TREE)?;
        let mut map = std::collections::HashMap::new();
        for item in tree.iter() {
            if let Ok((key, val)) = item {
                if let (Ok(name), Ok(tracks)) = (
                    std::str::from_utf8(&key),
                    serde_json::from_slice::<Vec<Track>>(&val),
                ) {
                    map.insert(name.to_string(), tracks);
                }
            }
        }
        if !map.contains_key("Favorit") {
            map.insert("Favorit".to_string(), Vec::new());
        }
        Ok(map)
    }

    /// Delete a custom playlist by name
    pub fn delete_custom_playlist(&self, name: &str) -> Result<bool> {
        let tree = self.db.open_tree(CUSTOM_PLAYLISTS_TREE)?;
        let removed = tree.remove(name.as_bytes())?;
        Ok(removed.is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_custom_playlist_persistence() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let db = Database::open(tmp_dir.path()).unwrap();

        // Initially Favorit should exist
        let playlists = db.load_custom_playlists().unwrap();
        assert!(playlists.contains_key("Favorit"));

        let test_tracks = vec![Track {
            id: "track-1".to_string(),
            youtube_id: "yt-1".to_string(),
            title: "Test Title".to_string(),
            artist: "Test Artist".to_string(),
            duration_sec: 180,
            thumbnail_url: "http://example.com/thumb.jpg".to_string(),
            file_path: PathBuf::from("/tmp/track-1.mp3"),
            added_by: "Test".to_string(),
            added_at_ms: 1000,
        }];

        db.save_custom_playlist("Santai", &test_tracks).unwrap();
        let updated = db.load_custom_playlists().unwrap();
        assert_eq!(updated.get("Santai").unwrap().len(), 1);
        assert_eq!(updated.get("Santai").unwrap()[0].title, "Test Title");

        let deleted = db.delete_custom_playlist("Santai").unwrap();
        assert!(deleted);
        let after_delete = db.load_custom_playlists().unwrap();
        assert!(!after_delete.contains_key("Santai"));
    }
}
