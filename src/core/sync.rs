use std::time::{SystemTime, UNIX_EPOCH};

/// Jitter buffer in milliseconds added to scheduled playback timestamp so all devices
/// receive the WebSocket message and prepare Web Audio API buffers before playback starts.
pub const JITTER_BUFFER_MS: u64 = 100;

/// Returns the current server epoch timestamp in milliseconds.
pub fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Calculates the NTP clock offset in milliseconds between client and server.
/// Formula: ntp_offset_ms = server_now_ms - client_sent_ms
pub fn calculate_ntp_offset(client_sent_ms: u64, server_receive_ms: u64) -> i64 {
    (server_receive_ms as i128 - client_sent_ms as i128) as i64
}

/// Computes a synchronized future playback timestamp including the 100ms jitter buffer.
/// Bug #1 fix: ensures every connected client schedules playback at the exact same target time.
pub fn schedule_play_timestamp(ntp_offset_ms: i64) -> u64 {
    let now = current_epoch_ms();
    let adjusted = (now as i128) + (ntp_offset_ms as i128) + (JITTER_BUFFER_MS as i128);
    if adjusted < 0 {
        now + JITTER_BUFFER_MS
    } else {
        adjusted as u64
    }
}

/// Computes canonical server target play timestamp (epoch_ms + JITTER_BUFFER_MS).
pub fn target_server_play_timestamp() -> u64 {
    schedule_play_timestamp(0)
}
