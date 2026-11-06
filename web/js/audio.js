// Audio Engine: Web Audio API context, 5-band equalizer, offline cache
class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.ctx = null;
    this.source = null;
    this.gainNode = null;
    this.filters = [];
    this.bands = [60, 250, 1000, 4000, 16000];
    this.isInitialized = false;

    // Events
    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) this.onTimeUpdate(this.audio.currentTime, this.audio.duration);
    });

    this.audio.addEventListener('ended', () => {
      if (this.onEnded) this.onEnded();
    });
  }

  initContext() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.source = this.ctx.createMediaElementSource(this.audio);

      // Setup 5-Band Biquad Filters
      let prevNode = this.source;
      this.filters = this.bands.map((freq, idx) => {
        const filter = this.ctx.createBiquadFilter();
        if (idx === 0) filter.type = 'lowshelf';
        else if (idx === this.bands.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';

        filter.frequency.value = freq;
        filter.gain.value = 0;
        prevNode.connect(filter);
        prevNode = filter;
        return filter;
      });

      this.gainNode = this.ctx.createGain();
      prevNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio API init error (fallback to basic audio):", e);
    }
  }

  setBandGain(index, dbValue) {
    if (this.filters[index]) {
      this.filters[index].gain.value = dbValue;
    }
  }

  resetEQ() {
    this.filters.forEach(f => f.gain.value = 0);
  }

  setVolume(val) {
    this.audio.volume = val;
  }

  async loadTrack(songId, filePath) {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    const streamUrl = `/api/stream/${songId}`;
    this.audio.src = streamUrl;
    this.audio.load();
  }

  play() {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  seek(seconds) {
    if (Number.isFinite(seconds)) {
      this.audio.currentTime = seconds;
    }
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  getDuration() {
    return this.audio.duration || 0;
  }

  // Caching lagu ke Cache Storage untuk mode offline PWA di HP
  async saveOffline(song) {
    if (!('caches' in window)) return false;
    const cache = await caches.open('senandung-audio-v1');
    const songUrl = `/api/stream/${song.id}`;
    
    // Simpan data audio
    const res = await fetch(songUrl);
    if (!res.ok) throw new Error("Gagal mengambil file stream audio");
    await cache.put(songUrl, res);

    // Simpan metadata lagu ke localStorage
    const savedOffline = JSON.parse(localStorage.getItem('senandung_offline_songs') || '[]');
    if (!savedOffline.find(s => s.id === song.id)) {
      savedOffline.push(song);
      localStorage.setItem('senandung_offline_songs', JSON.stringify(savedOffline));
    }
    return true;
  }

  getOfflineSongs() {
    return JSON.parse(localStorage.getItem('senandung_offline_songs') || '[]');
  }
}

window.audioEngine = new AudioEngine();
