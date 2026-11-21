use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::core::state::{
    AppState, DeviceInfo, RoomBroadcastEvent, DEFAULT_ROOM_ID,
};
use crate::core::sync::{
    calculate_ntp_offset, current_epoch_ms, target_server_play_timestamp,
};

#[derive(Debug, Deserialize)]
#[serde(tag = "action")]
pub enum ClientWsAction {
    #[serde(rename = "join_room")]
    JoinRoom {
        room_id: Option<String>,
        device_name: Option<String>,
        arch: Option<String>,
        client_timestamp_ms: Option<u64>,
    },
    #[serde(rename = "ntp_ping")]
    NtpPing {
        client_timestamp_ms: u64,
    },
    #[serde(rename = "play")]
    Play {
        track_index: Option<usize>,
        seek_position_sec: Option<f64>,
    },
    #[serde(rename = "pause")]
    Pause {
        seek_position_sec: Option<f64>,
    },
    #[serde(rename = "seek")]
    Seek {
        seek_position_sec: f64,
    },
    #[serde(rename = "next_track")]
    NextTrack,
    #[serde(rename = "track_ended")]
    TrackEnded {
        finished_index: usize,
    },
    #[serde(rename = "select_track")]
    SelectTrack {
        track_index: usize,
    },
    #[serde(rename = "remove_track")]
    RemoveTrack {
        track_id: String,
    },
    #[serde(rename = "reorder_playlist")]
    ReorderPlaylist {
        from_index: usize,
        to_index: usize,
    },
    #[serde(rename = "rename_device")]
    RenameDevice {
        device_name: String,
    },
}

#[derive(Debug, Serialize)]
pub struct NtpPongPayload {
    pub event: &'static str,
    pub client_timestamp_ms: u64,
    pub server_timestamp_ms: u64,
    pub ntp_offset_ms: i64,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let client_id = Uuid::new_v4().to_string();
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (direct_tx, mut direct_rx) = mpsc::unbounded_channel::<String>();

    let mut current_room_id = DEFAULT_ROOM_ID.to_string();
    let mut current_device_name = format!(
        "Senandung-{}-{}",
        state.config.arch,
        &client_id[..4].to_uppercase()
    );

    // Subscribe to default room initially
    let mut room_handle = state.get_or_create_room(&current_room_id).await;
    let mut room_rx = room_handle.tx.subscribe();
    let mut global_rx = state.global_tx.subscribe();

