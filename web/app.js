// Senandung v3.0.1 Nightly Dev: Live Room Sync, Web Audio API, Buffering UI & Device Manager
(() => {
  'use strict';

  const STORAGE_KEY_DEVICE = 'senandung_device_name';
  const STORAGE_KEY_VIEW = 'senandung_view_mode';
  const STORAGE_KEY_ROOM = 'senandung_room_id';
  const JITTER_BUFFER_MS = 100;

  const DEFAULT_ARTWORK_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' fill='%23181818'/%3E%3Ccircle cx='80' cy='80' r='34' stroke='%23ff0000' stroke-width='4' fill='none'/%3E%3Ccircle cx='80' cy='80' r='10' fill='%23f1f1f1'/%3E%3C/svg%3E";

  // Application Runtime State
  const state = {
    roomId: localStorage.getItem(STORAGE_KEY_ROOM) || 'Lobby',
    deviceName: '',
    arch: detectClientArch(),
    ntpOffsetMs: 0,
    playlist: [],
    currentTrackIndex: 0,
    isPlaying: false,
    loadedTrackId: null,
    ws: null,
    wsConnected: false,
    reconnectTimer: null,
    scheduledPlayTimer: null,
    audioCtx: null,
    audioEl: new Audio(),
    mediaSourceConnected: false
  };

  state.audioEl.preload = 'auto';
  state.audioEl.crossOrigin = 'anonymous';

  // DOM References
  const dom = {
    body: document.body,
    serverVersionBadge: document.getElementById('server-version-badge'),
    wsStatusDot: document.getElementById('ws-status-dot'),
    roomInput: document.getElementById('room-input'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    btnViewToggle: document.getElementById('btn-view-toggle'),
    iconViewDesktop: document.getElementById('icon-view-desktop'),
    iconViewMobile: document.getElementById('icon-view-mobile'),
    viewModeLabel: document.getElementById('view-mode-label'),
    btnDeviceProfile: document.getElementById('btn-device-profile'),
    deviceNameDisplay: document.getElementById('device-name-display'),

    nowPlayingArtwork: document.getElementById('now-playing-artwork'),
    activeRoomLabel: document.getElementById('active-room-label'),
    ntpOffsetBadge: document.getElementById('ntp-offset-badge'),
    nowPlayingTitle: document.getElementById('now-playing-title'),
    nowPlayingArtist: document.getElementById('now-playing-artist'),
    storageStatusBar: document.getElementById('storage-status-bar'),

    listenerCountBadge: document.getElementById('listener-count-badge'),
    connectedUsersList: document.getElementById('connected-users-list'),

    playlistCountLabel: document.getElementById('playlist-count-label'),
    roomErrorBanner: document.getElementById('room-error-banner'),
    roomErrorText: document.getElementById('room-error-text'),
    btnRetryWs: document.getElementById('btn-retry-ws'),
    downloadStatusBanner: document.getElementById('download-status-banner'),
    downloadStatusText: document.getElementById('download-status-text'),
    playlistEmptyState: document.getElementById('playlist-empty-state'),
    roomPlaylistList: document.getElementById('room-playlist-list'),

    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    btnSearchSubmit: document.getElementById('btn-search-submit'),
    searchLoadingState: document.getElementById('search-loading-state'),
    searchErrorState: document.getElementById('search-error-state'),
    searchErrorText: document.getElementById('search-error-text'),
    searchEmptyState: document.getElementById('search-empty-state'),
    searchResultsList: document.getElementById('search-results-list'),

    btnRefreshLibrary: document.getElementById('btn-refresh-library'),
    libraryEmptyState: document.getElementById('library-empty-state'),
    serverLibraryList: document.getElementById('server-library-list'),

    progressRail: document.getElementById('progress-rail'),
    progressBufferedBar: document.getElementById('progress-buffered-bar'),
    progressPlayedBar: document.getElementById('progress-played-bar'),
    timeCurrent: document.getElementById('time-current'),
    bufferPercentLabel: document.getElementById('buffer-percent-label'),
    timeDuration: document.getElementById('time-duration'),

    dockTrackIndex: document.getElementById('dock-track-index'),
    dockTrackTitle: document.getElementById('dock-track-title'),
    dockTrackArtist: document.getElementById('dock-track-artist'),
    btnPlayToggle: document.getElementById('btn-play-toggle'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    btnPlayLabel: document.getElementById('btn-play-label'),
    btnNextTrack: document.getElementById('btn-next-track'),
    volumeSlider: document.getElementById('volume-slider'),

    deviceModalBackdrop: document.getElementById('device-modal-backdrop'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    deviceNameForm: document.getElementById('device-name-form'),
    deviceNameInput: document.getElementById('device-name-input'),
    btnResetDeviceName: document.getElementById('btn-reset-device-name')
  };

  // 1. Register PWA Service Worker
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // 2. Device Name Auto-Generation (Senandung-${arch}-${random4chars})
  function detectClientArch() {
    const ua = navigator.userAgent || '';
    if (/aarch64|arm64/i.test(ua)) return 'ARM64';
    if (/armv7|arm/i.test(ua)) return 'ARMv7';
    if (/x86_64|win64|wow64|amd64/i.test(ua)) return 'X64';
    if (/android|iphone|ipad|mobile/i.test(ua)) return 'ARM64';
    return 'X64';
  }

  function generateAutoDeviceName() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let random4 = '';
    for (let i = 0; i < 4; i++) {
      random4 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `Senandung-${state.arch}-${random4}`;
  }

  function initDeviceName() {
    let saved = localStorage.getItem(STORAGE_KEY_DEVICE);
    if (!saved || !saved.trim()) {
      saved = generateAutoDeviceName();
      localStorage.setItem(STORAGE_KEY_DEVICE, saved);
    }
    state.deviceName = saved.trim();
    dom.deviceNameDisplay.textContent = state.deviceName;
  }

  // 3. Auto-Detect Device Viewport + Manual Toggle
  function applyViewMode(mode) {
    const normalized = mode === 'mobile' ? 'mobile' : 'desktop';
    dom.body.classList.remove('mobile', 'desktop');
    dom.body.classList.add(normalized);

    if (normalized === 'mobile') {
      dom.iconViewDesktop.classList.add('hidden');
      dom.iconViewMobile.classList.remove('hidden');
      dom.viewModeLabel.textContent = 'Mobile';
    } else {
      dom.iconViewMobile.classList.add('hidden');
      dom.iconViewDesktop.classList.remove('hidden');
      dom.viewModeLabel.textContent = 'Desktop';
    }
  }

  function initViewMode() {
    const savedMode = localStorage.getItem(STORAGE_KEY_VIEW);
    if (savedMode === 'mobile' || savedMode === 'desktop') {
      applyViewMode(savedMode);
    } else {
      const detected = window.innerWidth < 768 ? 'mobile' : 'desktop';
      applyViewMode(detected);
    }
  }

  function toggleViewModeManual() {
    const current = dom.body.classList.contains('mobile') ? 'mobile' : 'desktop';
    const next = current === 'mobile' ? 'desktop' : 'mobile';
    localStorage.setItem(STORAGE_KEY_VIEW, next);
    applyViewMode(next);
  }

  // 4. Web Audio API Initialization & Precision Sync Scheduling (Bug #1 Fix)
  function ensureAudioContext() {
    if (!state.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        state.audioCtx = new AudioContextClass();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(() => {});
    }
    if (state.audioCtx && !state.mediaSourceConnected) {
      try {
        const source = state.audioCtx.createMediaElementSource(state.audioEl);
        source.connect(state.audioCtx.destination);
        state.mediaSourceConnected = true;
      } catch (_) {
        // Fallback smoothly if already connected
      }
    }
  }

  function schedulePlay(playTimestamp, ntpOffset, seekPositionSec) {
    ensureAudioContext();
    if (state.scheduledPlayTimer) {
      clearTimeout(state.scheduledPlayTimer);
      state.scheduledPlayTimer = null;
    }

    const now = Date.now();
    const serverTime = now + ntpOffset;
    const rawDelayMs = playTimestamp - serverTime;
    const targetSeek = typeof seekPositionSec === 'number' ? seekPositionSec : 0;

    if (rawDelayMs >= 0) {
      // Target timestamp is in the future (includes 100ms server jitter buffer)
      if (Math.abs(state.audioEl.currentTime - targetSeek) > 0.25) {
        state.audioEl.currentTime = targetSeek;
      }
      state.scheduledPlayTimer = setTimeout(() => {
        state.audioEl.play().catch(() => {});
      }, rawDelayMs);
    } else {
      // Client received event slightly late: compensate seek offset by elapsed time
      const lateSec = Math.min(Math.abs(rawDelayMs) / 1000, 10);
      const compensatedSeek = targetSeek + lateSec + (JITTER_BUFFER_MS / 1000);
      if (
        !Number.isNaN(compensatedSeek) &&
        Math.abs(state.audioEl.currentTime - compensatedSeek) > 0.35
      ) {
        state.audioEl.currentTime = compensatedSeek;
      }
      state.audioEl.play().catch(() => {});
    }
  }

  // 5. Buffering Indicator (Grey Bar) & Playback Progress (Red Bar)
  function updateBufferingBar() {
    const audio = state.audioEl;
    if (audio.buffered && audio.buffered.length > 0 && audio.duration > 0) {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      const percent = Math.min(100, Math.max(0, (bufferedEnd / audio.duration) * 100));
      dom.progressBufferedBar.style.width = `${percent.toFixed(1)}%`;
      dom.bufferPercentLabel.textContent = `Buffer: ${Math.round(percent)}%`;
    } else {
      dom.progressBufferedBar.style.width = '0%';
      dom.bufferPercentLabel.textContent = 'Buffer: 0%';
    }
  }

  function updatePlaybackProgress() {
    const audio = state.audioEl;
    const current = audio.currentTime || 0;
    const duration = audio.duration || 0;
    dom.timeCurrent.textContent = formatSeconds(current);

    if (duration > 0 && Number.isFinite(duration)) {
      const pct = Math.min(100, Math.max(0, (current / duration) * 100));
      dom.progressPlayedBar.style.width = `${pct.toFixed(2)}%`;
      dom.progressRail.setAttribute('aria-valuenow', String(Math.round(pct)));
      dom.timeDuration.textContent = formatSeconds(duration);
    } else {
      dom.progressPlayedBar.style.width = '0%';
      dom.progressRail.setAttribute('aria-valuenow', '0');
    }
  }

  function bindAudioEvents() {
    state.audioEl.addEventListener('progress', updateBufferingBar);
    state.audioEl.addEventListener('loadedmetadata', () => {
      updateBufferingBar();
      updatePlaybackProgress();
    });
    state.audioEl.addEventListener('timeupdate', () => {
      updatePlaybackProgress();
      updateBufferingBar();
    });
    // Bug #4 Fix: When track finishes, ask server for next_track_index instead of advancing locally
    state.audioEl.addEventListener('ended', () => {
      sendWsAction({
        action: 'track_ended',
        finished_index: state.currentTrackIndex
      });
    });
  }

  // 6. WebSocket Live Room Client (Fixes Bugs #1, #3, #4, #5)
  function connectWebSocket() {
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.addEventListener('open', () => {
      state.wsConnected = true;
      dom.wsStatusDot.classList.add('online');
      dom.roomErrorBanner.classList.add('hidden');

      sendWsAction({
        action: 'join_room',
        room_id: state.roomId,
        device_name: state.deviceName,
        arch: state.arch,
        client_timestamp_ms: Date.now()
      });

      sendWsAction({
        action: 'ntp_ping',
        client_timestamp_ms: Date.now()
      });
    });

    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        handleServerWsMessage(msg);
      } catch (_) {}
    });

    ws.addEventListener('close', () => {
      state.wsConnected = false;
      dom.wsStatusDot.classList.remove('online');
      dom.roomErrorText.textContent = 'Koneksi Live Room terputus. Mencoba menghubungkan kembali...';
      dom.roomErrorBanner.classList.remove('hidden');

      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectWebSocket, 2500);
    });
  }

  function sendWsAction(payload) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(payload));
    }
  }

  function handleServerWsMessage(msg) {
    if (msg.event === 'ntp_pong') {
      const rtt = Date.now() - msg.client_timestamp_ms;
      const estimatedServerNow = msg.server_timestamp_ms + Math.round(rtt / 2);
      state.ntpOffsetMs = estimatedServerNow - Date.now();
      dom.ntpOffsetBadge.textContent = `NTP: ${state.ntpOffsetMs >= 0 ? '+' : ''}${state.ntpOffsetMs}ms`;
      return;
    }

    const eventType = msg.event;
    const data = msg.data;

    switch (eventType) {
      // Bug #5 Fix: Immediate room snapshot upon join_room
      case 'room_state_snapshot': {
        state.roomId = data.room_id || state.roomId;
        dom.roomInput.value = state.roomId;
        dom.activeRoomLabel.textContent = state.roomId;

        if (typeof data.ntp_offset_ms === 'number') {
          state.ntpOffsetMs = data.ntp_offset_ms;
          dom.ntpOffsetBadge.textContent = `NTP: ${state.ntpOffsetMs >= 0 ? '+' : ''}${state.ntpOffsetMs}ms`;
        }

        state.playlist = Array.isArray(data.playlist) ? data.playlist : [];
        state.currentTrackIndex = typeof data.current_track_index === 'number' ? data.current_track_index : 0;
        state.isPlaying = Boolean(data.is_playing);

        renderConnectedUsers(data.connected_users || []);
        renderRoomPlaylist();
        syncAudioWithServerState(
          state.currentTrackIndex,
          state.isPlaying,
          data.play_timestamp || Date.now(),
          data.seek_position_sec || 0
        );
        break;
      }

      // Bug #3 Fix: Real-time playlist broadcast to all subscribers
      case 'playlist_updated': {
        state.playlist = Array.isArray(data.playlist) ? data.playlist : [];
        state.currentTrackIndex = typeof data.current_track_index === 'number' ? data.current_track_index : 0;
        renderRoomPlaylist();
        updateNowPlayingMetadata();
        fetchServerLibrary();
        break;
      }

      // Bug #1 & #4 Fix: Authoritative track index & NTP-synchronized playback
      case 'playback_sync': {
        state.currentTrackIndex = typeof data.current_track_index === 'number' ? data.current_track_index : 0;
        state.isPlaying = Boolean(data.is_playing);
        renderRoomPlaylist();
        syncAudioWithServerState(
          state.currentTrackIndex,
          state.isPlaying,
          data.play_timestamp,
          data.seek_position_sec || 0
        );
        break;
      }

      case 'users_updated': {
        renderConnectedUsers(data.connected_users || []);
        break;
      }

      case 'download_progress': {
        handleDownloadProgressEvent(data);
        break;
      }

      case 'server_shutdown': {
        dom.roomErrorText.textContent = 'Server sedang dimatikan dengan aman (Graceful Shutdown).';
        dom.roomErrorBanner.classList.remove('hidden');
        break;
      }
    }
  }

  // 7. Authoritative Audio Track Loading & Sync
  function syncAudioWithServerState(trackIndex, isPlaying, playTimestamp, seekPositionSec) {
    updateNowPlayingMetadata();

    if (!state.playlist.length || trackIndex >= state.playlist.length) {
      state.audioEl.pause();
      state.loadedTrackId = null;
      updateTransportButtonsUI(false, true);
      return;
    }

    const activeTrack = state.playlist[trackIndex];
    const streamUrl = `/api/v1/stream/${encodeURIComponent(activeTrack.id)}`;

    if (state.loadedTrackId !== activeTrack.id) {
      state.loadedTrackId = activeTrack.id;
      state.audioEl.src = streamUrl;
      state.audioEl.load();
      dom.progressBufferedBar.style.width = '0%';
      dom.progressPlayedBar.style.width = '0%';
    }

    updateTransportButtonsUI(isPlaying, false);

    if (isPlaying) {
      schedulePlay(playTimestamp, state.ntpOffsetMs, seekPositionSec);
    } else {
      if (state.scheduledPlayTimer) {
        clearTimeout(state.scheduledPlayTimer);
        state.scheduledPlayTimer = null;
      }
      state.audioEl.pause();
      if (typeof seekPositionSec === 'number' && Math.abs(state.audioEl.currentTime - seekPositionSec) > 0.25) {
        state.audioEl.currentTime = seekPositionSec;
      }
    }
  }

  function updateNowPlayingMetadata() {
    if (!state.playlist.length || state.currentTrackIndex >= state.playlist.length) {
      dom.nowPlayingTitle.textContent = 'Belum Ada Lagu Diputar';
      dom.nowPlayingArtist.textContent = 'Pilih atau unduh lagu dari pencarian YouTube untuk memulai Live Room';
      dom.nowPlayingArtwork.src = DEFAULT_ARTWORK_SVG;
      dom.dockTrackIndex.textContent = '#-';
      dom.dockTrackTitle.textContent = 'Siap Memutar';
      dom.dockTrackArtist.textContent = `Room: ${state.roomId}`;
      updateTransportButtonsUI(false, true);
      return;
    }

    const track = state.playlist[state.currentTrackIndex];
    const humanIdx = state.currentTrackIndex + 1;
    dom.nowPlayingTitle.textContent = track.title;
    dom.nowPlayingArtist.textContent = `${track.artist} • Ditambahkan oleh ${track.added_by}`;
    dom.nowPlayingArtwork.src = track.thumbnail_url || DEFAULT_ARTWORK_SVG;
    dom.timeDuration.textContent = formatSeconds(track.duration_sec || 0);

    dom.dockTrackIndex.textContent = `#${humanIdx}`;
    dom.dockTrackTitle.textContent = track.title;
    dom.dockTrackArtist.textContent = track.artist;
    updateTransportButtonsUI(state.isPlaying, false);
  }

  function updateTransportButtonsUI(isPlaying, disabled) {
    dom.btnPlayToggle.disabled = Boolean(disabled);
    dom.btnNextTrack.disabled = Boolean(disabled);

    if (isPlaying) {
      dom.iconPlay.classList.add('hidden');
      dom.iconPause.classList.remove('hidden');
      dom.btnPlayLabel.textContent = 'Jeda';
    } else {
      dom.iconPause.classList.add('hidden');
      dom.iconPlay.classList.remove('hidden');
      dom.btnPlayLabel.textContent = 'Putar';
    }
  }

  // 8. Rendering Functions
  function renderConnectedUsers(users) {
    dom.listenerCountBadge.textContent = String(users.length || 1);
    dom.connectedUsersList.innerHTML = '';

    if (!users.length) {
      const li = document.createElement('li');
      li.className = 'listener-chip';
      li.textContent = `${state.deviceName} (Anda)`;
      dom.connectedUsersList.appendChild(li);
      return;
    }

    users.forEach((u) => {
      const li = document.createElement('li');
      li.className = 'listener-chip';
      const isSelf = u.device_name === state.deviceName;
      li.textContent = isSelf ? `${u.device_name} (Anda)` : `${u.device_name} [${u.arch}]`;
      dom.connectedUsersList.appendChild(li);
    });
  }

  function renderRoomPlaylist() {
    dom.roomPlaylistList.innerHTML = '';
    const count = state.playlist.length;
    dom.playlistCountLabel.textContent = `${count} lagu`;

    if (count === 0) {
      dom.playlistEmptyState.classList.remove('hidden');
      return;
    }
    dom.playlistEmptyState.classList.add('hidden');

    state.playlist.forEach((track, idx) => {
      const li = document.createElement('li');
      li.className = `track-row${idx === state.currentTrackIndex ? ' active-track' : ''}`;

      const left = document.createElement('div');
      left.className = 'track-row-left';

      const idxBadge = document.createElement('span');
      idxBadge.className = 'track-index-badge';
      idxBadge.textContent = idx === state.currentTrackIndex && state.isPlaying ? '▶' : `#${idx + 1}`;

      const thumb = document.createElement('img');
      thumb.className = 'track-thumb';
      thumb.src = track.thumbnail_url || DEFAULT_ARTWORK_SVG;
      thumb.alt = '';
      thumb.width = 48;
      thumb.height = 48;
      thumb.loading = 'lazy';

      const info = document.createElement('div');
      info.className = 'track-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'track-title';
      titleEl.textContent = track.title;

      const subEl = document.createElement('div');
      subEl.className = 'track-sub';
      subEl.textContent = `${track.artist} • ${formatSeconds(track.duration_sec)} • oleh ${track.added_by}`;

      info.appendChild(titleEl);
      info.appendChild(subEl);

      left.appendChild(idxBadge);
      left.appendChild(thumb);
      left.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'track-actions';

      const btnPlayThis = document.createElement('button');
      btnPlayThis.type = 'button';
      btnPlayThis.className = 'btn-secondary btn-small';
      btnPlayThis.textContent = idx === state.currentTrackIndex && state.isPlaying ? 'Sedang Diputar' : 'Putar';
      btnPlayThis.addEventListener('click', () => {
        ensureAudioContext();
        sendWsAction({
          action: 'select_track',
          track_index: idx
        });
      });

      const btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'btn-secondary btn-small';
      btnRemove.setAttribute('aria-label', `Hapus ${track.title} dari playlist`);
      btnRemove.textContent = 'Hapus';
      btnRemove.addEventListener('click', () => {
        sendWsAction({
          action: 'remove_track',
          track_id: track.id
        });
      });

      actions.appendChild(btnPlayThis);
      actions.appendChild(btnRemove);

      li.appendChild(left);
      li.appendChild(actions);
      dom.roomPlaylistList.appendChild(li);
    });
  }

  function handleDownloadProgressEvent(data) {
    if (data.status === 'queued' || data.status === 'downloading') {
      dom.downloadStatusText.textContent = `Mengunduh "${data.title}" ke disk server (${data.status})...`;
      dom.downloadStatusBanner.classList.remove('hidden');
    } else if (data.status === 'completed') {
      dom.downloadStatusText.textContent = `Selesai mengunduh "${data.title}" dan ditambahkan ke playlist!`;
      dom.downloadStatusBanner.classList.remove('hidden');
      setTimeout(() => {
        dom.downloadStatusBanner.classList.add('hidden');
      }, 3500);
    } else if (data.status === 'failed') {
      dom.downloadStatusBanner.classList.add('hidden');
      dom.roomErrorText.textContent = `Unduhan "${data.title}" gagal: ${data.message || 'Kesalahan yt-dlp'}`;
      dom.roomErrorBanner.classList.remove('hidden');
    }
  }

  // 9. Search YouTube & Enqueue Download
  async function handleSearchSubmit(ev) {
    ev.preventDefault();
    const query = dom.searchInput.value.trim();
    if (!query) return;

    dom.searchEmptyState.classList.add('hidden');
    dom.searchErrorState.classList.add('hidden');
    dom.searchLoadingState.classList.remove('hidden');
    dom.btnSearchSubmit.disabled = true;
    dom.searchResultsList.innerHTML = '';

    try {
      const resp = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
      const data = await resp.json();
      dom.searchLoadingState.classList.add('hidden');

      if (!resp.ok) {
        dom.searchErrorText.textContent = data.details || data.error || 'Pencarian YouTube gagal.';
        dom.searchErrorState.classList.remove('hidden');
        return;
      }

      const items = Array.isArray(data.results) ? data.results : [];
      if (items.length === 0) {
        dom.searchEmptyState.classList.remove('hidden');
        dom.searchEmptyState.querySelector('.empty-desc').textContent =
          `Tidak ditemukan hasil untuk "${query}".`;
        return;
      }

      renderSearchResults(items);
    } catch (err) {
      dom.searchLoadingState.classList.add('hidden');
      dom.searchErrorText.textContent = `Gagal menghubungi server: ${err.message}`;
      dom.searchErrorState.classList.remove('hidden');
    } finally {
      dom.btnSearchSubmit.disabled = false;
    }
  }

  function renderSearchResults(items) {
    dom.searchResultsList.innerHTML = '';
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'track-row';

      const left = document.createElement('div');
      left.className = 'track-row-left';

      const thumb = document.createElement('img');
      thumb.className = 'track-thumb';
      thumb.src = item.thumbnail_url || DEFAULT_ARTWORK_SVG;
      thumb.alt = '';
      thumb.width = 48;
      thumb.height = 48;
      thumb.loading = 'lazy';

      const info = document.createElement('div');
      info.className = 'track-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'track-title';
      titleEl.textContent = item.title;

      const subEl = document.createElement('div');
      subEl.className = 'track-sub';
      subEl.textContent = `${item.artist} • ${formatSeconds(item.duration_sec)}`;

      info.appendChild(titleEl);
      info.appendChild(subEl);

      left.appendChild(thumb);
      left.appendChild(info);

      const btnDownload = document.createElement('button');
      btnDownload.type = 'button';
      btnDownload.className = 'btn-primary btn-small';
      btnDownload.textContent = 'Unduh ke Room';
      btnDownload.addEventListener('click', () => enqueueDownload(item, btnDownload));

      li.appendChild(left);
      li.appendChild(btnDownload);
      dom.searchResultsList.appendChild(li);
    });
  }

  async function enqueueDownload(item, btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'Dalam Antrean...';

    try {
      const resp = await fetch('/api/v1/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtube_id: item.youtube_id,
          title: item.title,
          artist: item.artist,
          duration_sec: item.duration_sec,
          thumbnail_url: item.thumbnail_url,
          room_id: state.roomId,
          requested_by: state.deviceName
        })
      });

      if (resp.ok) {
        btnEl.textContent = 'Diunduh';
      } else {
        btnEl.disabled = false;
        btnEl.textContent = 'Coba Lagi';
      }
    } catch (_) {
      btnEl.disabled = false;
      btnEl.textContent = 'Coba Lagi';
    }
  }

  // 10. Server Health & Disk Library
  async function fetchServerHealth() {
    try {
      const resp = await fetch('/api/v1/health');
      if (!resp.ok) return;
      const info = await resp.json();
      dom.serverVersionBadge.textContent = `v${info.version}`;
      const modeText = info.music_storage_fallback
        ? `Fallback Internal (${info.music_storage_path})`
        : `Utama HDD (${info.music_storage_path})`;
      dom.storageStatusBar.textContent = `Penyimpanan Aktif: ${modeText}`;
    } catch (_) {}
  }

  async function fetchServerLibrary() {
    try {
      const resp = await fetch('/api/v1/tracks');
      if (!resp.ok) return;
      const data = await resp.json();
      const tracks = Array.isArray(data.tracks) ? data.tracks : [];
      renderServerLibrary(tracks);
    } catch (_) {}
  }

  function renderServerLibrary(tracks) {
    dom.serverLibraryList.innerHTML = '';
    if (!tracks.length) {
      dom.libraryEmptyState.classList.remove('hidden');
      return;
    }
    dom.libraryEmptyState.classList.add('hidden');

    tracks.forEach((track) => {
      const li = document.createElement('li');
      li.className = 'track-row';

      const left = document.createElement('div');
      left.className = 'track-row-left';

      const thumb = document.createElement('img');
      thumb.className = 'track-thumb';
      thumb.src = track.thumbnail_url || DEFAULT_ARTWORK_SVG;
      thumb.alt = '';
      thumb.width = 48;
      thumb.height = 48;
      thumb.loading = 'lazy';

      const info = document.createElement('div');
      info.className = 'track-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'track-title';
      titleEl.textContent = track.title;

      const subEl = document.createElement('div');
      subEl.className = 'track-sub';
      subEl.textContent = `${track.artist} • ${formatSeconds(track.duration_sec)}`;

      info.appendChild(titleEl);
      info.appendChild(subEl);

      left.appendChild(thumb);
      left.appendChild(info);

      const btnAdd = document.createElement('button');
      btnAdd.type = 'button';
      btnAdd.className = 'btn-secondary btn-small';
      btnAdd.textContent = '+ Room';
      btnAdd.addEventListener('click', () => enqueueDownload(track, btnAdd));

      li.appendChild(left);
      li.appendChild(btnAdd);
      dom.serverLibraryList.appendChild(li);
    });
  }

  // 11. UI Interaction Bindings & Keyboard Accessibility (R-32)
  function bindUiControls() {
    dom.btnViewToggle.addEventListener('click', toggleViewModeManual);

    dom.btnJoinRoom.addEventListener('click', () => {
      const target = dom.roomInput.value.trim() || 'Lobby';
      state.roomId = target;
      localStorage.setItem(STORAGE_KEY_ROOM, target);
      sendWsAction({
        action: 'join_room',
        room_id: target,
        device_name: state.deviceName,
        arch: state.arch,
        client_timestamp_ms: Date.now()
      });
    });

    dom.roomInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        dom.btnJoinRoom.click();
      }
    });

    dom.btnRetryWs.addEventListener('click', connectWebSocket);
    dom.searchForm.addEventListener('submit', handleSearchSubmit);
    dom.btnRefreshLibrary.addEventListener('click', fetchServerLibrary);

    dom.btnPlayToggle.addEventListener('click', () => {
      ensureAudioContext();
      if (state.isPlaying) {
        sendWsAction({
          action: 'pause',
          seek_position_sec: state.audioEl.currentTime || 0
        });
      } else {
        sendWsAction({
          action: 'play',
          track_index: state.currentTrackIndex,
          seek_position_sec: state.audioEl.currentTime || 0
        });
      }
    });

    dom.btnNextTrack.addEventListener('click', () => {
      ensureAudioContext();
      sendWsAction({ action: 'next_track' });
    });

    dom.volumeSlider.addEventListener('input', () => {
      state.audioEl.volume = parseFloat(dom.volumeSlider.value);
    });

    dom.progressRail.addEventListener('click', (ev) => {
      if (!state.audioEl.duration || !Number.isFinite(state.audioEl.duration)) return;
      const rect = dom.progressRail.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const seekSec = ratio * state.audioEl.duration;
      sendWsAction({
        action: 'seek',
        seek_position_sec: seekSec
      });
    });

    dom.progressRail.addEventListener('keydown', (ev) => {
      if (!state.audioEl.duration) return;
      if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        sendWsAction({
          action: 'seek',
          seek_position_sec: Math.min(state.audioEl.duration, (state.audioEl.currentTime || 0) + 5)
        });
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        sendWsAction({
          action: 'seek',
          seek_position_sec: Math.max(0, (state.audioEl.currentTime || 0) - 5)
        });
      }
    });

    // Device Profile Modal
    dom.btnDeviceProfile.addEventListener('click', () => {
      dom.deviceNameInput.value = state.deviceName;
      dom.deviceModalBackdrop.classList.remove('hidden');
      dom.deviceNameInput.focus();
    });

    const closeModal = () => {
      dom.deviceModalBackdrop.classList.add('hidden');
      dom.btnDeviceProfile.focus();
    };

    dom.btnCloseModal.addEventListener('click', closeModal);
    dom.deviceModalBackdrop.addEventListener('click', (ev) => {
      if (ev.target === dom.deviceModalBackdrop) closeModal();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !dom.deviceModalBackdrop.classList.contains('hidden')) {
        closeModal();
      }
    });

    dom.btnResetDeviceName.addEventListener('click', () => {
      dom.deviceNameInput.value = generateAutoDeviceName();
    });

    dom.deviceNameForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const newName = dom.deviceNameInput.value.trim();
      if (!newName) return;
      state.deviceName = newName;
      localStorage.setItem(STORAGE_KEY_DEVICE, newName);
      dom.deviceNameDisplay.textContent = newName;
      sendWsAction({
        action: 'rename_device',
        device_name: newName
      });
      closeModal();
    });

    // Periodic NTP resync every 20 seconds
    setInterval(() => {
      sendWsAction({
        action: 'ntp_ping',
        client_timestamp_ms: Date.now()
      });
    }, 20000);
  }

  function formatSeconds(sec) {
    const total = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Bootstrap Application
  function init() {
    registerServiceWorker();
    initDeviceName();
    initViewMode();
    dom.roomInput.value = state.roomId;
    dom.activeRoomLabel.textContent = state.roomId;
    bindAudioEvents();
    bindUiControls();
    fetchServerHealth();
    fetchServerLibrary();
    connectWebSocket();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
