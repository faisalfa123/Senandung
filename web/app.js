// Senandung v3.0.1 Nightly Dev: 1:1 YouTube Music UI, Retro Anime/Doodle Avatar Token Manager,
// Cast Room Sync, Web Audio API Precision Scheduler & Grey Buffering Indicator
(() => {
  'use strict';

  const STORAGE_KEY_TOKEN = 'senandung_device_token';
  const STORAGE_KEY_DEVICE = 'senandung_device_name';
  const STORAGE_KEY_AVATAR = 'senandung_avatar_index';
  const STORAGE_KEY_VIEW = 'senandung_view_mode';
  const STORAGE_KEY_ROOM = 'senandung_room_id';
  const JITTER_BUFFER_MS = 100;

  const DEFAULT_ARTWORK_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%23161616'/%3E%3Ccircle cx='160' cy='90' r='44' stroke='%23ff0000' stroke-width='5' fill='none'/%3E%3Ccircle cx='160' cy='90' r='14' fill='%23ffffff'/%3E%3C/svg%3E";

  // 8 Hand-Crafted Retro Anime / Doodle Art SVG Avatars (Zero external dependency)
  const RETRO_AVATARS = [
    // 0: 90s City Pop Anime Girl with Headphones
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#ff2a85"/><circle cx="32" cy="34" r="16" fill="#ffe0bd"/><path d="M14 32c0-13 8-22 18-22s18 9 18 22c-4-6-10-9-18-9s-14 3-18 9z" fill="#1a103c"/><rect x="10" y="28" width="6" height="12" rx="3" fill="#00f0ff" stroke="#1a103c" stroke-width="2"/><rect x="48" y="28" width="6" height="12" rx="3" fill="#00f0ff" stroke="#1a103c" stroke-width="2"/><ellipse cx="26" cy="34" rx="2.5" ry="3.5" fill="#1a103c"/><ellipse cx="38" cy="34" rx="2.5" ry="3.5" fill="#1a103c"/><circle cx="25" cy="32.5" r="1" fill="#fff"/><circle cx="37" cy="32.5" r="1" fill="#fff"/><path d="M29 42q3 3 6 0" stroke="#d94e67" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
    // 1: Cyber Visor Mecha Pilot Retro Anime
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#1b1447"/><path d="M12 22l8-12h24l8 12-4 28H16z" fill="#2d3446" stroke="#00ffcc" stroke-width="2"/><rect x="16" y="26" width="32" height="10" rx="4" fill="#ff0055"/><path d="M20 29h14" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><path d="M26 44h12" stroke="#00ffcc" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    // 2: Lo-Fi Boombox Cat Doodle
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#ff9f1c"/><path d="M16 26V14l10 8h12l10-8v12c4 4 4 22-16 22S12 30 16 26z" fill="#ffffff" stroke="#111111" stroke-width="2.5"/><circle cx="25" cy="32" r="2.5" fill="#111111"/><circle cx="39" cy="32" r="2.5" fill="#111111"/><path d="M29 37l3 2 3-2" stroke="#ff2a85" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`,
    // 3: Retro Cassette Tape Doodle
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#00bbf9"/><rect x="10" y="18" width="44" height="28" rx="4" fill="#222222" stroke="#ffffff" stroke-width="2"/><rect x="15" y="22" width="34" height="14" rx="2" fill="#fee440"/><circle cx="24" cy="29" r="4" fill="#222222"/><circle cx="40" cy="29" r="4" fill="#222222"/><path d="M18 46l4-6h20l4 6" fill="#444444"/></svg>`,
    // 4: 80s Synthwave Shades Boy Anime
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#7209b7"/><circle cx="32" cy="35" r="15" fill="#f7d6bf"/><path d="M15 26l6-12 7 6 8-8 6 8 7-4-2 12z" fill="#0d0814"/><polygon points="18,30 31,30 29,37 19,37" fill="#00f5d4"/><polygon points="33,30 46,30 45,37 35,37" fill="#00f5d4"/><path d="M28 43h8" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`,
    // 5: Vinyl Turntable Doodle Character
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#f15bb5"/><circle cx="32" cy="32" r="21" fill="#141414" stroke="#ffffff" stroke-width="2"/><circle cx="32" cy="32" r="8" fill="#ff0000"/><circle cx="32" cy="32" r="2.5" fill="#ffffff"/></svg>`,
    // 6: Pixel Retro Arcade Ghost Doodle
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#101820"/><path d="M18 30c0-9 6-16 14-16s14 7 14 16v18l-5-4-4 4-5-4-5 4-4-4-5 4V30z" fill="#00e676"/><circle cx="27" cy="29" r="3.5" fill="#ffffff"/><circle cx="37" cy="29" r="3.5" fill="#ffffff"/><circle cx="28" cy="29" r="1.8" fill="#101820"/><circle cx="38" cy="29" r="1.8" fill="#101820"/></svg>`,
    // 7: Manga Punk Star Musician
    `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#e63946"/><circle cx="32" cy="35" r="15" fill="#ffe3cc"/><path d="M14 28c3-12 12-16 18-16s15 4 18 16c-6-4-12-5-18-5s-12 1-18 5z" fill="#f1faee"/><polygon points="24,29 27,34 22,34" fill="#1d3557"/><circle cx="38" cy="33" r="2.5" fill="#1d3557"/><path d="M27 42l10-2" stroke="#1d3557" stroke-width="2.2" stroke-linecap="round"/></svg>`
  ];

  // Runtime State
  const state = {
    deviceToken: '',
    avatarIndex: 0,
    roomId: localStorage.getItem(STORAGE_KEY_ROOM) || 'Lobby',
    deviceName: '',
    arch: detectClientArch(),
    ntpOffsetMs: 0,
    playlist: [],
    libraryTracks: [],
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

  // DOM Elements
  const dom = {
    body: document.body,
    sidebar: document.getElementById('app-sidebar'),
    btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
    brandHomeLink: document.getElementById('brand-home-link'),
    serverVersionBadge: document.getElementById('server-version-badge'),

    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    btnSearchSubmit: document.getElementById('btn-search-submit'),
    btnSearchClear: document.getElementById('btn-search-clear'),
    btnMobileSearchToggle: document.getElementById('btn-mobile-search-toggle'),

    btnViewToggle: document.getElementById('btn-view-toggle'),
    iconViewDesktop: document.getElementById('icon-view-desktop'),
    iconViewMobile: document.getElementById('icon-view-mobile'),
    viewModeLabel: document.getElementById('view-mode-label'),

    btnCastRoom: document.getElementById('btn-cast-room'),
    topbarRoomBadge: document.getElementById('topbar-room-badge'),
    wsStatusDot: document.getElementById('ws-status-dot'),

    btnDeviceProfile: document.getElementById('btn-device-profile'),
    topbarAvatarSvg: document.getElementById('topbar-avatar-svg'),
    shelfUserAvatar: document.getElementById('shelf-user-avatar'),
    shelfDeviceEyebrow: document.getElementById('shelf-device-eyebrow'),
    deviceNameDisplay: document.getElementById('device-name-display'),

    activeRoomLabel: document.getElementById('active-room-label'),
    ntpOffsetBadge: document.getElementById('ntp-offset-badge'),
    storageStatusBar: document.getElementById('storage-status-bar'),
    listenerCountBadge: document.getElementById('listener-count-badge'),
    connectedUsersList: document.getElementById('connected-users-list'),

    playlistCountLabel: document.getElementById('playlist-count-label'),
    roomErrorBanner: document.getElementById('room-error-banner'),
    roomErrorText: document.getElementById('room-error-text'),
    btnRetryWs: document.getElementById('btn-retry-ws'),
    downloadStatusBanner: document.getElementById('download-status-banner'),
    downloadStatusText: document.getElementById('download-status-text'),

    shelfSearchResults: document.getElementById('shelf-search-results'),
    btnCloseSearchShelf: document.getElementById('btn-close-search-shelf'),
    searchLoadingState: document.getElementById('search-loading-state'),
    searchErrorState: document.getElementById('search-error-state'),
    searchErrorText: document.getElementById('search-error-text'),
    searchEmptyState: document.getElementById('search-empty-state'),
    searchResultsList: document.getElementById('search-results-list'),

    shelfQuickCollage: document.getElementById('shelf-quick-collage'),
    quickCollageCarousel: document.getElementById('quick-collage-carousel'),

    shelfListenAgain: document.getElementById('shelf-listen-again'),
    btnRefreshLibrary: document.getElementById('btn-refresh-library'),
    libraryEmptyState: document.getElementById('library-empty-state'),
    serverLibraryList: document.getElementById('server-library-list'),

    shelfListenTogether: document.getElementById('shelf-listen-together'),
    playlistEmptyState: document.getElementById('playlist-empty-state'),
    roomPlaylistList: document.getElementById('room-playlist-list'),

    progressRail: document.getElementById('progress-rail'),
    progressBufferedBar: document.getElementById('progress-buffered-bar'),
    progressPlayedBar: document.getElementById('progress-played-bar'),
    timeCurrent: document.getElementById('time-current'),
    bufferPercentLabel: document.getElementById('buffer-percent-label'),
    timeDuration: document.getElementById('time-duration'),

    nowPlayingArtwork: document.getElementById('now-playing-artwork'),
    nowPlayingTitle: document.getElementById('now-playing-title'),
    nowPlayingArtist: document.getElementById('now-playing-artist'),
    dockTrackIndex: document.getElementById('dock-track-index'),
    dockTrackTitle: document.getElementById('dock-track-title'),
    dockTrackArtist: document.getElementById('dock-track-artist'),

    btnPrevTrack: document.getElementById('btn-prev-track'),
    btnPlayToggle: document.getElementById('btn-play-toggle'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    btnPlayLabel: document.getElementById('btn-play-label'),
    btnNextTrack: document.getElementById('btn-next-track'),
    volumeSlider: document.getElementById('volume-slider'),

    deviceModalBackdrop: document.getElementById('device-modal-backdrop'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    modalAvatarPreview: document.getElementById('modal-avatar-preview'),
    deviceTokenBadge: document.getElementById('device-token-badge'),
    btnRerollAvatar: document.getElementById('btn-reroll-avatar'),
    deviceNameForm: document.getElementById('device-name-form'),
    deviceNameInput: document.getElementById('device-name-input'),
    deviceAutosaveStatus: document.getElementById('device-autosave-status'),
    btnResetDeviceName: document.getElementById('btn-reset-device-name'),

    roomModalBackdrop: document.getElementById('room-modal-backdrop'),
    btnCloseRoomModal: document.getElementById('btn-close-room-modal'),
    btnOpenRoomModalSide: document.getElementById('btn-open-room-modal-side'),
    btnOpenRoomModalMain: document.getElementById('btn-open-room-modal-main'),
    roomInput: document.getElementById('room-input'),
    btnJoinRoom: document.getElementById('btn-join-room')
  };

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // 1. Token-Bound Device Identity & Random Retro Anime/Doodle Avatar (Requirement #1)
  function detectClientArch() {
    const ua = navigator.userAgent || '';
    if (/aarch64|arm64/i.test(ua)) return 'ARM64';
    if (/armv7|arm/i.test(ua)) return 'ARMv7';
    if (/x86_64|win64|wow64|amd64/i.test(ua)) return 'X64';
    if (/android|iphone|ipad|mobile/i.test(ua)) return 'ARM64';
    return 'X64';
  }

  function generateRandomToken(len) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function generateAutoDeviceName() {
    return `Senandung-${state.arch}-${generateRandomToken(4)}`;
  }

  function initDeviceProfileAndAvatar() {
    let token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (!token || !token.trim()) {
      token = `SND-${generateRandomToken(8)}`;
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
    }
    state.deviceToken = token;

    const tokenNameKey = `${STORAGE_KEY_DEVICE}_${token}`;
    const tokenAvatarKey = `${STORAGE_KEY_AVATAR}_${token}`;

    let savedName = localStorage.getItem(tokenNameKey) || localStorage.getItem(STORAGE_KEY_DEVICE);
    if (!savedName || !savedName.trim()) {
      savedName = generateAutoDeviceName();
      localStorage.setItem(STORAGE_KEY_DEVICE, savedName);
      localStorage.setItem(tokenNameKey, savedName);
    }
    state.deviceName = savedName.trim();

    let savedAvatarIdx = parseInt(
      localStorage.getItem(tokenAvatarKey) ?? localStorage.getItem(STORAGE_KEY_AVATAR) ?? '',
      10
    );
    if (Number.isNaN(savedAvatarIdx) || savedAvatarIdx < 0 || savedAvatarIdx >= RETRO_AVATARS.length) {
      // Deterministically pick initial retro avatar from token or random
      savedAvatarIdx = Math.floor(Math.random() * RETRO_AVATARS.length);
      localStorage.setItem(STORAGE_KEY_AVATAR, String(savedAvatarIdx));
      localStorage.setItem(tokenAvatarKey, String(savedAvatarIdx));
    }
    state.avatarIndex = savedAvatarIdx;

    renderAvatarAndDeviceNameUI();
  }

  function saveDeviceProfileByToken(newName, newAvatarIndex) {
    const token = state.deviceToken;
    if (typeof newName === 'string' && newName.trim()) {
      state.deviceName = newName.trim();
      localStorage.setItem(STORAGE_KEY_DEVICE, state.deviceName);
      localStorage.setItem(`${STORAGE_KEY_DEVICE}_${token}`, state.deviceName);
    }
    if (typeof newAvatarIndex === 'number') {
      state.avatarIndex = ((newAvatarIndex % RETRO_AVATARS.length) + RETRO_AVATARS.length) % RETRO_AVATARS.length;
      localStorage.setItem(STORAGE_KEY_AVATAR, String(state.avatarIndex));
      localStorage.setItem(`${STORAGE_KEY_AVATAR}_${token}`, String(state.avatarIndex));
    }
    renderAvatarAndDeviceNameUI();
  }

  function renderAvatarAndDeviceNameUI() {
    const svgMarkup = RETRO_AVATARS[state.avatarIndex] || RETRO_AVATARS[0];
    if (dom.topbarAvatarSvg) dom.topbarAvatarSvg.innerHTML = svgMarkup;
    if (dom.shelfUserAvatar) dom.shelfUserAvatar.innerHTML = svgMarkup;
    if (dom.modalAvatarPreview) dom.modalAvatarPreview.innerHTML = svgMarkup;
    if (dom.deviceNameDisplay) dom.deviceNameDisplay.textContent = state.deviceName;
    if (dom.shelfDeviceEyebrow) dom.shelfDeviceEyebrow.textContent = state.deviceName.toUpperCase();
    if (dom.deviceTokenBadge) dom.deviceTokenBadge.textContent = `Token: ${state.deviceToken}`;
  }

  // 2. Auto-Detect Viewport + Manual Toggle
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
      applyViewMode(window.innerWidth < 768 ? 'mobile' : 'desktop');
    }
  }

  function toggleViewModeManual() {
    const current = dom.body.classList.contains('mobile') ? 'mobile' : 'desktop';
    const next = current === 'mobile' ? 'desktop' : 'mobile';
    localStorage.setItem(STORAGE_KEY_VIEW, next);
    applyViewMode(next);
  }

  // 3. Web Audio API Precision Scheduling (Bug #1 Fix)
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
      } catch (_) {}
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
      if (Math.abs(state.audioEl.currentTime - targetSeek) > 0.25) {
        state.audioEl.currentTime = targetSeek;
      }
      state.scheduledPlayTimer = setTimeout(() => {
        state.audioEl.play().catch(() => {});
      }, rawDelayMs);
    } else {
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

  // 4. Buffering Indicator (Grey Line) & Red Played Line
  function updateBufferingBar() {
    const audio = state.audioEl;
    if (audio.buffered && audio.buffered.length > 0 && audio.duration > 0) {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      const percent = Math.min(100, Math.max(0, (bufferedEnd / audio.duration) * 100));
      dom.progressBufferedBar.style.width = `${percent.toFixed(1)}%`;
      dom.bufferPercentLabel.textContent = `Buffer ${Math.round(percent)}%`;
    } else {
      dom.progressBufferedBar.style.width = '0%';
      dom.bufferPercentLabel.textContent = 'Buffer 0%';
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
    state.audioEl.addEventListener('ended', () => {
      sendWsAction({
        action: 'track_ended',
        finished_index: state.currentTrackIndex
      });
    });
  }

  // 5. WebSocket Live Room Sync
  function connectWebSocket() {
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
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
        handleServerWsMessage(JSON.parse(ev.data));
      } catch (_) {}
    });

    ws.addEventListener('close', () => {
      state.wsConnected = false;
      dom.wsStatusDot.classList.remove('online');
      dom.roomErrorText.textContent = 'Koneksi Live Room terputus. Menghubungkan kembali...';
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
      dom.ntpOffsetBadge.textContent = `NTP ${state.ntpOffsetMs >= 0 ? '+' : ''}${state.ntpOffsetMs}ms`;
      return;
    }

    const data = msg.data || {};
    switch (msg.event) {
      case 'room_state_snapshot': {
        state.roomId = data.room_id || state.roomId;
        dom.roomInput.value = state.roomId;
        dom.activeRoomLabel.textContent = state.roomId;
        if (dom.topbarRoomBadge) dom.topbarRoomBadge.textContent = state.roomId;

        if (typeof data.ntp_offset_ms === 'number') {
          state.ntpOffsetMs = data.ntp_offset_ms;
          dom.ntpOffsetBadge.textContent = `NTP ${state.ntpOffsetMs >= 0 ? '+' : ''}${state.ntpOffsetMs}ms`;
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

      case 'playlist_updated': {
        state.playlist = Array.isArray(data.playlist) ? data.playlist : [];
        state.currentTrackIndex = typeof data.current_track_index === 'number' ? data.current_track_index : 0;
        renderRoomPlaylist();
        updateNowPlayingMetadata();
        fetchServerLibrary();
        break;
      }

      case 'playback_sync': {
        state.currentTrackIndex = typeof data.current_track_index === 'number' ? data.current_track_index : 0;
        state.isPlaying = Boolean(data.is_playing);
        renderRoomPlaylist();
        renderServerLibrary(state.libraryTracks);
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
        dom.roomErrorText.textContent = 'Server dimatikan secara aman (Graceful Shutdown).';
        dom.roomErrorBanner.classList.remove('hidden');
        break;
      }
    }
  }

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
      dom.nowPlayingTitle.textContent = 'Pilih lagu untuk diputar';
      dom.nowPlayingArtist.textContent = `Room ${state.roomId}`;
      dom.nowPlayingArtwork.src = DEFAULT_ARTWORK_SVG;
      dom.dockTrackIndex.textContent = '#-';
      updateTransportButtonsUI(false, true);
      return;
    }

    const track = state.playlist[state.currentTrackIndex];
    dom.nowPlayingTitle.textContent = track.title;
    dom.nowPlayingArtist.textContent = `${track.artist} • Room ${state.roomId}`;
    dom.nowPlayingArtwork.src = track.thumbnail_url || DEFAULT_ARTWORK_SVG;
    dom.timeDuration.textContent = formatSeconds(track.duration_sec || 0);
    dom.dockTrackIndex.textContent = `#${state.currentTrackIndex + 1}`;
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

  // 6. YouTube Music Carousel & Card Builders
  function createWideMediaCard(track, options) {
    const card = document.createElement('article');
    card.className = `ytm-media-card${options.isActive ? ' active-playing' : ''}`;

    const thumbBox = document.createElement('div');
    thumbBox.className = 'ytm-media-thumb-box';

    const img = document.createElement('img');
    img.src = track.thumbnail_url || DEFAULT_ARTWORK_SVG;
    img.alt = track.title;
    img.width = 280;
    img.height = 158;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.src = DEFAULT_ARTWORK_SVG;
    });

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'ytm-play-overlay-btn';
    playBtn.setAttribute('aria-label', `Putar ${track.title}`);
    playBtn.innerHTML = options.isActive && state.isPlaying
      ? `<svg width="42" height="42" viewBox="0 0 24 24" fill="#ffffff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`
      : `<svg width="46" height="46" viewBox="0 0 24 24" fill="#ffffff"><path d="M8 5v14l11-7L8 5Z"/></svg>`;
    playBtn.addEventListener('click', options.onPrimaryClick);

    const badge = document.createElement('span');
    badge.className = 'ytm-card-badge-corner';
    badge.textContent = options.cornerBadge || formatSeconds(track.duration_sec);

    thumbBox.appendChild(img);
    thumbBox.appendChild(playBtn);
    thumbBox.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'ytm-media-meta';

    const textCol = document.createElement('div');
    textCol.className = 'ytm-media-text';

    const titleEl = document.createElement('h3');
    titleEl.className = 'ytm-card-title';
    titleEl.textContent = track.title;

    const subEl = document.createElement('p');
    subEl.className = 'ytm-card-sub';
    subEl.textContent = options.subtitle || track.artist;

    textCol.appendChild(titleEl);
    textCol.appendChild(subEl);
    meta.appendChild(textCol);

    if (options.secondaryLabel && options.onSecondaryClick) {
      const secBtn = document.createElement('button');
      secBtn.type = 'button';
      secBtn.className = 'ytm-card-action-btn';
      secBtn.textContent = options.secondaryLabel;
      secBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        options.onSecondaryClick(secBtn);
      });
      meta.appendChild(secBtn);
    }

    card.appendChild(thumbBox);
    card.appendChild(meta);
    return card;
  }

  function renderQuickCollageRow(tracks) {
    dom.quickCollageCarousel.innerHTML = '';
    const source = tracks.length ? tracks : state.playlist;
    if (!source.length) {
      dom.shelfQuickCollage.classList.add('hidden');
      return;
    }
    dom.shelfQuickCollage.classList.remove('hidden');

    const maxCards = Math.min(8, source.length);
    for (let i = 0; i < maxCards; i++) {
      const t0 = source[i % source.length];
      const t1 = source[(i + 1) % source.length];
      const t2 = source[(i + 2) % source.length];
      const t3 = source[(i + 3) % source.length];

      const card = document.createElement('article');
      card.className = 'ytm-collage-card';

      const grid = document.createElement('div');
      grid.className = 'ytm-collage-grid';
      [t0, t1, t2, t3].forEach((tr) => {
        const im = document.createElement('img');
        im.src = tr.thumbnail_url || DEFAULT_ARTWORK_SVG;
        im.alt = '';
        im.width = 85;
        im.height = 85;
        im.loading = 'lazy';
        im.addEventListener('error', () => {
          im.src = DEFAULT_ARTWORK_SVG;
        });
        grid.appendChild(im);
      });

      const badge = document.createElement('span');
      badge.className = 'ytm-collage-badge';
      badge.textContent = (t0.artist || 'S').charAt(0).toUpperCase();
      grid.appendChild(badge);

      const playOverlay = document.createElement('button');
      playOverlay.type = 'button';
      playOverlay.className = 'ytm-play-overlay-btn';
      playOverlay.setAttribute('aria-label', `Putar ${t0.title}`);
      playOverlay.innerHTML = `<svg width="38" height="38" viewBox="0 0 24 24" fill="#ffffff"><path d="M8 5v14l11-7L8 5Z"/></svg>`;
      playOverlay.addEventListener('click', () => playOrEnqueueTrackImmediately(t0));
      grid.appendChild(playOverlay);

      const titleEl = document.createElement('h3');
      titleEl.className = 'ytm-card-title';
      titleEl.textContent = t0.title;

      const subEl = document.createElement('p');
      subEl.className = 'ytm-card-sub';
      subEl.textContent = `${t0.artist} • Koleksi STB`;

      card.appendChild(grid);
      card.appendChild(titleEl);
      card.appendChild(subEl);
      dom.quickCollageCarousel.appendChild(card);
    }
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
      const isCurrent = idx === state.currentTrackIndex;
      const card = createWideMediaCard(track, {
        isActive: isCurrent,
        cornerBadge: isCurrent && state.isPlaying ? 'LIVE' : `#${idx + 1} • ${formatSeconds(track.duration_sec)}`,
        subtitle: `${track.artist} • oleh ${track.added_by}`,
        onPrimaryClick: () => {
          ensureAudioContext();
          sendWsAction({
            action: 'select_track',
            track_index: idx
          });
        },
        secondaryLabel: 'Hapus',
        onSecondaryClick: () => {
          sendWsAction({
            action: 'remove_track',
            track_id: track.id
          });
        }
      });
      dom.roomPlaylistList.appendChild(card);
    });
  }

  function renderServerLibrary(tracks) {
    state.libraryTracks = tracks;
    dom.serverLibraryList.innerHTML = '';
    renderQuickCollageRow(tracks);

    if (!tracks.length) {
      dom.libraryEmptyState.classList.remove('hidden');
      return;
    }
    dom.libraryEmptyState.classList.add('hidden');

    const activeId = state.playlist[state.currentTrackIndex]?.id;

    tracks.forEach((track) => {
      const isActive = activeId === track.id;
      const card = createWideMediaCard(track, {
        isActive,
        cornerBadge: formatSeconds(track.duration_sec),
        subtitle: `${track.artist} • Tersimpan di STB`,
        onPrimaryClick: () => playOrEnqueueTrackImmediately(track),
        secondaryLabel: '+ Room',
        onSecondaryClick: (btnEl) => enqueueDownload(track, btnEl)
      });
      dom.serverLibraryList.appendChild(card);
    });
  }

  async function playOrEnqueueTrackImmediately(track) {
    ensureAudioContext();
    const existingIdx = state.playlist.findIndex((t) => t.id === track.id || t.youtube_id === track.youtube_id);
    if (existingIdx !== -1) {
      sendWsAction({
        action: 'select_track',
        track_index: existingIdx
      });
      return;
    }

    // Add local track to room and select it
    await fetch('/api/v1/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtube_id: track.youtube_id || track.id,
        title: track.title,
        artist: track.artist,
        duration_sec: track.duration_sec,
        thumbnail_url: track.thumbnail_url,
        room_id: state.roomId,
        requested_by: state.deviceName
      })
    }).catch(() => {});
  }

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

  function handleDownloadProgressEvent(data) {
    if (data.status === 'queued' || data.status === 'downloading') {
      dom.downloadStatusText.textContent = `Mengunduh "${data.title}" ke penyimpanan STB (${data.status})...`;
      dom.downloadStatusBanner.classList.remove('hidden');
    } else if (data.status === 'completed') {
      dom.downloadStatusText.textContent = `"${data.title}" siap diputar di Live Room!`;
      dom.downloadStatusBanner.classList.remove('hidden');
      fetchServerLibrary();
      setTimeout(() => {
        dom.downloadStatusBanner.classList.add('hidden');
      }, 3500);
    } else if (data.status === 'failed') {
      dom.downloadStatusBanner.classList.add('hidden');
      dom.roomErrorText.textContent = `Unduhan "${data.title}" gagal: ${data.message || 'Kesalahan yt-dlp'}`;
      dom.roomErrorBanner.classList.remove('hidden');
    }
  }

  // 7. Fast YouTube Search (Innertube Live)
  async function handleSearchSubmit(ev) {
    ev.preventDefault();
    const query = dom.searchInput.value.trim();
    if (!query) return;

    dom.shelfSearchResults.classList.remove('hidden');
    dom.searchEmptyState.classList.add('hidden');
    dom.searchErrorState.classList.add('hidden');
    dom.searchLoadingState.classList.remove('hidden');
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
        dom.searchEmptyState.querySelector('p').textContent = `Tidak ditemukan hasil untuk "${query}".`;
        return;
      }

      renderSearchResults(items);
    } catch (err) {
      dom.searchLoadingState.classList.add('hidden');
      dom.searchErrorText.textContent = `Gagal menghubungi server: ${err.message}`;
      dom.searchErrorState.classList.remove('hidden');
    }
  }

  function renderSearchResults(items) {
    dom.searchResultsList.innerHTML = '';
    items.forEach((item) => {
      const card = createWideMediaCard(item, {
        isActive: false,
        cornerBadge: item.duration_label || formatSeconds(item.duration_sec),
        subtitle: `${item.artist} • ${item.views_label || 'YouTube'}`,
        onPrimaryClick: () => {
          const dummyBtn = document.createElement('button');
          enqueueDownload(item, dummyBtn);
        },
        secondaryLabel: 'Unduh & Putar',
        onSecondaryClick: (btnEl) => enqueueDownload(item, btnEl)
      });
      dom.searchResultsList.appendChild(card);
    });
  }

  async function enqueueDownload(item, btnEl) {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = 'Mengunduh...';
    }

    try {
      const resp = await fetch('/api/v1/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtube_id: item.youtube_id || item.id,
          title: item.title,
          artist: item.artist,
          duration_sec: item.duration_sec,
          thumbnail_url: item.thumbnail_url,
          room_id: state.roomId,
          requested_by: state.deviceName
        })
      });

      if (resp.ok) {
        if (btnEl) btnEl.textContent = 'Diantrekan';
      } else if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = 'Coba Lagi';
      }
    } catch (_) {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = 'Coba Lagi';
      }
    }
  }

  // 8. Server Health & Disk Library Fetch
  async function fetchServerHealth() {
    try {
      const resp = await fetch('/api/v1/health');
      if (!resp.ok) return;
      const info = await resp.json();
      dom.serverVersionBadge.textContent = `v${info.version}`;
      dom.storageStatusBar.textContent = info.music_storage_path;
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

  // 9. UI Controls, Carousel Arrows, Cast Modal & Retro Avatar Modal
  function bindUiControls() {
    dom.btnSidebarToggle.addEventListener('click', () => {
      if (window.innerWidth < 768 || dom.body.classList.contains('mobile')) {
        dom.sidebar.classList.toggle('mobile-open');
      } else {
        dom.sidebar.classList.toggle('collapsed');
      }
    });

    dom.btnViewToggle.addEventListener('click', toggleViewModeManual);

    // Search Input Clear & Submit
    dom.searchInput.addEventListener('input', () => {
      if (dom.searchInput.value.trim()) {
        dom.btnSearchClear.classList.remove('hidden');
      } else {
        dom.btnSearchClear.classList.add('hidden');
      }
    });

    dom.btnSearchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.btnSearchClear.classList.add('hidden');
      dom.searchInput.focus();
    });

    dom.btnCloseSearchShelf.addEventListener('click', () => {
      dom.shelfSearchResults.classList.add('hidden');
    });

    dom.searchForm.addEventListener('submit', handleSearchSubmit);
    dom.btnRefreshLibrary.addEventListener('click', fetchServerLibrary);
    dom.btnRetryWs.addEventListener('click', connectWebSocket);

    // Carousel Left/Right Arrow Buttons
    document.querySelectorAll('.ytm-arrow-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-scroll-target');
        const dir = parseInt(btn.getAttribute('data-dir') || '1', 10);
        const container = document.getElementById(targetId);
        if (container) {
          container.scrollBy({ left: dir * 580, behavior: 'smooth' });
        }
      });
    });

    // Sidebar Navigation & Mood Chips
    document.querySelectorAll('.ytm-nav-item').forEach((navBtn) => {
      navBtn.addEventListener('click', () => {
        document.querySelectorAll('.ytm-nav-item').forEach((b) => b.classList.remove('active'));
        navBtn.classList.add('active');
        const target = navBtn.getAttribute('data-nav');
        if (target === 'eksplorasi') {
          dom.searchInput.focus();
        } else if (target === 'koleksi') {
          dom.shelfListenAgain.scrollIntoView({ behavior: 'smooth' });
        } else if (target === 'liveroom') {
          dom.shelfListenTogether.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        dom.sidebar.classList.remove('mobile-open');
      });
    });

    document.querySelectorAll('.ytm-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.ytm-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const kind = chip.getAttribute('data-chip');
        if (kind === 'dengarkan-lagi' || kind === 'hdd-lokal') {
          dom.shelfListenAgain.scrollIntoView({ behavior: 'smooth' });
        } else if (kind === 'dengarkan-bersama') {
          dom.shelfListenTogether.scrollIntoView({ behavior: 'smooth' });
        } else if (kind === 'cari-youtube') {
          dom.searchInput.focus();
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    // Transport Controls
    dom.btnPrevTrack.addEventListener('click', () => {
      sendWsAction({ action: 'seek', seek_position_sec: 0 });
    });

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
      sendWsAction({
        action: 'seek',
        seek_position_sec: ratio * state.audioEl.duration
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

    // Requirement #2: Cast Icon = Masuk Room Modal
    const openRoomModal = () => {
      dom.roomInput.value = state.roomId;
      dom.roomModalBackdrop.classList.remove('hidden');
      dom.roomInput.focus();
    };
    const closeRoomModal = () => {
      dom.roomModalBackdrop.classList.add('hidden');
    };

    dom.btnCastRoom.addEventListener('click', openRoomModal);
    dom.btnOpenRoomModalSide.addEventListener('click', openRoomModal);
    dom.btnOpenRoomModalMain.addEventListener('click', openRoomModal);
    dom.btnCloseRoomModal.addEventListener('click', closeRoomModal);
    dom.roomModalBackdrop.addEventListener('click', (ev) => {
      if (ev.target === dom.roomModalBackdrop) closeRoomModal();
    });

    document.querySelectorAll('.quick-room-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const target = chip.getAttribute('data-room') || 'Lobby';
        dom.roomInput.value = target;
        joinRoomByName(target);
        closeRoomModal();
      });
    });

    dom.btnJoinRoom.addEventListener('click', () => {
      const target = dom.roomInput.value.trim() || 'Lobby';
      joinRoomByName(target);
      closeRoomModal();
    });

    dom.roomInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        dom.btnJoinRoom.click();
      }
    });

    // Requirement #1: Top-Right Retro Anime / Doodle Avatar & Auto-Save Device Name Modal
    const openDeviceModal = () => {
      dom.deviceNameInput.value = state.deviceName;
      dom.deviceModalBackdrop.classList.remove('hidden');
      dom.deviceNameInput.focus();
    };
    const closeDeviceModal = () => {
      dom.deviceModalBackdrop.classList.add('hidden');
      dom.btnDeviceProfile.focus();
    };

    dom.btnDeviceProfile.addEventListener('click', openDeviceModal);
    dom.btnCloseModal.addEventListener('click', closeDeviceModal);
    dom.deviceModalBackdrop.addEventListener('click', (ev) => {
      if (ev.target === dom.deviceModalBackdrop) closeDeviceModal();
    });

    // Instant Auto-Save as user types device name (bound to device token)
    let renameDebounce = null;
    dom.deviceNameInput.addEventListener('input', () => {
      const val = dom.deviceNameInput.value.trim();
      if (!val) return;
      saveDeviceProfileByToken(val, state.avatarIndex);
      dom.deviceAutosaveStatus.textContent = `Tersimpan otomatis untuk token ${state.deviceToken}`;
      if (renameDebounce) clearTimeout(renameDebounce);
      renameDebounce = setTimeout(() => {
        sendWsAction({
          action: 'rename_device',
          device_name: val
        });
      }, 300);
    });

    dom.btnRerollAvatar.addEventListener('click', () => {
      const nextIdx = (state.avatarIndex + 1) % RETRO_AVATARS.length;
      saveDeviceProfileByToken(state.deviceName, nextIdx);
      dom.deviceAutosaveStatus.textContent = `Karakter avatar #${nextIdx + 1} tersimpan di token ${state.deviceToken}`;
    });

    dom.btnResetDeviceName.addEventListener('click', () => {
      const autoName = generateAutoDeviceName();
      dom.deviceNameInput.value = autoName;
      const randomAvatar = Math.floor(Math.random() * RETRO_AVATARS.length);
      saveDeviceProfileByToken(autoName, randomAvatar);
      sendWsAction({
        action: 'rename_device',
        device_name: autoName
      });
    });

    dom.deviceNameForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const val = dom.deviceNameInput.value.trim();
      if (val) {
        saveDeviceProfileByToken(val, state.avatarIndex);
        sendWsAction({
          action: 'rename_device',
          device_name: val
        });
      }
      closeDeviceModal();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (!dom.deviceModalBackdrop.classList.contains('hidden')) closeDeviceModal();
        if (!dom.roomModalBackdrop.classList.contains('hidden')) closeRoomModal();
      }
    });

    setInterval(() => {
      sendWsAction({
        action: 'ntp_ping',
        client_timestamp_ms: Date.now()
      });
    }, 20000);
  }

  function joinRoomByName(targetRoom) {
    const clean = targetRoom.trim() || 'Lobby';
    state.roomId = clean;
    localStorage.setItem(STORAGE_KEY_ROOM, clean);
    dom.activeRoomLabel.textContent = clean;
    if (dom.topbarRoomBadge) dom.topbarRoomBadge.textContent = clean;
    sendWsAction({
      action: 'join_room',
      room_id: clean,
      device_name: state.deviceName,
      arch: state.arch,
      client_timestamp_ms: Date.now()
    });
  }

  function formatSeconds(sec) {
    const total = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function init() {
    registerServiceWorker();
    initDeviceProfileAndAvatar();
    initViewMode();
    dom.roomInput.value = state.roomId;
    dom.activeRoomLabel.textContent = state.roomId;
    if (dom.topbarRoomBadge) dom.topbarRoomBadge.textContent = state.roomId;
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