    loop {
        tokio::select! {
            // Direct unicast message to this client (e.g. room_state_snapshot or ntp_pong)
            Some(msg_text) = direct_rx.recv() => {
                if ws_sender.send(Message::Text(msg_text)).await.is_err() {
                    break;
                }
            }

            // Room broadcast event
            Ok(event) = room_rx.recv() => {
                if let Ok(json) = serde_json::to_string(&event) {
                    if ws_sender.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
            }

            // Global server broadcast (e.g. graceful shutdown)
            Ok(global_event) = global_rx.recv() => {
                if let Ok(json) = serde_json::to_string(&global_event) {
                    let _ = ws_sender.send(Message::Text(json)).await;
                }
                if matches!(global_event, RoomBroadcastEvent::ServerShutdown { .. }) {
                    let _ = ws_sender.send(Message::Close(None)).await;
                    break;
                }
            }

            // Incoming client message
            maybe_msg = ws_receiver.next() => {
                let Some(Ok(msg)) = maybe_msg else {
                    break;
                };

                match msg {
                    Message::Text(text) => {
                        let Ok(action) = serde_json::from_str::<ClientWsAction>(&text) else {
                            continue;
                        };

                        match action {
                            // Bug #5 Fix: Immediately respond with room_state_snapshot upon join_room
                            ClientWsAction::JoinRoom {
                                room_id,
                                device_name,
                                arch,
                                client_timestamp_ms,
                            } => {
                                let target_room = room_id
                                    .unwrap_or_else(|| DEFAULT_ROOM_ID.to_string());
                                let target_room = if target_room.trim().is_empty() {
                                    DEFAULT_ROOM_ID.to_string()
                                } else {
                                    target_room.trim().to_string()
                                };

                                if let Some(name) = device_name {
                                    if !name.trim().is_empty() {
                                        current_device_name = name.trim().to_string();
                                    }
                                }
                                let device_arch = arch.unwrap_or_else(|| state.config.arch.clone());

                                // Remove from old room if switching rooms
                                if target_room != current_room_id {
                                    remove_user_from_room(&room_handle, &client_id).await;
                                    current_room_id = target_room;
                                    room_handle = state.get_or_create_room(&current_room_id).await;
                                    room_rx = room_handle.tx.subscribe();
                                }

                                let server_now = current_epoch_ms();
                                let ntp_offset = client_timestamp_ms
                                    .map(|c_ts| calculate_ntp_offset(c_ts, server_now))
                                    .unwrap_or(0);

                                let (snapshot_for_client, users_list) = {
                                    let mut r_state = room_handle.state.write().await;
                                    r_state.connected_users.retain(|u| u.client_id != client_id);
                                    r_state.connected_users.push(DeviceInfo {
                                        client_id: client_id.clone(),
                                        device_name: current_device_name.clone(),
                                        arch: device_arch,
                                        joined_at_ms: server_now,
                                    });

                                    let mut snap = r_state.clone();
                                    snap.ntp_offset_ms = ntp_offset;
                                    (snap, r_state.connected_users.clone())
                                };

                                // Send immediate room_state_snapshot BEFORE other events
                                let snapshot_event = RoomBroadcastEvent::RoomStateSnapshot(snapshot_for_client);
                                if let Ok(snap_json) = serde_json::to_string(&snapshot_event) {
                                    if ws_sender.send(Message::Text(snap_json)).await.is_err() {
                                        break;
                                    }
                                }

                                // Notify all members in the room of the updated user list
                                let _ = room_handle.tx.send(RoomBroadcastEvent::UsersUpdated {
                                    room_id: current_room_id.clone(),
                                    connected_users: users_list,
                                });
                            }

                            ClientWsAction::NtpPing { client_timestamp_ms } => {
                                let server_now = current_epoch_ms();
                                let offset = calculate_ntp_offset(client_timestamp_ms, server_now);
                                let pong = NtpPongPayload {
                                    event: "ntp_pong",
                                    client_timestamp_ms,
                                    server_timestamp_ms: server_now,
                                    ntp_offset_ms: offset,
                                };
                                if let Ok(json) = serde_json::to_string(&pong) {
                                    let _ = direct_tx.send(json);
                                }
                            }

                            ClientWsAction::Play { track_index, seek_position_sec } => {
                                let sync_event = {
                                    let mut r_state = room_handle.state.write().await;
                                    if r_state.playlist.is_empty() {
                                        continue;
                                    }
                                    if let Some(idx) = track_index {
                                        if idx < r_state.playlist.len() {
                                            r_state.current_track_index = idx;
                                        }
                                    }
                                    if let Some(pos) = seek_position_sec {
                                        r_state.seek_position_sec = pos.max(0.0);
                                    }
                                    r_state.is_playing = true;
                                    r_state.play_timestamp = target_server_play_timestamp();
                                    let _ = state.db.save_room_state(&r_state);

                                    RoomBroadcastEvent::PlaybackSync {
                                        room_id: r_state.room_id.clone(),
                                        current_track_index: r_state.current_track_index,
                                        is_playing: r_state.is_playing,
                                        play_timestamp: r_state.play_timestamp,
                                        seek_position_sec: r_state.seek_position_sec,
                                        server_now_ms: current_epoch_ms(),
                                    }
                                };
                                let _ = room_handle.tx.send(sync_event);
                            }

                            ClientWsAction::Pause { seek_position_sec } => {
                                let sync_event = {
                                    let mut r_state = room_handle.state.write().await;
                                    if let Some(pos) = seek_position_sec {
                                        r_state.seek_position_sec = pos.max(0.0);
                                    }
                                    r_state.is_playing = false;
                                    r_state.play_timestamp = current_epoch_ms();
                                    let _ = state.db.save_room_state(&r_state);

                                    RoomBroadcastEvent::PlaybackSync {
                                        room_id: r_state.room_id.clone(),
                                        current_track_index: r_state.current_track_index,
                                        is_playing: r_state.is_playing,
                                        play_timestamp: r_state.play_timestamp,
                                        seek_position_sec: r_state.seek_position_sec,
                                        server_now_ms: current_epoch_ms(),
                                    }
                                };
                                let _ = room_handle.tx.send(sync_event);
                            }

                            ClientWsAction::Seek { seek_position_sec } => {
                                let sync_event = {
                                    let mut r_state = room_handle.state.write().await;
                                    r_state.seek_position_sec = seek_position_sec.max(0.0);
                                    r_state.play_timestamp = target_server_play_timestamp();

                                    RoomBroadcastEvent::PlaybackSync {
                                        room_id: r_state.room_id.clone(),
                                        current_track_index: r_state.current_track_index,
                                        is_playing: r_state.is_playing,
                                        play_timestamp: r_state.play_timestamp,
                                        seek_position_sec: r_state.seek_position_sec,
                                        server_now_ms: current_epoch_ms(),
                                    }
                                };
                                let _ = room_handle.tx.send(sync_event);
                            }

                            // Bug #4 Fix: Server controls track advancement
                            ClientWsAction::NextTrack => {
                                let _ = state.advance_to_next_track(&current_room_id).await;
                            }

                            ClientWsAction::TrackEnded { finished_index } => {
                                let should_advance = {
                                    let r_state = room_handle.state.read().await;
                                    r_state.current_track_index == finished_index && !r_state.playlist.is_empty()
                                };
                                if should_advance {
                                    let _ = state.advance_to_next_track(&current_room_id).await;
                                }
                            }

                            ClientWsAction::SelectTrack { track_index } => {
                                let sync_event = {
                                    let mut r_state = room_handle.state.write().await;
                                    if track_index >= r_state.playlist.len() {
                                        continue;
                                    }
                                    r_state.current_track_index = track_index;
                                    r_state.seek_position_sec = 0.0;
                                    r_state.is_playing = true;
                                    r_state.play_timestamp = target_server_play_timestamp();
                                    let _ = state.db.save_room_state(&r_state);

                                    RoomBroadcastEvent::PlaybackSync {
                                        room_id: r_state.room_id.clone(),
                                        current_track_index: r_state.current_track_index,
                                        is_playing: r_state.is_playing,
                                        play_timestamp: r_state.play_timestamp,
                                        seek_position_sec: r_state.seek_position_sec,
                                        server_now_ms: current_epoch_ms(),
                                    }
                                };
                                let _ = room_handle.tx.send(sync_event);
                            }

                            ClientWsAction::RemoveTrack { track_id } => {
                                let event = {
                                    let mut r_state = room_handle.state.write().await;
                                    r_state.playlist.retain(|t| t.id != track_id);
                                    if r_state.current_track_index >= r_state.playlist.len() && !r_state.playlist.is_empty() {
                                        r_state.current_track_index = 0;
                                    }
                                    let _ = state.db.save_room_state(&r_state);
                                    RoomBroadcastEvent::PlaylistUpdated {
                                        room_id: r_state.room_id.clone(),
                                        playlist: r_state.playlist.clone(),
                                        current_track_index: r_state.current_track_index,
                                    }
                                };
                                let _ = room_handle.tx.send(event);
                            }

                            ClientWsAction::ReorderPlaylist { from_index, to_index } => {
                                let event = {
                                    let mut r_state = room_handle.state.write().await;
                                    let len = r_state.playlist.len();
                                    if from_index >= len || to_index >= len {
                                        continue;
                                    }
                                    let item = r_state.playlist.remove(from_index);
                                    r_state.playlist.insert(to_index, item);
                                    if r_state.current_track_index == from_index {
                                        r_state.current_track_index = to_index;
                                    }
                                    let _ = state.db.save_room_state(&r_state);
                                    RoomBroadcastEvent::PlaylistUpdated {
                                        room_id: r_state.room_id.clone(),
                                        playlist: r_state.playlist.clone(),
                                        current_track_index: r_state.current_track_index,
                                    }
                                };
                                let _ = room_handle.tx.send(event);
                            }

                            ClientWsAction::RenameDevice { device_name } => {
                                let trimmed = device_name.trim();
                                if trimmed.is_empty() {
                                    continue;
                                }
                                current_device_name = trimmed.to_string();
                                let users = {
                                    let mut r_state = room_handle.state.write().await;
                                    for u in &mut r_state.connected_users {
                                        if u.client_id == client_id {
                                            u.device_name = current_device_name.clone();
                                        }
                                    }
                                    r_state.connected_users.clone()
                                };
                                let _ = room_handle.tx.send(RoomBroadcastEvent::UsersUpdated {
                                    room_id: current_room_id.clone(),
                                    connected_users: users,
                                });
                            }
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        }
    }

    remove_user_from_room(&room_handle, &client_id).await;
}

async fn remove_user_from_room(
    room_handle: &crate::core::state::RoomHandle,
    client_id: &str,
) {
    let (room_id, users) = {
        let mut r_state = room_handle.state.write().await;
        r_state.connected_users.retain(|u| u.client_id != client_id);
        (r_state.room_id.clone(), r_state.connected_users.clone())
    };
    let _ = room_handle.tx.send(RoomBroadcastEvent::UsersUpdated {
        room_id,
        connected_users: users,
    });
}
