// Senandung Main Application Logic
document.addEventListener('DOMContentLoaded', () => {
  const state = {
    songs: [],
    favorites: new Set(),
    playlists: [],
    currentSong: null,
    isPlaying: false,
    isShuffle: false,
    repeatMode: 'none', // 'none', 'one', 'all'
    lyrics: [],
    sleepTimerId: null,
  };

  // Elements
  const homeSongList = document.getElementById('homeSongList');
  const favoritesSongList = document.getElementById('favoritesSongList');
  const offlineSongList = document.getElementById('offlineSongList');
  const searchInput = document.getElementById('searchInput');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnShuffle = document.getElementById('btnShuffle');
  const btnRepeat = document.getElementById('btnRepeat');
  const progressBar = document.getElementById('progressBar');
  const progressWrapper = document.getElementById('progressWrapper');
  const currentTimeText = document.getElementById('currentTimeText');
  const totalDurationText = document.getElementById('totalDurationText');
  const playerTitle = document.getElementById('playerTitle');
  const playerArtist = document.getElementById('playerArtist');
  const playerCoverWrapper = document.getElementById('playerCoverWrapper');
  const playerFavBtn = document.getElementById('playerFavBtn');
  const volumeSlider = document.getElementById('volumeSlider');

  // Modals & Drawers
  const downloadModal = document.getElementById('downloadModal');
  const btnOpenDownloadModal = document.getElementById('btnOpenDownloadModal');
  const btnCloseDownloadModal = document.getElementById('btnCloseDownloadModal');
  const btnStartDownload = document.getElementById('btnStartDownload');
  const ytQueryInput = document.getElementById('ytQueryInput');
  const downloadQueueList = document.getElementById('downloadQueueList');
  const btnScanLocal = document.getElementById('btnScanLocal');

  const lyricsOverlay = document.getElementById('lyricsOverlay');
  const btnLyrics = document.getElementById('btnLyrics');
  const btnCloseLyrics = document.getElementById('btnCloseLyrics');
  const lyricsContent = document.getElementById('lyricsContent');

  const equalizerModal = document.getElementById('equalizerModal');
  const btnEqualizer = document.getElementById('btnEqualizer');
  const btnCloseEQ = document.getElementById('btnCloseEQ');
  const btnResetEQ = document.getElementById('btnResetEQ');
  const btnSleepTimer = document.getElementById('btnSleepTimer');
  const btnDownloadOffline = document.getElementById('btnDownloadOffline');

  // --- Initial Load ---
  fetchSongs();
  fetchFavorites();
  fetchPlaylists();

  // Initialize Sync Client
  window.syncClient.connect();
  window.syncClient.onClockUpdate = (offset) => {
    const el = document.getElementById('syncClockInfo');
    if (el) el.innerText = `NTP Clock Sync: Terhubung (Offset: ${Math.round(offset)} ms)`;
  };

  window.syncClient.onSyncState = (msg) => {
    const statusText = document.getElementById('listenerCountText');
    if (statusText) statusText.innerText = `${msg.listeners} Perangkat Terhubung`;

    if (msg.song && (!state.currentSong || state.currentSong.id !== msg.song.id)) {
      loadSong(msg.song, false);
    }

    if (msg.is_playing && !state.isPlaying) {
      window.audioEngine.play();
      state.isPlaying = true;
      updatePlayPauseButton();
    } else if (!msg.is_playing && state.isPlaying) {
      window.audioEngine.pause();
      state.isPlaying = false;
      updatePlayPauseButton();
    }

    // Koreksi drift jika perbedaan > 0.35 detik
    const localPos = window.audioEngine.getCurrentTime();
    if (Math.abs(localPos - msg.position_sec) > 0.35) {
      window.audioEngine.seek(msg.position_sec);
    }
  };

  // --- Audio Engine Callbacks ---
  window.audioEngine.onTimeUpdate = (currentTime, duration) => {
    if (!duration) return;
    const percent = (currentTime / duration) * 100;
    progressBar.style.width = `${percent}%`;
    currentTimeText.innerText = formatTime(currentTime);
    totalDurationText.innerText = formatTime(duration);
    syncKaraokeLyrics(currentTime);
  };

  window.audioEngine.onEnded = () => {
    if (state.repeatMode === 'one') {
      window.audioEngine.seek(0);
      window.audioEngine.play();
    } else {
      playNextSong();
    }
  };

  // --- Tab Navigation ---
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const tabId = item.dataset.tab;
      const sec = document.getElementById(tabId);
      if (sec) sec.classList.add('active');

      if (tabId === 'tab-offline') renderOfflineList();
    });
  });

  // --- API Calls ---
  async function fetchSongs() {
    try {
      const res = await fetch('/api/songs');
      state.songs = await res.json() || [];
      renderSongList(state.songs, homeSongList);
    } catch (e) {
      console.error("Gagal mengambil data lagu:", e);
    }
  }

  async function fetchFavorites() {
    try {
      const res = await fetch('/api/favorites');
      const favList = await res.json() || [];
      state.favorites = new Set(favList);
      renderFavorites();
      updatePlayerFavIcon();
    } catch (e) {
      console.error("Gagal mengambil data favorit:", e);
    }
  }

  async function fetchPlaylists() {
    try {
      const res = await fetch('/api/playlists');
      state.playlists = await res.json() || [];
      renderPlaylists();
    } catch (e) {
      console.error("Gagal mengambil playlists:", e);
    }
  }

  // --- Render Functions ---
  function renderSongList(list, container) {
    if (!container) return;
    container.innerHTML = '';
    if (!list || list.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted); font-size:14px; padding:10px 0;">Tidak ada lagu yang ditemukan. Coba scan lokal atau unduh dari YouTube!</div>';
      return;
    }

    list.forEach(song => {
      const row = document.createElement('div');
      row.className = `song-row ${state.currentSong && state.currentSong.id === song.id ? 'playing' : ''}`;
      
      const isFav = state.favorites.has(song.id);
      const coverHtml = song.cover_url 
        ? `<img class="song-cover-thumb" src="${song.cover_url}" alt="Cover">`
        : `<div class="song-cover-thumb">🎵</div>`;

      row.innerHTML = `
        ${coverHtml}
        <div class="song-info">
          <div class="song-name">${escapeHtml(song.title)}</div>
          <div class="song-meta">${escapeHtml(song.artist || 'Artis Tidak Diketahui')} • ${escapeHtml(song.album || 'Lokal')}</div>
        </div>
        <div class="song-actions">
          <button class="icon-btn fav-btn ${isFav ? 'active' : ''}" data-id="${song.id}">
            ${isFav ? '❤️' : '🤍'}
          </button>
          <button class="icon-btn dl-offline-btn" data-id="${song.id}" title="Simpan ke HP">📲</button>
        </div>
      `;

      row.querySelector('.song-info').addEventListener('click', () => {
        playSong(song);
      });

      row.querySelector('.fav-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleFavorite(song.id);
      });

      row.querySelector('.dl-offline-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await window.audioEngine.saveOffline(song);
          alert(`Berhasil menyimpan "${song.title}" ke memori HP/browser!`);
        } catch (err) {
          alert('Gagal menyimpan offline: ' + err.message);
        }
      });

      container.appendChild(row);
    });
  }

  function renderFavorites() {
    const favSongs = state.songs.filter(s => state.favorites.has(s.id));
    renderSongList(favSongs, favoritesSongList);
  }

  function renderOfflineList() {
    const offlineSongs = window.audioEngine.getOfflineSongs();
    renderSongList(offlineSongs, offlineSongList);
  }

  function renderPlaylists() {
    const container = document.getElementById('playlistContainer');
    if (!container) return;
    container.innerHTML = '';
    state.playlists.forEach(pl => {
      const card = document.createElement('div');
      card.style.cssText = 'background:#181818; padding:16px; border-radius:8px; cursor:pointer; border:1px solid #282828;';
      card.innerHTML = `
        <div style="font-size:32px; margin-bottom:8px;">📁</div>
        <div style="font-weight:bold; font-size:15px; margin-bottom:4px;">${escapeHtml(pl.name)}</div>
        <div style="font-size:12px; color:var(--text-muted);">${(pl.song_ids || []).length} Lagu</div>
      `;
      card.addEventListener('click', () => {
        const plSongs = state.songs.filter(s => (pl.song_ids || []).includes(s.id));
        renderSongList(plSongs, homeSongList);
        document.querySelector('[data-tab="tab-home"]').click();
      });
      container.appendChild(card);
    });
  }

  // --- Playback Logic ---
  async function playSong(song) {
    loadSong(song, true);
    window.syncClient.emitTrackChange(song);
  }

  async function loadSong(song, autoPlay = true) {
    state.currentSong = song;
    playerTitle.innerText = song.title;
    playerArtist.innerText = song.artist || 'Artis Lokal';

    if (song.cover_url) {
      playerCoverWrapper.innerHTML = `<img src="${song.cover_url}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;">`;
    } else {
      playerCoverWrapper.innerHTML = '🎵';
    }

    updatePlayerFavIcon();
    parseLyrics(song.lyrics || "");

    // Update active highlight in list
    document.querySelectorAll('.song-row').forEach(r => r.classList.remove('playing'));

    await window.audioEngine.loadTrack(song.id, song.file_path);
    if (autoPlay) {
      await window.audioEngine.play();
      state.isPlaying = true;
      updatePlayPauseButton();
    }
  }

  function updatePlayPauseButton() {
    btnPlayPause.innerText = state.isPlaying ? '⏸️' : '▶️';
  }

  function updatePlayerFavIcon() {
    if (!state.currentSong) return;
    const isFav = state.favorites.has(state.currentSong.id);
    playerFavBtn.innerText = isFav ? '❤️' : '🤍';
    playerFavBtn.classList.toggle('active', isFav);
  }

  async function toggleFavorite(songID) {
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_id: songID })
      });
      const data = await res.json();
      if (data.is_favorite) {
        state.favorites.add(songID);
      } else {
        state.favorites.delete(songID);
      }
      renderSongList(state.songs, homeSongList);
      renderFavorites();
      updatePlayerFavIcon();
    } catch (e) {
      console.error(e);
    }
  }

  function playNextSong() {
    if (state.songs.length === 0) return;
    let nextIdx = 0;
    if (state.isShuffle) {
      nextIdx = Math.floor(Math.random() * state.songs.length);
    } else if (state.currentSong) {
      const curIdx = state.songs.findIndex(s => s.id === state.currentSong.id);
      nextIdx = (curIdx + 1) % state.songs.length;
    }
    playSong(state.songs[nextIdx]);
  }

  function playPrevSong() {
    if (state.songs.length === 0) return;
    let prevIdx = 0;
    if (state.currentSong) {
      const curIdx = state.songs.findIndex(s => s.id === state.currentSong.id);
      prevIdx = (curIdx - 1 + state.songs.length) % state.songs.length;
    }
    playSong(state.songs[prevIdx]);
  }

  // --- Event Listeners ---
  btnPlayPause.addEventListener('click', () => {
    if (!state.currentSong && state.songs.length > 0) {
      playSong(state.songs[0]);
      return;
    }
    if (state.isPlaying) {
      window.audioEngine.pause();
      state.isPlaying = false;
      window.syncClient.emitPause(window.audioEngine.getCurrentTime());
    } else {
      window.audioEngine.play();
      state.isPlaying = true;
      window.syncClient.emitPlay(window.audioEngine.getCurrentTime());
    }
    updatePlayPauseButton();
  });

  btnNext.addEventListener('click', playNextSong);
  btnPrev.addEventListener('click', playPrevSong);

  btnShuffle.addEventListener('click', () => {
    state.isShuffle = !state.isShuffle;
    btnShuffle.classList.toggle('active', state.isShuffle);
  });

  btnRepeat.addEventListener('click', () => {
    if (state.repeatMode === 'none') {
      state.repeatMode = 'all';
      btnRepeat.innerText = '🔁';
      btnRepeat.classList.add('active');
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      btnRepeat.innerText = '🔂';
    } else {
      state.repeatMode = 'none';
      btnRepeat.innerText = '🔁';
      btnRepeat.classList.remove('active');
    }
  });

  playerFavBtn.addEventListener('click', () => {
    if (state.currentSong) toggleFavorite(state.currentSong.id);
  });

  progressWrapper.addEventListener('click', (e) => {
    const rect = progressWrapper.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const dur = window.audioEngine.getDuration();
    if (dur > 0) {
      const seekSec = pos * dur;
      window.audioEngine.seek(seekSec);
      window.syncClient.emitSeek(seekSec);
    }
  });

  volumeSlider.addEventListener('input', (e) => {
    window.audioEngine.setVolume(parseFloat(e.target.value));
  });

  // Search filter
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderSongList(state.songs, homeSongList);
      return;
    }
    const filtered = state.songs.filter(s => 
      s.title.toLowerCase().includes(q) || 
      (s.artist && s.artist.toLowerCase().includes(q))
    );
    renderSongList(filtered, homeSongList);
  });

  // --- Downloader & Scan ---
  btnOpenDownloadModal.addEventListener('click', () => {
    downloadModal.classList.add('open');
  });

  btnCloseDownloadModal.addEventListener('click', () => {
    downloadModal.classList.remove('open');
  });

  btnStartDownload.addEventListener('click', async () => {
    const query = ytQueryInput.value.trim();
    if (!query) return;

    btnStartDownload.disabled = true;
    btnStartDownload.innerText = 'Mengirim...';

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
      });
      const job = await res.json();
      ytQueryInput.value = '';
      pollDownloadJobs();
    } catch (e) {
      alert("Gagal memulai unduhan: " + e.message);
    } finally {
      btnStartDownload.disabled = false;
      btnStartDownload.innerText = 'Mulai Unduh';
    }
  });

  async function pollDownloadJobs() {
    try {
      const res = await fetch('/api/download/status');
      const jobs = await res.json() || [];
      downloadQueueList.innerHTML = '';
      jobs.forEach(j => {
        const div = document.createElement('div');
        div.style.padding = '6px 0';
        div.style.borderBottom = '1px solid #333';
        div.innerHTML = `<strong>${escapeHtml(j.query)}</strong>: <span>${escapeHtml(j.progress)}</span>`;
        downloadQueueList.appendChild(div);
      });

      const hasPending = jobs.some(j => j.status === 'pending' || j.status === 'downloading');
      if (hasPending) {
        setTimeout(pollDownloadJobs, 3000);
      } else {
        fetchSongs(); // Refresh daftar lagu setelah selesai
      }
    } catch (e) {
      console.error(e);
    }
  }

  btnScanLocal.addEventListener('click', async () => {
    btnScanLocal.innerText = 'Memindai...';
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      alert(`Pemindaian berhasil! Ditemukan ${data.new_songs} lagu baru di STB.`);
      fetchSongs();
    } catch (e) {
      alert("Gagal scan folder: " + e.message);
    } finally {
      btnScanLocal.innerText = '🔄 Pindai STB';
    }
  });

  // --- Karaoke Lyrics ---
  btnLyrics.addEventListener('click', () => {
    lyricsOverlay.classList.add('open');
  });

  btnCloseLyrics.addEventListener('click', () => {
    lyricsOverlay.classList.remove('open');
  });

  function parseLyrics(lrcText) {
    state.lyrics = [];
    lyricsContent.innerHTML = '';

    if (!lrcText || !lrcText.includes('[')) {
      lyricsContent.innerHTML = '<div style="color:var(--text-muted); font-size:16px;">Lirik sinkron (.lrc) belum tersedia untuk trek ini.</div>';
      return;
    }

    const lines = lrcText.split('\n');
    const regex = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\](.*)/;

    lines.forEach(line => {
      const match = line.match(regex);
      if (match) {
        const min = parseInt(match[1]);
        const sec = parseInt(match[2]);
        const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;
        const time = min * 60 + sec + ms / 1000;
        const text = match[4].trim();
        if (text) {
          state.lyrics.push({ time, text });
        }
      }
    });

    state.lyrics.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'lyrics-line';
      el.id = `lyric-line-${index}`;
      el.innerText = item.text;
      el.addEventListener('click', () => {
        window.audioEngine.seek(item.time);
        window.syncClient.emitSeek(item.time);
      });
      lyricsContent.appendChild(el);
    });
  }

  function syncKaraokeLyrics(currTime) {
    if (state.lyrics.length === 0) return;
    for (let i = 0; i < state.lyrics.length; i++) {
      const isCurrent = currTime >= state.lyrics[i].time && 
        (i === state.lyrics.length - 1 || currTime < state.lyrics[i + 1].time);

      const el = document.getElementById(`lyric-line-${i}`);
      if (el) {
        if (isCurrent && !el.classList.contains('active')) {
          document.querySelectorAll('.lyrics-line').forEach(l => l.classList.remove('active'));
          el.classList.add('active');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  // --- Equalizer & Sleep Timer ---
  btnEqualizer.addEventListener('click', () => equalizerModal.classList.add('open'));
  btnCloseEQ.addEventListener('click', () => equalizerModal.classList.remove('open'));
  btnResetEQ.addEventListener('click', () => {
    ['eq60', 'eq250', 'eq1k', 'eq4k', 'eq16k'].forEach((id, idx) => {
      document.getElementById(id).value = 0;
      window.audioEngine.setBandGain(idx, 0);
    });
  });

  ['eq60', 'eq250', 'eq1k', 'eq4k', 'eq16k'].forEach((id, idx) => {
    document.getElementById(id).addEventListener('input', (e) => {
      window.audioEngine.setBandGain(idx, parseFloat(e.target.value));
    });
  });

  btnSleepTimer.addEventListener('click', () => {
    const mins = prompt("Matikan pemutar musik otomatis dalam berapa menit? (Ketik angka, misal 30, atau 0 untuk batalkan):", "30");
    if (mins !== null) {
      const val = parseInt(mins);
      if (state.sleepTimerId) clearTimeout(state.sleepTimerId);
      if (val > 0) {
        state.sleepTimerId = setTimeout(() => {
          window.audioEngine.pause();
          state.isPlaying = false;
          updatePlayPauseButton();
          alert("Senandung: Sleep Timer telah menghentikan musik. Selamat istirahat! 🌙");
        }, val * 60 * 1000);
        btnSleepTimer.classList.add('active');
        alert(`Sleep timer aktif untuk ${val} menit.`);
      } else {
        btnSleepTimer.classList.remove('active');
        alert("Sleep timer dinonaktifkan.");
      }
    }
  });

  // Helpers
  function formatTime(sec) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }
});
