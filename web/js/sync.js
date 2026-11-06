// WebSocket Multi-Device Synchronization Hub Client with NTP Clock Offset Calculation
class SyncClient {
  constructor() {
    this.ws = null;
    this.roomID = localStorage.getItem('senandung_room') || 'main_hall';
    this.clientID = 'client_' + Math.floor(Math.random() * 100000);
    this.clockOffsetMs = 0; // ServerTime - ClientTime
    this.pingInterval = null;
    this.isConnected = false;
    this.onSyncState = null;
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/sync?room=${encodeURIComponent(this.roomID)}&client_id=${this.clientID}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.calculateClockOffset();
      this.pingInterval = setInterval(() => this.calculateClockOffset(), 15000);
      if (this.onConnectionChange) this.onConnectionChange(true);
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.action === 'pong') {
          const now = Date.now();
          const rtt = now - msg.client_time_ms;
          // Asumsi simetris RTT/2
          const estimatedServerTime = msg.server_time_ms + rtt / 2;
          this.clockOffsetMs = estimatedServerTime - now;
          if (this.onClockUpdate) this.onClockUpdate(this.clockOffsetMs);
        } else if (msg.action === 'sync_state') {
          if (this.onSyncState) this.onSyncState(msg);
        }
      } catch (err) {
        console.error("WS Parse error:", err);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      clearInterval(this.pingInterval);
      if (this.onConnectionChange) this.onConnectionChange(false);
      // Auto-reconnect dalam 3 detik
      setTimeout(() => this.connect(), 3000);
    };
  }

  calculateClockOffset() {
    if (!this.isConnected) return;
    this.ws.send(JSON.stringify({
      action: 'ping',
      client_time_ms: Date.now()
    }));
  }

  changeRoom(newRoom) {
    this.roomID = newRoom;
    localStorage.setItem('senandung_room', newRoom);
    if (this.ws) {
      this.ws.close();
    }
  }

  emitPlay(positionSec) {
    if (!this.isConnected) return;
    this.ws.send(JSON.stringify({
      action: 'play',
      position_sec: positionSec
    }));
  }

  emitPause(positionSec) {
    if (!this.isConnected) return;
    this.ws.send(JSON.stringify({
      action: 'pause',
      position_sec: positionSec
    }));
  }

  emitSeek(positionSec) {
    if (!this.isConnected) return;
    this.ws.send(JSON.stringify({
      action: 'seek',
      position_sec: positionSec
    }));
  }

  emitTrackChange(song) {
    if (!this.isConnected) return;
    this.ws.send(JSON.stringify({
      action: 'track_change',
      song: song
    }));
  }
}

window.syncClient = new SyncClient();
