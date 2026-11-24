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

/// Multi-Sample Median NTP Filter (Phase 2 Task 2.1)
/// Calculates clock offsets from multiple (client_sent_ms, server_receive_ms) samples and returns the median offset.
/// Reduces jitter and network latency spikes across WiFi.
pub fn calculate_ntp_offset_median(samples: &[(u64, u64)]) -> i64 {
    if samples.is_empty() {
        return 0;
    }
    let mut offsets: Vec<i64> = samples
        .iter()
        .map(|&(client_sent, server_recv)| calculate_ntp_offset(client_sent, server_recv))
        .collect();
    offsets.sort_unstable();
    let mid = offsets.len() / 2;
    if offsets.len() % 2 == 1 {
        offsets[mid]
    } else {
        (offsets[mid - 1] + offsets[mid]) / 2
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_ntp_offset_median() {
        // Samples: (client_sent, server_recv)
        // offsets = server_recv - client_sent
        let samples = vec![
            (1000, 1050), // offset: 50
            (1000, 1020), // offset: 20
            (1000, 1080), // offset: 80
            (1000, 1030), // offset: 30
            (1000, 1040), // offset: 40
        ];
        // Sorted offsets: [20, 30, 40, 50, 80], median = 40
        assert_eq!(calculate_ntp_offset_median(&samples), 40);

        // Empty samples
        assert_eq!(calculate_ntp_offset_median(&[]), 0);

        // Even samples: [10, 20, 30, 40], median = (20 + 30) / 2 = 25
        let even_samples = vec![
            (1000, 1010),
            (1000, 1040),
            (1000, 1020),
            (1000, 1030),
        ];
        assert_eq!(calculate_ntp_offset_median(&even_samples), 25);
    }
}
