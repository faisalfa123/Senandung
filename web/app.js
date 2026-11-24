// Senandung v3.0.3 Remake: Direct HTML5 Audio Engine (Guaranteed Sound Output),
// Solo Mode Default + Live Room Sync Lifecycle, 4 Sidebar Tabs, 4 Home Categories,
// Selectable Avatar Grid (Auto-Save per Token), and Value-Add Controls
(() => {
  'use strict';

  const STORAGE_KEY_TOKEN = 'senandung_device_token';
  const STORAGE_KEY_DEVICE = 'senandung_device_name';
  const STORAGE_KEY_AVATAR = 'senandung_avatar_index';
  const STORAGE_KEY_VIEW = 'senandung_view_mode';
  const STORAGE_KEY_HISTORY = 'senandung_play_history_v3';
  const STORAGE_KEY_CUSTOM_PL = 'senandung_custom_playlists_v3';
  const JITTER_BUFFER_MS = 100;

  const DEFAULT_ARTWORK_SVG =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%23161616'/%3E%3Ccircle cx='160' cy='90' r='44' stroke='%23ff0033' stroke-width='5' fill='none'/%3E%3Ccircle cx='160' cy='90' r='14' fill='%23ffffff'/%3E%3C/svg%3E";

  // 8 Selectable Retro Anime / Doodle Art Characters (Requirement #4: Selectable Grid, not random)
  const RETRO_AVATARS = [
    {
      name: 'City Pop Girl',
      svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#ff2a85"/><circle cx="32" cy="34" r="16" fill="#ffe0bd"/><path d="M14 32c0-13 8-22 18-22s18 9 18 22c-4-6-10-9-18-9s-14 3-18 9z" fill="#1a103c"/><rect x="10" y="28" width="6" height="12" rx="3" fill="#00f0ff" stroke="#1a103c" stroke-width="2"/><rect x="48" y="28" width="6" height="12" rx="3" fill="#00f0ff" stroke="#1a103c" stroke-width="2"/><ellipse cx="26" cy="34" rx="2.5" ry="3.5" fill="#1a103c"/><ellipse cx="38" cy="34" rx="2.5" ry="3.5" fill="#1a103c"/><circle cx="25" cy="32.5" r="1" fill="#fff"/><circle cx="37" cy="32.5" r="1" fill="#fff"/><path d="M29 42q3 3 6 0" stroke="#d94e67" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`
    },
    {
      name: 'Cyber Mecha',
      svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#1b1447"/><path d="M12 22l8-12h24l8 12-4 28H16z" fill="#2d3446" stroke="#00ffcc" stroke-width="2"/><rect x="16" y="26" width="32" height="10" rx="4" fill="#ff0055"/><path d="M20 29h14" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><path d="M26 44h12" stroke="#00ffcc" stroke-width="2.5" stroke-linecap="round"/></svg>`
    },
    {
      name: 'Lo-Fi Cat',
      svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#ff9f1c"/><path d="M16 26V14l10 8h12l10-8v12c4 4 4 22-16 22S12 30 16 26z" fill="#ffffff" stroke="#111111" stroke-width="2.5"/><circle cx="25" cy="32" r="2.5" fill="#111111"/><circle cx="39" cy="32" r="2.5" fill="#111111"/><path d="M29 37l3 2 3-2" stroke="#ff2a85" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`
    },
    {
      name: 'Retro Cassette',
      svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#00bbf9"/><rect x="10" y="18" width="44" height="28" rx="4" fill="#222222" stroke="#ffffff" stroke-width="2"/><rect x="15" y="22" width="34" height="14" rx="2" fill="#fee440"/><circle cx="24" cy="29" r="4" fill="#222222"/><circle cx="40" cy="29" r="4" fill="#222222"/><path d="M18 46l4-6h20l4 6" fill="#444444"/></svg>`
    },
    {
      name: 'Synthwave Boy',
      svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#7209b7"/><circle cx="32" cy="35" r="15" fill="#f7d6bf"/><path d="M15 26l6-12 7 6 8-8 6 8 7-4-2 12z" fill="#0d0814"/><polygon points="18,30 31,30 29,37 19,37" fill="#00f5d4"/><polygon points="33,30 46,30 45,37 35,37" fill="#00f5d4"/><path d="M28 43h8" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`
    },
    {
      name: 'Vinyl Spinner',
      svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#f15bb5"/><circle cx="32" cy="32" r="21" fill="#141414" stroke="#ffffff" stroke-width="2"/><circle cx="32" cy="32" r="8" fill="#ff0033"/><circle cx="32" cy="32" r="2.5" fill="#ffffff"/></svg>`
    },
    {
      name: 'Arcade Ghost',
      svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#101820"/><path d="M18 30c0-9 6-16 14-16s14 7 14 16v18l-5-4-4 4-5-4-5 4-4-4-5 4V30z" fill="#00e676"/><circle cx="27" cy="29" r="3.5" fill="#ffffff"/><circle cx="37" cy="29" r="3.5" fill="#ffffff"/><circle cx="28" cy="29" r="1.8" fill="#101820"/><circle cx="38" cy="29" r="1.8" fill="#101820"/></svg>`
    },
    {
      name: 'Manga Rocker',
      svg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#e63946"/><circle cx="32" cy="35" r="15" fill="#ffe3cc"/><path d="M14 28c3-12 12-16 18-16s15 4 18 16c-6-4-12-5-18-5s-12 1-18 5z" fill="#f1faee"/><polygon points="24,29 27,34 22,34" fill="#1d3557"/><circle cx="38" cy="33" r="2.5" fill="#1d3557"/><path d="M27 42l10-2" stroke="#1d3557" stroke-width="2.2" stroke-linecap="round"/></svg>`
    }
  ];

  // Runtime State: Always starts in SOLO MODE (`inRoom: false`) on startup/restart
  const state = {
    activeTab: 'beranda',
    inRoom: false,
    roomId: 'Lobby',
    deviceToken: '',
    avatarIndex: 0,
    deviceName: '',
    arch: detectClientArch(),
    ntpOffsetMs: 0,

    // Library & Solo Queue
    libraryTracks: [],
    filteredLibraryTracks: [],
    selectedBandFilter: '',
    localSearchKeyword: '',
    soloQueue: [],
    soloTrackIndex: 0,
    playHistory: [],

    // Custom Playlists (Tab 3)
    customPlaylists: {
      Favorit: []
    },
    activeCustomPlaylistName: 'Favorit',

    // Eksplorasi Source Modifier (Tab 2)
    exploreSourceMode: 'ytm',

    // Live Room Queue (Tab 4)
    roomPlaylist: [],
    roomTrackIndex: 0,
    roomConnectedUsers: [],

    // Playback Flags
    isPlaying: false,
    loadedTrackId: null,
    shuffleEnabled: false,
    repeatMode: 'all', // 'all', 'one'
    sleepTimerMinutes: 0,
    sleepTimerHandle: null,

    // WebSocket & Direct HTML5 Audio Element
    ws: null,
    wsConnected: false,
    reconnectTimer: null,
    scheduledPlayTimer: null,
    audioEl: new Audio(),
    audioUnlocked: false,
    pendingPlayPromise: null
  };

  // Direct HTML5 Audio output guarantees sound plays immediately on desktop, Android STB, and mobile browsers.
  state.audioEl.preload = 'auto';
  state.audioEl.volume = 0.95;
  state.audioEl.muted = false;

  // Universal User Gesture Unlocker for iOS Safari and Mobile Chrome autoplay restrictions
  function unlockAudioContextOnGesture() {
    if (state.audioUnlocked) return;
    state.audioUnlocked = true;
    try {
      const p = state.audioEl.play();
      if (p !== undefined) {
        p.then(() => {
          if (!state.loadedTrackId) {
            state.audioEl.pause();
            state.audioEl.currentTime = 0;
          }
        }).catch(() => {});
      }
    } catch (_) {}
    ['touchstart', 'touchend', 'click', 'keydown'].forEach((evt) => {
      document.removeEventListener(evt, unlockAudioContextOnGesture, true);
    });
  }
  ['touchstart', 'touchend', 'click', 'keydown'].forEach((evt) => {
    document.addEventListener(evt, unlockAudioContextOnGesture, { capture: true, once: true });
  });

  // DOM References
  const dom = {
    body: document.body,
    sidebar: document.getElementById('app-sidebar'),
    btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
    brandHomeLink: document.getElementById('brand-home-link'),
    serverVersionBadge: document.getElementById('server-version-badge'),

    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    btnSearchClear: document.getElementById('btn-search-clear'),

    btnSleepTimer: document.getElementById('btn-sleep-timer'),
    sleepTimerBadge: document.getElementById('sleep-timer-badge'),

    btnViewToggle: document.getElementById('btn-view-toggle'),
    iconViewDesktop: document.getElementById('icon-view-desktop'),
    iconViewMobile: document.getElementById('icon-view-mobile'),
    viewModeLabel: document.getElementById('view-mode-label'),

    btnCastRoom: document.getElementById('btn-cast-room'),
    topbarRoomBadge: document.getElementById('topbar-room-badge'),
    wsStatusDot: document.getElementById('ws-status-dot'),
    btnTopbarLeaveRoom: document.getElementById('btn-topbar-leave-room'),

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

    // 4 Tab Views
    tabViewBeranda: document.getElementById('tab-view-beranda'),
    tabViewEksplorasi: document.getElementById('tab-view-eksplorasi'),
    tabViewPlaylist: document.getElementById('tab-view-playlist'),
    tabViewRoom: document.getElementById('tab-view-room'),

    // Beranda Sections (3.a Album, 3.b Grup Band, 3.c History, 3.d Semua Lagu + Cari)
    homeSecAlbum: document.getElementById('home-sec-album'),
    homeAlbumCarousel: document.getElementById('home-album-carousel'),
    homeSecBand: document.getElementById('home-sec-band'),
    homeBandCarousel: document.getElementById('home-band-carousel'),
    btnClearBandFilter: document.getElementById('btn-clear-band-filter'),
    homeSecHistory: document.getElementById('home-sec-history'),
    homeHistoryCarousel: document.getElementById('home-history-carousel'),
    historyEmptyState: document.getElementById('history-empty-state'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    homeSecAllSongs: document.getElementById('home-sec-all-songs'),
    libraryTotalCount: document.getElementById('library-total-count'),
    localSongFilterInput: document.getElementById('local-song-filter-input'),
    btnPlayAllFiltered: document.getElementById('btn-play-all-filtered'),
    btnRefreshLibrary: document.getElementById('btn-refresh-library'),
    libraryEmptyState: document.getElementById('library-empty-state'),
    serverLibraryList: document.getElementById('server-library-list'),

    // Eksplorasi Tab
    exploreInlineForm: document.getElementById('explore-inline-form'),
    exploreQueryInput: document.getElementById('explore-query-input'),
    searchLoadingState: document.getElementById('search-loading-state'),
    searchErrorState: document.getElementById('search-error-state'),
    searchErrorText: document.getElementById('search-error-text'),
    searchEmptyState: document.getElementById('search-empty-state'),
    searchResultsList: document.getElementById('search-results-list'),

    // Playlist Tab
    btnNewCustomPlaylist: document.getElementById('btn-new-custom-playlist'),
    btnCreatePlaylistMain: document.getElementById('btn-create-playlist-main'),
    customPlaylistsBar: document.getElementById('custom-playlists-bar'),
    customPlaylistEmpty: document.getElementById('custom-playlist-empty'),
    customPlaylistTracks: document.getElementById('custom-playlist-tracks'),

    // Room Tab
    roomTabModeEyebrow: document.getElementById('room-tab-mode-eyebrow'),
    headingRoomTab: document.getElementById('heading-room-tab'),
    roomTabModeDesc: document.getElementById('room-tab-mode-desc'),
    btnRoomTabJoin: document.getElementById('btn-room-tab-join'),
    btnRoomTabLeave: document.getElementById('btn-room-tab-leave'),
    roomTabInlineInput: document.getElementById('room-tab-inline-input'),
    btnRoomTabInlineSubmit: document.getElementById('btn-room-tab-inline-submit'),
    playlistEmptyState: document.getElementById('playlist-empty-state'),
    roomPlaylistList: document.getElementById('room-playlist-list'),

    // Player Bar
    progressRail: document.getElementById('progress-rail'),
    progressBufferedBar: document.getElementById('progress-buffered-bar'),
    progressPlayedBar: document.getElementById('progress-played-bar'),
    timeCurrent: document.getElementById('time-current'),
    bufferPercentLabel: document.getElementById('buffer-percent-label'),
    timeDuration: document.getElementById('time-duration'),
    nowPlayingArtwork: document.getElementById('now-playing-artwork'),
    nowPlayingTitle: document.getElementById('now-playing-title'),
    nowPlayingArtist: document.getElementById('now-playing-artist'),
    btnLikeCurrent: document.getElementById('btn-like-current'),
    btnPrevTrack: document.getElementById('btn-prev-track'),
    btnPlayToggle: document.getElementById('btn-play-toggle'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    btnPlayLabel: document.getElementById('btn-play-label'),
    btnNextTrack: document.getElementById('btn-next-track'),
    btnShuffleToggle: document.getElementById('btn-shuffle-toggle'),
    btnRepeatToggle: document.getElementById('btn-repeat-toggle'),
    btnMuteToggle: document.getElementById('btn-mute-toggle'),
    volumeSlider: document.getElementById('volume-slider'),

    // Modals
    deviceModalBackdrop: document.getElementById('device-modal-backdrop'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    modalAvatarPreview: document.getElementById('modal-avatar-preview'),
    deviceTokenBadge: document.getElementById('device-token-badge'),
    avatarSelectionGrid: document.getElementById('avatar-selection-grid'),
    deviceNameForm: document.getElementById('device-name-form'),
    deviceNameInput: document.getElementById('device-name-input'),
    deviceAutosaveStatus: document.getElementById('device-autosave-status'),
    btnResetDeviceName: document.getElementById('btn-reset-device-name'),

    roomModalBackdrop: document.getElementById('room-modal-backdrop'),
    btnCloseRoomModal: document.getElementById('btn-close-room-modal'),
    roomInput: document.getElementById('room-input'),
    btnModalLeaveRoom: document.getElementById('btn-modal-leave-room'),
    btnJoinRoom: document.getElementById('btn-join-room')
  };

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // ==========================================================================
  // 1. DEVICE TOKEN, SELECTABLE AVATAR GRID & AUTO-SAVE (Requirement #4)
  // ==========================================================================
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
      localStorage.getItem(tokenAvatarKey) ?? localStorage.getItem(STORAGE_KEY_AVATAR) ?? '0',
      10
    );
    if (Number.isNaN(savedAvatarIdx) || savedAvatarIdx < 0 || savedAvatarIdx >= RETRO_AVATARS.length) {
      savedAvatarIdx = 0;
    }
    state.avatarIndex = savedAvatarIdx;

    renderSelectableAvatarGrid();
    renderAvatarAndDeviceNameUI();
  }

  function renderSelectableAvatarGrid() {
    if (!dom.avatarSelectionGrid) return;
    dom.avatarSelectionGrid.innerHTML = '';

    RETRO_AVATARS.forEach((av, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ytm-avatar-choice-btn${idx === state.avatarIndex ? ' selected' : ''}`;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', idx === state.avatarIndex ? 'true' : 'false');

      const thumb = document.createElement('div');
      thumb.className = 'ytm-avatar-choice-thumb';
      thumb.innerHTML = av.svg;

      const label = document.createElement('span');
      label.textContent = av.name;

      btn.appendChild(thumb);
      btn.appendChild(label);

      btn.addEventListener('click', () => {
        saveDeviceProfileByToken(state.deviceName, idx);
        renderSelectableAvatarGrid();
        if (dom.deviceAutosaveStatus) {
          dom.deviceAutosaveStatus.textContent = `Karakter "${av.name}" dipilih & tersimpan di token ${state.deviceToken}`;
        }
      });

      dom.avatarSelectionGrid.appendChild(btn);
    });
  }

  function saveDeviceProfileByToken(newName, newAvatarIndex) {
    const token = state.deviceToken;
    if (typeof newName === 'string' && newName.trim()) {
      state.deviceName = newName.trim();
      localStorage.setItem(STORAGE_KEY_DEVICE, state.deviceName);
      localStorage.setItem(`${STORAGE_KEY_DEVICE}_${token}`, state.deviceName);
    }
    if (typeof newAvatarIndex === 'number' && newAvatarIndex >= 0 && newAvatarIndex < RETRO_AVATARS.length) {
      state.avatarIndex = newAvatarIndex;
      localStorage.setItem(STORAGE_KEY_AVATAR, String(state.avatarIndex));
      localStorage.setItem(`${STORAGE_KEY_AVATAR}_${token}`, String(state.avatarIndex));
    }
    renderAvatarAndDeviceNameUI();
  }

  function renderAvatarAndDeviceNameUI() {
    const avObj = RETRO_AVATARS[state.avatarIndex] || RETRO_AVATARS[0];
    if (dom.topbarAvatarSvg) dom.topbarAvatarSvg.innerHTML = avObj.svg;
    if (dom.shelfUserAvatar) dom.shelfUserAvatar.innerHTML = avObj.svg;
    if (dom.modalAvatarPreview) dom.modalAvatarPreview.innerHTML = avObj.svg;
    if (dom.deviceNameDisplay) dom.deviceNameDisplay.textContent = state.deviceName;
    if (dom.shelfDeviceEyebrow) dom.shelfDeviceEyebrow.textContent = `RIWAYAT • ${state.deviceName.toUpperCase()}`;
    if (dom.deviceTokenBadge) dom.deviceTokenBadge.textContent = `Token: ${state.deviceToken}`;
  }

  // ==========================================================================
  // 2. NAVIGATION TABS: a. Beranda, b. Eksplorasi, c. Playlist, d. Room
  // ==========================================================================
  function switchTab(tabName) {
    state.activeTab = tabName;

    document.querySelectorAll('.ytm-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    dom.tabViewBeranda.classList.toggle('hidden', tabName !== 'beranda');
    dom.tabViewEksplorasi.classList.toggle('hidden', tabName !== 'eksplorasi');
    dom.tabViewPlaylist.classList.toggle('hidden', tabName !== 'playlist');
    dom.tabViewRoom.classList.toggle('hidden', tabName !== 'room');

    dom.sidebar.classList.remove('mobile-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabName === 'playlist') {
      renderCustomPlaylistsTab();
    } else if (tabName === 'room') {
      updateRoomModeUI();
    }
  }

  // ==========================================================================
  // 3. SOLO MODE vs LIVE ROOM LIFECYCLE (Requirement #2)
  // ==========================================================================
  function enterLiveRoom(roomName) {
    const target = (roomName || 'Lobby').trim() || 'Lobby';
    state.inRoom = true;
    state.roomId = target;

    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    } else {
      sendWsAction({
        action: 'join_room',
        room_id: state.roomId,
        device_name: state.deviceName,
        arch: state.arch,
        client_timestamp_ms: Date.now()
      });
      sendRapidNtpPings();
    }

    loadCustomPlaylists();
    updateRoomModeUI();
  }

  function leaveLiveRoomToSolo(silent) {
    if (state.inRoom && state.ws && state.ws.readyState === WebSocket.OPEN) {
      sendWsAction({ action: 'leave_room' });
    }
    state.inRoom = false;
    if (state.scheduledPlayTimer) {
      clearTimeout(state.scheduledPlayTimer);
      state.scheduledPlayTimer = null;
    }
    updateRoomModeUI();
    if (!silent) {
      dom.nowPlayingArtist.textContent = 'Mode Solo Aktif (Mandiri)';
    }
  }

  function updateRoomModeUI() {
    if (state.inRoom) {
      dom.topbarRoomBadge.textContent = `Room: ${state.roomId}`;
      dom.wsStatusDot.classList.add('online');
      dom.btnTopbarLeaveRoom.classList.remove('hidden');
      dom.btnModalLeaveRoom.classList.remove('hidden');
      dom.btnRoomTabLeave.classList.remove('hidden');
      dom.btnRoomTabJoin.classList.add('hidden');
      dom.activeRoomLabel.textContent = `Room ${state.roomId}`;
      dom.headingRoomTab.textContent = `Live Room Aktif: ${state.roomId}`;
      dom.roomTabModeDesc.textContent =
        `Anda sedang tersinkronisasi di room "${state.roomId}". Klik "Keluar Room" kapan saja untuk kembali mendengarkan di Mode Solo.`;
    } else {
      dom.topbarRoomBadge.textContent = 'Mode Solo';
      dom.wsStatusDot.classList.remove('online');
      dom.btnTopbarLeaveRoom.classList.add('hidden');
      dom.btnModalLeaveRoom.classList.add('hidden');
      dom.btnRoomTabLeave.classList.add('hidden');
      dom.btnRoomTabJoin.classList.remove('hidden');
      dom.activeRoomLabel.textContent = 'Solo (Mandiri)';
      dom.ntpOffsetBadge.textContent = 'Lokal';
      dom.listenerCountBadge.textContent = '1';
      dom.headingRoomTab.textContent = 'Mode Solo (Pemutar Mandiri)';
      dom.roomTabModeDesc.textContent =
        'Anda sedang mendengarkan musik secara mandiri (Solo). Pilih atau ketik nama Room di bawah untuk mulai mendengarkan bersama perangkat lain.';
    }
  }

  // Requirement #2: Auto-exit Room to Solo Mode when closing/hiding Mobile PWA or restarting app
  function bindAutoExitRoomLifecycle() {
    window.addEventListener('pagehide', () => {
      if (state.inRoom) {
        leaveLiveRoomToSolo(true);
      }
    });

    window.addEventListener('beforeunload', () => {
      if (state.inRoom) {
        leaveLiveRoomToSolo(true);
      }
    });

    document.addEventListener('visibilitychange', () => {
      const isStandalonePwa =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
      if (document.visibilityState === 'hidden' && isStandalonePwa && state.inRoom) {
        leaveLiveRoomToSolo(true);
      }
    });
  }

  // ==========================================================================
  // 4. DIRECT HTML5 AUDIO ENGINE (Fixes "Tidak Mengeluarkan Suara Sama Sekali")
  // ==========================================================================
  function playTrackDirectly(track, startSeekSec) {
    if (!track || !track.id) return;

    state.audioUnlocked = true;
    state.currentTrack = track;
    const streamUrl = `/api/v1/stream/${encodeURIComponent(track.id)}`;
    state.audioEl.muted = false;
    const sliderVol = parseFloat(dom.volumeSlider.value);
    state.audioEl.volume = Number.isFinite(sliderVol) && sliderVol > 0 ? sliderVol : 0.95;

    const needsLoad = state.loadedTrackId !== track.id || !state.audioEl.src;
    if (needsLoad) {
      state.loadedTrackId = track.id;
      state.audioEl.src = streamUrl;
      dom.progressBufferedBar.style.width = '0%';
      dom.progressPlayedBar.style.width = '0%';
    }

    if (typeof startSeekSec === 'number' && startSeekSec > 0) {
      try {
        state.audioEl.currentTime = startSeekSec;
      } catch (_) {}
    }

    recordTrackToHistory(track);
    updateNowPlayingBar(track, true);

    const executePlay = () => {
      try {
        const playPromise = state.audioEl.play();
        if (playPromise !== undefined) {
          state.pendingPlayPromise = playPromise;
          playPromise
            .then(() => {
              state.pendingPlayPromise = null;
              state.isPlaying = true;
              dom.roomErrorBanner.classList.add('hidden');
              updateTransportButtonsUI(true);
              highlightActiveTrackRows(track.id);
            })
            .catch((err) => {
              state.pendingPlayPromise = null;
              // Ignore benign AbortError if another track or user action interrupted it
              if (err.name === 'AbortError') {
                return;
              }
              state.isPlaying = false;
              updateTransportButtonsUI(false);
              dom.roomErrorText.textContent = `Klik di sini atau tombol Putar (▶) untuk mengaktifkan audio (${err.message}).`;
              dom.roomErrorBanner.classList.remove('hidden');
            });
        }
      } catch (err) {
        state.pendingPlayPromise = null;
        if (err.name !== 'AbortError') {
          state.isPlaying = false;
          updateTransportButtonsUI(false);
          dom.roomErrorText.textContent = `Gagal memutar: ${err.message}`;
          dom.roomErrorBanner.classList.remove('hidden');
        }
      }
    };

    if (state.pendingPlayPromise) {
      state.pendingPlayPromise.finally(executePlay);
    } else {
      executePlay();
    }
  }

  function playSoloTrackAtIndex(idx) {
    if (!state.soloQueue.length) return;
    const bounded = ((idx % state.soloQueue.length) + state.soloQueue.length) % state.soloQueue.length;
    state.soloTrackIndex = bounded;
    const track = state.soloQueue[bounded];
    playTrackDirectly(track, 0);
  }

  function handleUserPlayTrack(track, queueSource) {
    if (Array.isArray(queueSource) && queueSource.length > 0) {
      state.soloQueue = queueSource.slice();
    } else if (!state.soloQueue.length) {
      state.soloQueue = state.libraryTracks.slice();
    }

    const idx = state.soloQueue.findIndex((t) => t.id === track.id);
    if (idx !== -1) {
      state.soloTrackIndex = idx;
    } else {
      state.soloQueue.unshift(track);
      state.soloTrackIndex = 0;
    }

    // Play immediately on local HTML5 audio so user ALWAYS hears sound right away
    playTrackDirectly(track, 0);

    // If currently in Live Room, also sync to room
    if (state.inRoom) {
      const roomIdx = state.roomPlaylist.findIndex((t) => t.id === track.id || t.youtube_id === track.youtube_id);
      if (roomIdx !== -1) {
        sendWsAction({
          action: 'select_track',
          track_index: roomIdx
        });
      } else {
        enqueueDownloadToRoom(track, null);
      }
    }
  }

  function scheduleRoomPlay(track, playTimestamp, ntpOffset, seekPositionSec) {
    if (!track) return;
    if (state.scheduledPlayTimer) {
      clearTimeout(state.scheduledPlayTimer);
      state.scheduledPlayTimer = null;
    }

    const now = Date.now();
    const serverTime = now + ntpOffset;
    const rawDelayMs = playTimestamp - serverTime;
    const targetSeek = typeof seekPositionSec === 'number' ? seekPositionSec : 0;

    if (rawDelayMs > 0 && rawDelayMs < 3000) {
      state.scheduledPlayTimer = setTimeout(() => {
        playTrackDirectly(track, targetSeek);
      }, rawDelayMs);
    } else {
      const lateSec = rawDelayMs < 0 ? Math.min(Math.abs(rawDelayMs) / 1000, 10) : 0;
      playTrackDirectly(track, targetSeek + lateSec + (JITTER_BUFFER_MS / 1000));
    }
  }

  function updateNowPlayingBar(track, isPlaying) {
    if (!track) {
      dom.nowPlayingTitle.textContent = 'Pilih lagu di Beranda untuk memutar';
      dom.nowPlayingArtist.textContent = state.inRoom ? `Live Room: ${state.roomId}` : 'Mode Solo Aktif';
      dom.nowPlayingArtwork.src = DEFAULT_ARTWORK_SVG;
      updateTransportButtonsUI(false);
      return;
    }

    const modeTag = state.inRoom ? `Room ${state.roomId}` : 'Mode Solo';
    dom.nowPlayingTitle.textContent = track.title;
    dom.nowPlayingArtist.textContent = `${track.artist} • ${modeTag}`;
    dom.nowPlayingArtwork.src = track.thumbnail_url || DEFAULT_ARTWORK_SVG;
    if (track.duration_sec > 0) {
      dom.timeDuration.textContent = formatSeconds(track.duration_sec);
    }

    const isFav = (state.customPlaylists.Favorit || []).some((t) => t.id === track.id);
    if (dom.btnLikeCurrent) {
      dom.btnLikeCurrent.textContent = isFav ? '♥' : '♡';
    }
    updateTransportButtonsUI(isPlaying);

    // Media Session API: Update Lock Screen / Notification metadata
    if ('mediaSession' in navigator) {
      const artworkSrc = track.thumbnail_url || `${window.location.origin}/icon.svg`;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Senandung Track',
        artist: track.artist || 'Senandung',
        album: extractAlbumName(track) || 'Senandung Music',
        artwork: [
          { src: artworkSrc, sizes: '96x96', type: 'image/jpeg' },
          { src: artworkSrc, sizes: '128x128', type: 'image/jpeg' },
          { src: artworkSrc, sizes: '192x192', type: 'image/jpeg' },
          { src: artworkSrc, sizes: '256x256', type: 'image/jpeg' },
          { src: artworkSrc, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    }
  }

  function updateTransportButtonsUI(isPlaying) {
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

  function highlightActiveTrackRows(activeTrackId) {
    document.querySelectorAll('[data-track-id]').forEach((el) => {
      el.classList.toggle('active-playing', el.getAttribute('data-track-id') === activeTrackId);
    });
  }

  function bindAudioEvents() {
    state.audioEl.addEventListener('progress', () => {
      const audio = state.audioEl;
      if (audio.buffered && audio.buffered.length > 0 && audio.duration > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const pct = Math.min(100, Math.max(0, (bufferedEnd / audio.duration) * 100));
        dom.progressBufferedBar.style.width = `${pct.toFixed(1)}%`;
        dom.bufferPercentLabel.textContent = `Buffer ${Math.round(pct)}%`;
      }
    });

    state.audioEl.addEventListener('loadedmetadata', () => {
      if (state.audioEl.duration > 0 && Number.isFinite(state.audioEl.duration)) {
        dom.timeDuration.textContent = formatSeconds(state.audioEl.duration);
      }
    });

    state.audioEl.addEventListener('timeupdate', () => {
      const current = state.audioEl.currentTime || 0;
      const duration = state.audioEl.duration || 0;
      dom.timeCurrent.textContent = formatSeconds(current);
      if (duration > 0 && Number.isFinite(duration)) {
        const pct = Math.min(100, Math.max(0, (current / duration) * 100));
        dom.progressPlayedBar.style.width = `${pct.toFixed(2)}%`;
        dom.progressRail.setAttribute('aria-valuenow', String(Math.round(pct)));
      }
    });

    state.audioEl.addEventListener('play', () => {
      state.isPlaying = true;
      updateTransportButtonsUI(true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    });

    state.audioEl.addEventListener('pause', () => {
      state.isPlaying = false;
      updateTransportButtonsUI(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    });

    state.audioEl.addEventListener('ended', () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
      if (state.repeatMode === 'one') {
        state.audioEl.currentTime = 0;
        state.audioEl.play().catch(() => {});
        return;
      }

      if (state.inRoom) {
        sendWsAction({
          action: 'track_ended',
          finished_index: state.roomTrackIndex
        });
      } else if (state.soloQueue.length > 0) {
        if (state.shuffleEnabled && state.soloQueue.length > 1) {
          const randIdx = Math.floor(Math.random() * state.soloQueue.length);
          playSoloTrackAtIndex(randIdx);
        } else {
          playSoloTrackAtIndex(state.soloTrackIndex + 1);
        }
      }
    });

    // Register Media Session API Action Handlers for Lock Screen & Notification Controls
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (!state.loadedTrackId) {
            const first = state.soloQueue[0] || state.libraryTracks[0];
            if (first) handleUserPlayTrack(first, state.libraryTracks);
          } else {
            state.audioEl.play().catch(() => {});
            if (state.inRoom) {
              sendWsAction({
                action: 'play',
                track_index: state.roomTrackIndex,
                seek_position_sec: state.audioEl.currentTime || 0
              });
            }
          }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          state.audioEl.pause();
          if (state.inRoom) {
            sendWsAction({
              action: 'pause',
              seek_position_sec: state.audioEl.currentTime || 0
            });
          }
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (state.audioEl.currentTime > 4) {
            state.audioEl.currentTime = 0;
            if (state.inRoom) sendWsAction({ action: 'seek', seek_position_sec: 0 });
          } else if (!state.inRoom && state.soloQueue.length > 0) {
            playSoloTrackAtIndex(state.soloTrackIndex - 1);
          }
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (state.inRoom) {
            sendWsAction({ action: 'next_track' });
          } else if (state.soloQueue.length > 0) {
            if (state.shuffleEnabled && state.soloQueue.length > 1) {
              playSoloTrackAtIndex(Math.floor(Math.random() * state.soloQueue.length));
            } else {
              playSoloTrackAtIndex(state.soloTrackIndex + 1);
            }
          }
        });

        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && Number.isFinite(details.seekTime)) {
            state.audioEl.currentTime = details.seekTime;
            if (state.inRoom) {
              sendWsAction({ action: 'seek', seek_position_sec: details.seekTime });
            }
          }
        });
      } catch (_) {}
    }
  }

  // ==========================================================================
  // 5. BERANDA CATEGORIZATION: a. Album, b. Grup Band, c. History, d. Semua Lagu
  // ==========================================================================
  function extractAlbumName(track) {
    if (track.file_path && typeof track.file_path === 'string') {
      const parts = track.file_path.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const parentFolder = parts[parts.length - 2];
        if (
          parentFolder &&
          parentFolder !== 'senandung' &&
          parentFolder !== 'tracks' &&
          parentFolder !== 'hdd1'
        ) {
          return parentFolder;
        }
      }
    }
    const cleanArtist = (track.artist || 'Koleksi STB').trim();
    return cleanArtist === 'Koleksi STB' ? 'Album Koleksi STB' : ` Terbaik ${cleanArtist}`;
  }

  function extractBandName(track) {
    const rawArtist = (track.artist || '').trim();
    if (rawArtist && rawArtist !== 'Koleksi STB' && rawArtist !== 'YouTube Music') {
      return rawArtist.replace(/\s+Official$/i, '').trim();
    }
    if (track.title && track.title.includes(' - ')) {
      return track.title.split(' - ')[0].trim();
    }
    return 'Koleksi Band STB';
  }

  function renderHomeCategories() {
    renderHomeAlbumsSection();
    renderHomeBandsSection();
    renderHomeHistorySection();
    renderHomeAllSongsSection();
  }

  // 3.a: Kategori ALBUM
  function renderHomeAlbumsSection() {
    dom.homeAlbumCarousel.innerHTML = '';
    const albumMap = new Map();

    state.libraryTracks.forEach((tr) => {
      const albumTitle = extractAlbumName(tr);
      if (!albumMap.has(albumTitle)) {
        albumMap.set(albumTitle, []);
      }
      albumMap.get(albumTitle).push(tr);
    });

    if (albumMap.size === 0) {
      dom.homeSecAlbum.classList.add('hidden');
      return;
    }
    dom.homeSecAlbum.classList.remove('hidden');

    albumMap.forEach((tracksInAlbum, albumTitle) => {
      const t0 = tracksInAlbum[0];
      const t1 = tracksInAlbum[1 % tracksInAlbum.length];
      const t2 = tracksInAlbum[2 % tracksInAlbum.length];
      const t3 = tracksInAlbum[3 % tracksInAlbum.length];

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
      badge.textContent = String(tracksInAlbum.length);
      grid.appendChild(badge);

      card.style.cursor = 'pointer';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Putar Album ${albumTitle}`);

      const playOverlay = document.createElement('button');
      playOverlay.type = 'button';
      playOverlay.className = 'ytm-play-overlay-btn';
      playOverlay.setAttribute('aria-label', `Putar Album ${albumTitle}`);
      playOverlay.innerHTML = `<svg width="38" height="38" viewBox="0 0 24 24" fill="#ffffff"><path d="M8 5v14l11-7L8 5Z"/></svg>`;
      playOverlay.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handleUserPlayTrack(tracksInAlbum[0], tracksInAlbum);
      });
      grid.appendChild(playOverlay);

      card.addEventListener('click', () => {
        handleUserPlayTrack(tracksInAlbum[0], tracksInAlbum);
      });
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          handleUserPlayTrack(tracksInAlbum[0], tracksInAlbum);
        }
      });

      const titleEl = document.createElement('h3');
      titleEl.className = 'ytm-card-title';
      titleEl.textContent = albumTitle;

      const subEl = document.createElement('p');
      subEl.className = 'ytm-card-sub';
      subEl.textContent = `${tracksInAlbum.length} lagu • Album`;

      card.appendChild(grid);
      card.appendChild(titleEl);
      card.appendChild(subEl);
      dom.homeAlbumCarousel.appendChild(card);
    });
  }

  // 3.b: Kategori GRUP BAND
  function renderHomeBandsSection() {
    dom.homeBandCarousel.innerHTML = '';
    const bandMap = new Map();

    state.libraryTracks.forEach((tr) => {
      const band = extractBandName(tr);
      if (!bandMap.has(band)) {
        bandMap.set(band, []);
      }
      bandMap.get(band).push(tr);
    });

    if (bandMap.size === 0) {
      dom.homeSecBand.classList.add('hidden');
      return;
    }
    dom.homeSecBand.classList.remove('hidden');

    bandMap.forEach((tracksByBand, bandName) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ytm-band-card${state.selectedBandFilter === bandName ? ' active-band' : ''}`;

      const avatarBox = document.createElement('div');
      avatarBox.className = 'ytm-band-avatar';
      const img = document.createElement('img');
      img.src = tracksByBand[0].thumbnail_url || DEFAULT_ARTWORK_SVG;
      img.alt = bandName;
      img.width = 108;
      img.height = 108;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.src = DEFAULT_ARTWORK_SVG;
      });
      avatarBox.appendChild(img);

      const nameEl = document.createElement('div');
      nameEl.className = 'ytm-band-name';
      nameEl.textContent = bandName;

      const countEl = document.createElement('div');
      countEl.className = 'ytm-band-count';
      countEl.textContent = `${tracksByBand.length} lagu`;

      btn.appendChild(avatarBox);
      btn.appendChild(nameEl);
      btn.appendChild(countEl);

      btn.addEventListener('click', () => {
        if (state.selectedBandFilter === bandName) {
          state.selectedBandFilter = '';
          dom.localSongFilterInput.value = '';
          state.localSearchKeyword = '';
          dom.btnClearBandFilter.classList.add('hidden');
        } else {
          state.selectedBandFilter = bandName;
          dom.localSongFilterInput.value = bandName;
          state.localSearchKeyword = bandName;
          dom.btnClearBandFilter.classList.remove('hidden');
          handleUserPlayTrack(tracksByBand[0], tracksByBand);
        }
        renderHomeBandsSection();
        renderHomeAllSongsSection();
      });

      dom.homeBandCarousel.appendChild(btn);
    });
  }

  // 3.c: Kategori HISTORY
  function loadHistoryFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          state.playHistory = parsed;
        }
      }
    } catch (_) {}
  }

  function recordTrackToHistory(track) {
    if (!track || !track.id) return;
    state.playHistory = state.playHistory.filter((t) => t.id !== track.id);
    state.playHistory.unshift({
      id: track.id,
      youtube_id: track.youtube_id || track.id,
      title: track.title,
      artist: track.artist,
      duration_sec: track.duration_sec || 0,
      thumbnail_url: track.thumbnail_url || DEFAULT_ARTWORK_SVG
    });
    if (state.playHistory.length > 30) {
      state.playHistory = state.playHistory.slice(0, 30);
    }
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(state.playHistory));
    } catch (_) {}
    renderHomeHistorySection();
  }

  function renderHomeHistorySection() {
    dom.homeHistoryCarousel.innerHTML = '';
    if (!state.playHistory.length) {
      dom.historyEmptyState.classList.remove('hidden');
      return;
    }
    dom.historyEmptyState.classList.add('hidden');

    state.playHistory.forEach((track) => {
      const isCurrent = state.loadedTrackId === track.id;
      const card = createWideMediaCard(track, {
        isActive: isCurrent,
        cornerBadge: formatSeconds(track.duration_sec),
        subtitle: `${track.artist} • Diputar baru-baru ini`,
        onPrimaryClick: () => handleUserPlayTrack(track, state.playHistory),
        secondaryLabel: '+ Playlist',
        onSecondaryClick: () => addTrackToActiveCustomPlaylist(track)
      });
      dom.homeHistoryCarousel.appendChild(card);
    });
  }

  // 3.d: SEMUA LAGU + CARI SATU-SATU LAGU
  function renderHomeAllSongsSection() {
    dom.serverLibraryList.innerHTML = '';
    const kw = (state.localSearchKeyword || '').trim().toLowerCase();

    const filtered = state.libraryTracks.filter((tr) => {
      if (!kw) return true;
      const titleMatch = (tr.title || '').toLowerCase().includes(kw);
      const artistMatch = (tr.artist || '').toLowerCase().includes(kw);
      const bandMatch = extractBandName(tr).toLowerCase().includes(kw);
      const albumMatch = extractAlbumName(tr).toLowerCase().includes(kw);
      return titleMatch || artistMatch || bandMatch || albumMatch;
    });

    state.filteredLibraryTracks = filtered;
    dom.libraryTotalCount.textContent = `${filtered.length} lagu`;

    if (filtered.length === 0) {
      dom.libraryEmptyState.classList.remove('hidden');
      return;
    }
    dom.libraryEmptyState.classList.add('hidden');

    filtered.forEach((track, idx) => {
      const row = createSongTableRow(track, idx + 1, {
        isActive: state.loadedTrackId === track.id,
        onPlay: () => handleUserPlayTrack(track, filtered),
        onAddPlaylist: () => addTrackToActiveCustomPlaylist(track),
        onAddRoom: (btnEl) => {
          if (!state.inRoom) {
            enterLiveRoom(state.roomId);
          }
          enqueueDownloadToRoom(track, btnEl);
        }
      });
      dom.serverLibraryList.appendChild(row);
    });
  }

  function createSongTableRow(track, numberLabel, opts) {
    const row = document.createElement('div');
    row.className = `ytm-song-row${opts.isActive ? ' active-playing' : ''}`;
    row.setAttribute('data-track-id', track.id);

    const left = document.createElement('div');
    left.className = 'ytm-song-row-left';

    const num = document.createElement('span');
    num.className = 'ytm-song-num';
    num.textContent = opts.isActive && state.isPlaying ? '▶' : String(numberLabel);

    const thumb = document.createElement('img');
    thumb.className = 'ytm-song-thumb';
    thumb.src = track.thumbnail_url || DEFAULT_ARTWORK_SVG;
    thumb.alt = '';
    thumb.width = 48;
    thumb.height = 48;
    thumb.loading = 'lazy';
    thumb.addEventListener('error', () => {
      thumb.src = DEFAULT_ARTWORK_SVG;
    });

    const meta = document.createElement('div');
    meta.className = 'ytm-song-meta';

    const titleEl = document.createElement('div');
    titleEl.className = 'ytm-song-title';
    titleEl.textContent = track.title;

    const subEl = document.createElement('div');
    subEl.className = 'ytm-song-sub';
    subEl.textContent = `${extractBandName(track)} • ${extractAlbumName(track)} • ${formatSeconds(track.duration_sec)}`;

    meta.appendChild(titleEl);
    meta.appendChild(subEl);

    left.appendChild(num);
    left.appendChild(thumb);
    left.appendChild(meta);
    left.addEventListener('click', opts.onPlay);

    const actions = document.createElement('div');
    actions.className = 'ytm-song-actions';

    const btnPlay = document.createElement('button');
    btnPlay.type = 'button';
    btnPlay.className = 'ytm-primary-btn ytm-btn-sm';
    btnPlay.textContent = opts.isActive && state.isPlaying ? 'Diputar' : '▶ Putar';
    btnPlay.addEventListener('click', opts.onPlay);
    actions.appendChild(btnPlay);

    if (opts.onAddPlaylist) {
      const btnPl = document.createElement('button');
      btnPl.type = 'button';
      btnPl.className = 'ytm-pill-btn ytm-btn-sm';
      btnPl.textContent = '+ Playlist';
      btnPl.addEventListener('click', () => {
        opts.onAddPlaylist();
        btnPl.textContent = '✓ Tersimpan';
        setTimeout(() => {
          btnPl.textContent = '+ Playlist';
        }, 1500);
      });
      actions.appendChild(btnPl);
    }

    if (opts.onAddRoom) {
      const btnRoom = document.createElement('button');
      btnRoom.type = 'button';
      btnRoom.className = 'ytm-pill-btn ytm-btn-sm';
      btnRoom.textContent = opts.roomActionLabel || '+ Room';
      btnRoom.addEventListener('click', () => opts.onAddRoom(btnRoom));
      actions.appendChild(btnRoom);
    }

    row.appendChild(left);
    row.appendChild(actions);
    return row;
  }

  function createWideMediaCard(track, options) {
    const card = document.createElement('article');
    card.className = `ytm-media-card${options.isActive ? ' active-playing' : ''}`;
    card.setAttribute('data-track-id', track.id || track.youtube_id || '');

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
    playBtn.innerHTML = `<svg width="46" height="46" viewBox="0 0 24 24" fill="#ffffff"><path d="M8 5v14l11-7L8 5Z"/></svg>`;
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

  // ==========================================================================
  // 6. CUSTOM PLAYLISTS TAB (Phase 3: Server-Side Persistence + Fallback)
  // ==========================================================================
  async function loadCustomPlaylists() {
    // 1. Load local cache first for instant UI response
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_PL);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.customPlaylists = parsed;
        }
      }
    } catch (_) {}
    if (!Array.isArray(state.customPlaylists.Favorit)) {
      state.customPlaylists.Favorit = [];
    }

    // 2. Fetch from server REST API
    try {
      const resp = await fetch('/api/v1/playlists');
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.playlists && typeof data.playlists === 'object') {
          // If server had empty or fewer playlists but localStorage had existing data, trigger one-time migration
          const serverKeys = Object.keys(data.playlists);
          const localKeys = Object.keys(state.customPlaylists);
          const hasLocalData = localKeys.some(k => (state.customPlaylists[k] || []).length > 0);

          if (serverKeys.length <= 1 && hasLocalData && (!data.playlists.Favorit || data.playlists.Favorit.length === 0)) {
            await migrateLocalPlaylistsToServer(state.customPlaylists);
          } else {
            state.customPlaylists = data.playlists;
            if (!Array.isArray(state.customPlaylists.Favorit)) {
              state.customPlaylists.Favorit = [];
            }
            saveCustomPlaylistsLocalCache();
          }
        }
      }
    } catch (_) {
      // Offline fallback: keep using localStorage
    }

    if (state.activeTab === 'playlist') {
      renderCustomPlaylistsTab();
    }
  }

  function saveCustomPlaylistsLocalCache() {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_PL, JSON.stringify(state.customPlaylists));
    } catch (_) {}
  }

  async function migrateLocalPlaylistsToServer(localPlaylists) {
    try {
      const resp = await fetch('/api/v1/migrate-playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localPlaylists)
      });
      if (resp.ok) {
        saveCustomPlaylistsLocalCache();
      }
    } catch (_) {}
  }

  async function addTrackToActiveCustomPlaylist(track) {
    const plName = state.activeCustomPlaylistName || 'Favorit';
    if (!Array.isArray(state.customPlaylists[plName])) {
      state.customPlaylists[plName] = [];
    }
    if (!state.customPlaylists[plName].some((t) => t.id === track.id)) {
      state.customPlaylists[plName].push(track);
      saveCustomPlaylistsLocalCache();
      renderCustomPlaylistsTab();

      // Sync to server REST API
      try {
        await fetch(`/api/v1/playlists/${encodeURIComponent(plName)}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(track)
        });
      } catch (_) {}
    }
    if (state.loadedTrackId === track.id && dom.btnLikeCurrent) {
      dom.btnLikeCurrent.textContent = '♥';
    }
  }

  async function createNewCustomPlaylistPrompt() {
    const name = window.prompt('Masukkan nama Playlist baru:', 'Playlist Santai');
    if (!name || !name.trim()) return;
    const clean = name.trim();
    if (!state.customPlaylists[clean]) {
      state.customPlaylists[clean] = [];
      saveCustomPlaylistsLocalCache();
      try {
        await fetch(`/api/v1/playlists/${encodeURIComponent(clean)}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '__init__',
            youtube_id: '',
            title: '',
            artist: '',
            duration_sec: 0,
            thumbnail_url: '',
            file_path: '',
            added_by: state.deviceName,
            added_at_ms: Date.now()
          })
        });
        // Remove dummy init track
        await fetch(`/api/v1/playlists/${encodeURIComponent(clean)}/tracks/__init__`, { method: 'DELETE' });
      } catch (_) {}
    }
    state.activeCustomPlaylistName = clean;
    switchTab('playlist');
  }

  function renderCustomPlaylistsTab() {
    dom.customPlaylistsBar.innerHTML = '';
    const names = Object.keys(state.customPlaylists);

    names.forEach((name) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `ytm-chip${name === state.activeCustomPlaylistName ? ' active' : ''}`;
      chip.textContent = `${name} (${(state.customPlaylists[name] || []).length})`;
      chip.addEventListener('click', () => {
        state.activeCustomPlaylistName = name;
        renderCustomPlaylistsTab();
      });
      dom.customPlaylistsBar.appendChild(chip);
    });

    const tracks = (state.customPlaylists[state.activeCustomPlaylistName] || []).filter(t => t.id !== '__init__');
    dom.customPlaylistTracks.innerHTML = '';

    if (tracks.length === 0) {
      dom.customPlaylistEmpty.classList.remove('hidden');
      return;
    }
    dom.customPlaylistEmpty.classList.add('hidden');

    tracks.forEach((track, idx) => {
      const row = createSongTableRow(track, idx + 1, {
        isActive: state.loadedTrackId === track.id,
        onPlay: () => handleUserPlayTrack(track, tracks),
        roomActionLabel: 'Hapus',
        onAddRoom: async () => {
          const plName = state.activeCustomPlaylistName;
          state.customPlaylists[plName] = tracks.filter((t) => t.id !== track.id);
          saveCustomPlaylistsLocalCache();
          renderCustomPlaylistsTab();
          try {
            await fetch(`/api/v1/playlists/${encodeURIComponent(plName)}/tracks/${encodeURIComponent(track.id)}`, {
              method: 'DELETE'
            });
          } catch (_) {}
        }
      });
      dom.customPlaylistTracks.appendChild(row);
    });
  }

  // ==========================================================================
  // 7. EKSPLORASI TAB: YOUTUBE & WEB MUSIC SEARCH (Requirement #1.b)
  // ==========================================================================
  async function executeExploreSearch(rawQuery) {
    const clean = (rawQuery || '').trim();
    if (!clean) return;

    switchTab('eksplorasi');
    dom.exploreQueryInput.value = clean;
    dom.searchInput.value = clean;

    let effectiveQuery = clean;
    if (state.exploreSourceMode === 'official') {
      effectiveQuery = `${clean} official audio`;
    } else if (state.exploreSourceMode === 'lyrics') {
      effectiveQuery = `${clean} lirik lagu`;
    } else if (state.exploreSourceMode === 'live') {
      effectiveQuery = `${clean} live acoustic cover`;
    } else if (state.exploreSourceMode === 'fullalbum') {
      effectiveQuery = `${clean} full album`;
    }

    dom.searchEmptyState.classList.add('hidden');
    dom.searchErrorState.classList.add('hidden');
    dom.searchLoadingState.classList.remove('hidden');
    dom.searchResultsList.innerHTML = '';

    try {
      const resp = await fetch(`/api/v1/search?q=${encodeURIComponent(effectiveQuery)}`);
      const data = await resp.json();
      dom.searchLoadingState.classList.add('hidden');

      if (!resp.ok) {
        dom.searchErrorText.textContent = data.details || data.error || 'Pencarian gagal.';
        dom.searchErrorState.classList.remove('hidden');
        return;
      }

      const items = Array.isArray(data.results) ? data.results : [];
      if (items.length === 0) {
        dom.searchEmptyState.classList.remove('hidden');
        return;
      }

      items.forEach((item) => {
        const card = createWideMediaCard(item, {
          isActive: false,
          cornerBadge: item.duration_label || formatSeconds(item.duration_sec),
          subtitle: `${item.artist} • ${item.views_label || 'YouTube Music'}`,
          onPrimaryClick: () => {
            const btn = document.createElement('button');
            enqueueDownloadToRoom(item, btn);
          },
          secondaryLabel: 'Unduh ke STB',
          onSecondaryClick: (btnEl) => enqueueDownloadToRoom(item, btnEl)
        });
        dom.searchResultsList.appendChild(card);
      });
    } catch (err) {
      dom.searchLoadingState.classList.add('hidden');
      dom.searchErrorText.textContent = `Gagal menghubungi server: ${err.message}`;
      dom.searchErrorState.classList.remove('hidden');
    }
  }

  async function enqueueDownloadToRoom(item, btnEl) {
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

  // ==========================================================================
  // 8. WEBSOCKET LIVE ROOM HANDLER (Only syncs audio when state.inRoom === true)
  // ==========================================================================
  function connectWebSocket() {
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    state.ws = ws;

    ws.addEventListener('open', () => {
      state.wsConnected = true;
      if (state.inRoom) {
        dom.wsStatusDot.classList.add('online');
        sendWsAction({
          action: 'join_room',
          room_id: state.roomId,
          device_name: state.deviceName,
          arch: state.arch,
          client_timestamp_ms: Date.now()
        });
      }
      sendRapidNtpPings();
    });

    ws.addEventListener('message', (ev) => {
      try {
        handleServerWsMessage(JSON.parse(ev.data));
      } catch (_) {}
    });

    ws.addEventListener('close', () => {
      state.wsConnected = false;
      dom.wsStatusDot.classList.remove('online');
      if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectWebSocket, 3000);
    });
  }

  // Phase 2 Task 2.1: Multi-Sample Median NTP Filter
  let ntpSamples = [];
  function sendRapidNtpPings() {
    ntpSamples = [];
    let count = 0;
    const interval = setInterval(() => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN || count >= 5) {
        clearInterval(interval);
        return;
      }
      sendWsAction({
        action: 'ntp_ping',
        client_timestamp_ms: Date.now()
      });
      count++;
    }, 50);
  }

  function sendWsAction(payload) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(payload));
    }
  }

  function handleServerWsMessage(msg) {
    if (msg.event === 'ntp_pong') {
      const now = Date.now();
      const rtt = now - msg.client_timestamp_ms;
      const estimatedServerNow = msg.server_timestamp_ms + Math.round(rtt / 2);
      const calculatedOffset = estimatedServerNow - now;

      ntpSamples.push(calculatedOffset);

      // Compute median offset when samples are available
      const sorted = ntpSamples.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      state.ntpOffsetMs = sorted.length % 2 === 1
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

      if (state.inRoom) {
        dom.ntpOffsetBadge.textContent = `NTP ${state.ntpOffsetMs >= 0 ? '+' : ''}${state.ntpOffsetMs}ms`;
      }
      return;
    }

    const data = msg.data || {};
    switch (msg.event) {
      case 'room_state_snapshot': {
        state.roomPlaylist = Array.isArray(data.playlist) ? data.playlist : [];
        state.roomTrackIndex = typeof data.current_track_index === 'number' ? data.current_track_index : 0;
        renderConnectedUsers(data.connected_users || []);
        renderRoomPlaylistTab();

        if (state.inRoom && state.roomPlaylist[state.roomTrackIndex]) {
          const activeTrack = state.roomPlaylist[state.roomTrackIndex];
          if (data.is_playing) {
            scheduleRoomPlay(
              activeTrack,
              data.play_timestamp || Date.now(),
              state.ntpOffsetMs,
              data.seek_position_sec || 0
            );
          } else {
            updateNowPlayingBar(activeTrack, false);
          }
        }
        break;
      }

      case 'playlist_updated': {
        state.roomPlaylist = Array.isArray(data.playlist) ? data.playlist : [];
        state.roomTrackIndex = typeof data.current_track_index === 'number' ? data.current_track_index : 0;
        renderRoomPlaylistTab();
        fetchServerLibrary();
        break;
      }

      case 'playback_sync': {
        state.roomTrackIndex = typeof data.current_track_index === 'number' ? data.current_track_index : 0;
        renderRoomPlaylistTab();
        if (!state.inRoom) break;

        const activeTrack = state.roomPlaylist[state.roomTrackIndex];
        if (!activeTrack) break;

        if (data.is_playing) {
          scheduleRoomPlay(
            activeTrack,
            data.play_timestamp || Date.now(),
            state.ntpOffsetMs,
            data.seek_position_sec || 0
          );
        } else {
          state.audioEl.pause();
          if (typeof data.seek_position_sec === 'number') {
            try {
              state.audioEl.currentTime = data.seek_position_sec;
            } catch (_) {}
          }
          updateNowPlayingBar(activeTrack, false);
        }
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
        // Requirement #2: Automatically return to Solo Mode when server restarts or updates
        leaveLiveRoomToSolo(true);
        break;
      }
    }
  }

  function renderConnectedUsers(users) {
    state.roomConnectedUsers = users;
    dom.listenerCountBadge.textContent = String(state.inRoom ? (users.length || 1) : 1);
    dom.connectedUsersList.innerHTML = '';

    if (!state.inRoom || !users.length) {
      const li = document.createElement('li');
      li.className = 'listener-chip';
      li.textContent = `${state.deviceName} (Mode Solo)`;
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

  function renderRoomPlaylistTab() {
    dom.roomPlaylistList.innerHTML = '';
    const count = state.roomPlaylist.length;
    dom.playlistCountLabel.textContent = `${count} lagu`;

    if (count === 0) {
      dom.playlistEmptyState.classList.remove('hidden');
      return;
    }
    dom.playlistEmptyState.classList.add('hidden');

    state.roomPlaylist.forEach((track, idx) => {
      const isCurrent = state.inRoom && idx === state.roomTrackIndex;
      const row = createSongTableRow(track, idx + 1, {
        isActive: isCurrent,
        onPlay: () => {
          if (!state.inRoom) {
            enterLiveRoom(state.roomId);
          }
          sendWsAction({
            action: 'select_track',
            track_index: idx
          });
          playTrackDirectly(track, 0);
        },
        roomActionLabel: 'Hapus',
        onAddRoom: () => {
          sendWsAction({
            action: 'remove_track',
            track_id: track.id
          });
        }
      });
      dom.roomPlaylistList.appendChild(row);
    });
  }

  function handleDownloadProgressEvent(data) {
    if (data.status === 'queued' || data.status === 'downloading') {
      dom.downloadStatusText.textContent = `Mengunduh "${data.title}" ke penyimpanan STB (${data.status})...`;
      dom.downloadStatusBanner.classList.remove('hidden');
    } else if (data.status === 'completed') {
      dom.downloadStatusText.textContent = `"${data.title}" selesai diunduh dan siap diputar!`;
      dom.downloadStatusBanner.classList.remove('hidden');
      fetchServerLibrary().then(() => {
        if (!state.isPlaying && data.track) {
          handleUserPlayTrack(data.track, state.libraryTracks);
        }
      });
      setTimeout(() => {
        dom.downloadStatusBanner.classList.add('hidden');
      }, 3500);
    } else if (data.status === 'failed') {
      dom.downloadStatusBanner.classList.add('hidden');
      dom.roomErrorText.textContent = `Unduhan "${data.title}" gagal: ${data.message || 'Periksa yt-dlp'}`;
      dom.roomErrorBanner.classList.remove('hidden');
    }
  }

  // ==========================================================================
  // 9. SERVER API FETCH & VIEWPORT TOGGLE
  // ==========================================================================
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
      state.libraryTracks = tracks;
      if (!state.soloQueue.length && tracks.length > 0) {
        state.soloQueue = tracks.slice();
      }
      renderHomeCategories();
    } catch (_) {}
  }

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

  // ==========================================================================
  // 10. UI EVENT BINDINGS
  // ==========================================================================
  function bindUiControls() {
    dom.btnSidebarToggle.addEventListener('click', () => {
      if (window.innerWidth < 768 || dom.body.classList.contains('mobile')) {
        dom.sidebar.classList.toggle('mobile-open');
      } else {
        dom.sidebar.classList.toggle('collapsed');
      }
    });

    dom.brandHomeLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      switchTab('beranda');
    });

    dom.btnViewToggle.addEventListener('click', () => {
      const current = dom.body.classList.contains('mobile') ? 'mobile' : 'desktop';
      const next = current === 'mobile' ? 'desktop' : 'mobile';
      localStorage.setItem(STORAGE_KEY_VIEW, next);
      applyViewMode(next);
    });

    // 4 Left Sidebar Tabs
    document.querySelectorAll('.ytm-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') || 'beranda';
        switchTab(tab);
      });
    });

    // Beranda Category Filter Chips
    document.querySelectorAll('[data-home-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-home-filter]').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.getAttribute('data-home-filter');
        if (filter === 'album') {
          dom.homeSecAlbum.scrollIntoView({ behavior: 'smooth' });
        } else if (filter === 'band') {
          dom.homeSecBand.scrollIntoView({ behavior: 'smooth' });
        } else if (filter === 'history') {
          dom.homeSecHistory.scrollIntoView({ behavior: 'smooth' });
        } else if (filter === 'all-songs') {
          dom.homeSecAllSongs.scrollIntoView({ behavior: 'smooth' });
          dom.localSongFilterInput.focus();
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    // Beranda Local One-by-One Song Search (Requirement #3.d)
    dom.localSongFilterInput.addEventListener('input', () => {
      state.localSearchKeyword = dom.localSongFilterInput.value;
      renderHomeAllSongsSection();
    });

    dom.btnPlayAllFiltered.addEventListener('click', () => {
      const list = state.filteredLibraryTracks.length ? state.filteredLibraryTracks : state.libraryTracks;
      if (list.length > 0) {
        handleUserPlayTrack(list[0], list);
      }
    });

    dom.btnClearBandFilter.addEventListener('click', () => {
      state.selectedBandFilter = '';
      state.localSearchKeyword = '';
      dom.localSongFilterInput.value = '';
      dom.btnClearBandFilter.classList.add('hidden');
      renderHomeBandsSection();
      renderHomeAllSongsSection();
    });

    dom.btnClearHistory.addEventListener('click', () => {
      state.playHistory = [];
      localStorage.removeItem(STORAGE_KEY_HISTORY);
      renderHomeHistorySection();
    });

    dom.btnRefreshLibrary.addEventListener('click', fetchServerLibrary);

    // Audio Error Banner & Retry Button (Instantly unlocks and plays on click)
    const handleRetryAudio = () => {
      dom.roomErrorBanner.classList.add('hidden');
      state.audioUnlocked = true;
      const targetTrack = state.currentTrack || state.soloQueue[state.soloTrackIndex] || state.libraryTracks[0];
      if (targetTrack) {
        playTrackDirectly(targetTrack, state.audioEl.currentTime || 0);
      } else {
        fetchServerLibrary().then(() => {
          if (state.libraryTracks.length) {
            playTrackDirectly(state.libraryTracks[0], 0);
          }
        });
      }
    };
    if (dom.btnRetryWs) {
      dom.btnRetryWs.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handleRetryAudio();
      });
    }
    if (dom.roomErrorBanner) {
      dom.roomErrorBanner.style.cursor = 'pointer';
      dom.roomErrorBanner.addEventListener('click', handleRetryAudio);
    }

    // Topbar & Eksplorasi Search Forms
    dom.searchInput.addEventListener('input', () => {
      dom.btnSearchClear.classList.toggle('hidden', !dom.searchInput.value.trim());
    });

    dom.btnSearchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      dom.btnSearchClear.classList.add('hidden');
      dom.searchInput.focus();
    });

    dom.searchForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      executeExploreSearch(dom.searchInput.value);
    });

    dom.exploreInlineForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      executeExploreSearch(dom.exploreQueryInput.value);
    });

    document.querySelectorAll('[data-explore-source]').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-explore-source]').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        state.exploreSourceMode = chip.getAttribute('data-explore-source') || 'ytm';
        const q = dom.exploreQueryInput.value.trim() || dom.searchInput.value.trim();
        if (q) executeExploreSearch(q);
      });
    });

    // Playlist Tab Controls
    dom.btnNewCustomPlaylist.addEventListener('click', createNewCustomPlaylistPrompt);
    dom.btnCreatePlaylistMain.addEventListener('click', createNewCustomPlaylistPrompt);
    dom.btnLikeCurrent.addEventListener('click', () => {
      const currentTrack = state.soloQueue[state.soloTrackIndex] || state.libraryTracks[0];
      if (currentTrack) {
        addTrackToActiveCustomPlaylist(currentTrack);
      }
    });

    // Carousel Left/Right Arrows
    document.querySelectorAll('.ytm-arrow-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-scroll-target');
        const dir = parseInt(btn.getAttribute('data-dir') || '1', 10);
        const container = document.getElementById(targetId);
        if (container) {
          container.scrollBy({ left: dir * 560, behavior: 'smooth' });
        }
      });
    });

    // Transport Controls (Direct HTML5 Audio + Room Sync)
    dom.btnPrevTrack.addEventListener('click', () => {
      if (state.audioEl.currentTime > 4) {
        state.audioEl.currentTime = 0;
        if (state.inRoom) sendWsAction({ action: 'seek', seek_position_sec: 0 });
      } else if (!state.inRoom && state.soloQueue.length > 0) {
        playSoloTrackAtIndex(state.soloTrackIndex - 1);
      }
    });

    dom.btnPlayToggle.addEventListener('click', () => {
      if (!state.loadedTrackId) {
        const first = state.soloQueue[0] || state.libraryTracks[0];
        if (first) {
          handleUserPlayTrack(first, state.libraryTracks);
        }
        return;
      }

      if (state.isPlaying) {
        state.audioEl.pause();
        if (state.inRoom) {
          sendWsAction({
            action: 'pause',
            seek_position_sec: state.audioEl.currentTime || 0
          });
        }
      } else {
        state.audioEl.muted = false;
        state.audioEl.play().catch(() => {});
        if (state.inRoom) {
          sendWsAction({
            action: 'play',
            track_index: state.roomTrackIndex,
            seek_position_sec: state.audioEl.currentTime || 0
          });
        }
      }
    });

    dom.btnNextTrack.addEventListener('click', () => {
      if (state.inRoom) {
        sendWsAction({ action: 'next_track' });
      } else if (state.soloQueue.length > 0) {
        if (state.shuffleEnabled && state.soloQueue.length > 1) {
          playSoloTrackAtIndex(Math.floor(Math.random() * state.soloQueue.length));
        } else {
          playSoloTrackAtIndex(state.soloTrackIndex + 1);
        }
      }
    });

    dom.btnShuffleToggle.addEventListener('click', () => {
      state.shuffleEnabled = !state.shuffleEnabled;
      dom.btnShuffleToggle.classList.toggle('active-mode', state.shuffleEnabled);
      dom.btnShuffleToggle.title = state.shuffleEnabled ? 'Shuffle: Aktif' : 'Shuffle: Mati';
    });

    dom.btnRepeatToggle.addEventListener('click', () => {
      state.repeatMode = state.repeatMode === 'all' ? 'one' : 'all';
      dom.btnRepeatToggle.classList.toggle('active-mode', state.repeatMode === 'one');
      dom.btnRepeatToggle.title = state.repeatMode === 'one' ? 'Repeat: 1 Lagu' : 'Repeat: Semua';
    });

    dom.btnMuteToggle.addEventListener('click', () => {
      state.audioEl.muted = !state.audioEl.muted;
      dom.btnMuteToggle.classList.toggle('active-mode', state.audioEl.muted);
    });

    dom.volumeSlider.addEventListener('input', () => {
      state.audioEl.muted = false;
      state.audioEl.volume = parseFloat(dom.volumeSlider.value);
    });

    dom.progressRail.addEventListener('click', (ev) => {
      if (!state.audioEl.duration || !Number.isFinite(state.audioEl.duration)) return;
      const rect = dom.progressRail.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const seekSec = ratio * state.audioEl.duration;
      state.audioEl.currentTime = seekSec;
      if (state.inRoom) {
        sendWsAction({ action: 'seek', seek_position_sec: seekSec });
      }
    });

    // Value-Add Feature #6: Sleep Timer (Off -> 15m -> 30m -> 60m)
    dom.btnSleepTimer.addEventListener('click', () => {
      const cycle = [0, 15, 30, 60];
      const nextIdx = (cycle.indexOf(state.sleepTimerMinutes) + 1) % cycle.length;
      state.sleepTimerMinutes = cycle[nextIdx];

      if (state.sleepTimerHandle) {
        clearTimeout(state.sleepTimerHandle);
        state.sleepTimerHandle = null;
      }

      if (state.sleepTimerMinutes === 0) {
        dom.sleepTimerBadge.classList.add('hidden');
        dom.btnSleepTimer.title = 'Sleep Timer: Mati';
      } else {
        dom.sleepTimerBadge.textContent = `${state.sleepTimerMinutes}m`;
        dom.sleepTimerBadge.classList.remove('hidden');
        dom.btnSleepTimer.title = `Sleep Timer: ${state.sleepTimerMinutes} menit`;
        state.sleepTimerHandle = setTimeout(() => {
          state.audioEl.pause();
          state.sleepTimerMinutes = 0;
          dom.sleepTimerBadge.classList.add('hidden');
        }, state.sleepTimerMinutes * 60 * 1000);
      }
    });

    // Requirement #2: Cast Button, Topbar Leave Room Button, and Room Tab Controls
    const openRoomModal = () => {
      dom.roomInput.value = state.roomId;
      dom.roomModalBackdrop.classList.remove('hidden');
      dom.roomInput.focus();
    };
    const closeRoomModal = () => {
      dom.roomModalBackdrop.classList.add('hidden');
    };

    dom.btnCastRoom.addEventListener('click', openRoomModal);
    dom.btnRoomTabJoin.addEventListener('click', openRoomModal);
    dom.btnCloseRoomModal.addEventListener('click', closeRoomModal);
    dom.roomModalBackdrop.addEventListener('click', (ev) => {
      if (ev.target === dom.roomModalBackdrop) closeRoomModal();
    });

    dom.btnTopbarLeaveRoom.addEventListener('click', () => leaveLiveRoomToSolo(false));
    dom.btnRoomTabLeave.addEventListener('click', () => leaveLiveRoomToSolo(false));
    dom.btnModalLeaveRoom.addEventListener('click', () => {
      leaveLiveRoomToSolo(false);
      closeRoomModal();
    });

    document.querySelectorAll('.quick-room-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const target = chip.getAttribute('data-room') || 'Lobby';
        dom.roomInput.value = target;
        dom.roomTabInlineInput.value = target;
        enterLiveRoom(target);
        closeRoomModal();
        switchTab('room');
      });
    });

    dom.btnJoinRoom.addEventListener('click', () => {
      const target = dom.roomInput.value.trim() || 'Lobby';
      enterLiveRoom(target);
      closeRoomModal();
      switchTab('room');
    });

    dom.btnRoomTabInlineSubmit.addEventListener('click', () => {
      const target = dom.roomTabInlineInput.value.trim() || 'Lobby';
      enterLiveRoom(target);
    });

    // Requirement #4: Selectable Avatar & Auto-Save Device Modal
    const openDeviceModal = () => {
      dom.deviceNameInput.value = state.deviceName;
      renderSelectableAvatarGrid();
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

    let renameDebounce = null;
    dom.deviceNameInput.addEventListener('input', () => {
      const val = dom.deviceNameInput.value.trim();
      if (!val) return;
      saveDeviceProfileByToken(val, state.avatarIndex);
      dom.deviceAutosaveStatus.textContent = `Nama "${val}" tersimpan otomatis di token ${state.deviceToken}`;
      if (renameDebounce) clearTimeout(renameDebounce);
      renameDebounce = setTimeout(() => {
        if (state.inRoom) {
          sendWsAction({ action: 'rename_device', device_name: val });
        }
      }, 300);
    });

    dom.btnResetDeviceName.addEventListener('click', () => {
      const autoName = generateAutoDeviceName();
      dom.deviceNameInput.value = autoName;
      saveDeviceProfileByToken(autoName, state.avatarIndex);
      if (state.inRoom) {
        sendWsAction({ action: 'rename_device', device_name: autoName });
      }
    });

    dom.deviceNameForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const val = dom.deviceNameInput.value.trim();
      if (val) {
        saveDeviceProfileByToken(val, state.avatarIndex);
        if (state.inRoom) {
          sendWsAction({ action: 'rename_device', device_name: val });
        }
      }
      closeDeviceModal();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (!dom.deviceModalBackdrop.classList.contains('hidden')) closeDeviceModal();
        if (!dom.roomModalBackdrop.classList.contains('hidden')) closeRoomModal();
      }
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
    loadHistoryFromStorage();
    loadCustomPlaylists();
    updateRoomModeUI();
    bindAutoExitRoomLifecycle();
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
