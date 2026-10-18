// audio.js — WebAudio procedural SFX + music. No asset files.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null; this.sfxBus = null; this.musicBus = null;
    this.vol = { master: 0.8, music: 0.7, sfx: 0.9, muted: false };
    this._musicTimer = null;
    this._musicMode = null;
    this._step = 0;
  }

  _ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this._applyVol();
      return true;
    } catch { return false; }
  }

  setVolumes(v) {
    Object.assign(this.vol, v || {});
    this._applyVol();
  }
  _applyVol() {
    if (!this.ctx) return;
    const m = this.vol.muted ? 0 : this.vol.master;
    this.master.gain.value = m;
    this.sfxBus.gain.value = this.vol.sfx;
    this.musicBus.gain.value = this.vol.music * 0.55;
  }

  // ---------- SFX ----------
  _osc(type, freq, t0, dur, gain, freqEnd, bus) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  _noise(t0, dur, gain, filterFreq, q, bus) {
    const c = this.ctx;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
    src.start(t0);
  }

  sfx(name, opt = {}) {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const p = opt.pitch || 1;
    switch (name) {
      case 'swing':   this._noise(t, 0.12, 0.25, 1400 * p, 2); break;
      case 'hit':     this._noise(t, 0.09, 0.5, 500 * p, 1.5); this._osc('triangle', 180 * p, t, 0.1, 0.4, 60); break;
      case 'crit':    this._noise(t, 0.14, 0.6, 700, 2); this._osc('sawtooth', 300, t, 0.16, 0.35, 80); break;
      case 'hurt':    this._osc('sawtooth', 220, t, 0.18, 0.5, 90); this._noise(t, 0.12, 0.3, 400, 1); break;
      case 'die':     this._osc('sawtooth', 160, t, 0.5, 0.5, 40); this._noise(t, 0.35, 0.4, 300, 1); break;
      case 'enemydie':this._noise(t, 0.2, 0.45, 350 * p, 1.2); this._osc('triangle', 140 * p, t, 0.25, 0.35, 45); break;
      case 'coin':    this._osc('sine', 1046, t, 0.08, 0.3); this._osc('sine', 1318, t + 0.06, 0.12, 0.3); break;
      case 'potion':  this._osc('sine', 420, t, 0.12, 0.3, 700); this._osc('sine', 620, t + 0.1, 0.18, 0.3, 900); break;
      case 'pickup':  this._osc('triangle', 520, t, 0.09, 0.3, 780); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this._osc('triangle', f, t + i * 0.09, 0.25, 0.3)); break;
      case 'chest':   this._osc('square', 200, t, 0.1, 0.2, 300); [660, 880, 1100].forEach((f, i) => this._osc('sine', f, t + 0.1 + i * 0.07, 0.18, 0.22)); break;
      case 'stairs':  this._osc('sine', 300, t, 0.4, 0.3, 120); this._noise(t, 0.4, 0.2, 250, 1); break;
      case 'dodge':   this._noise(t, 0.14, 0.28, 2200, 3); break;
      case 'bolt':    this._osc('sawtooth', 880, t, 0.14, 0.28, 220); break;
      case 'boltHit': this._noise(t, 0.1, 0.4, 900, 2); this._osc('sine', 500, t, 0.12, 0.3, 150); break;
      case 'bossroar':this._osc('sawtooth', 70, t, 0.9, 0.6, 42); this._noise(t, 0.7, 0.5, 180, 0.8); break;
      case 'slam':    this._osc('sine', 90, t, 0.35, 0.7, 30); this._noise(t, 0.25, 0.5, 200, 1); break;
      case 'fountain':[392, 523, 659].forEach((f, i) => this._osc('sine', f, t + i * 0.1, 0.4, 0.25)); break;
      case 'click':   this._osc('square', 700, t, 0.04, 0.12, 500); break;
      case 'error':   this._osc('square', 180, t, 0.15, 0.2, 120); break;
      case 'win':     [523, 659, 784, 1046, 1318].forEach((f, i) => this._osc('triangle', f, t + i * 0.14, 0.5, 0.3)); break;
      case 'arrow':   this._noise(t, 0.1, 0.25, 1800, 3); break;
    }
  }

  // ---------- Music: minor-key step sequencer ----------
  music(mode) {
    // mode: 'menu' | 'dungeon' | 'boss' | null (stop)
    if (mode === this._musicMode) return;
    this._musicMode = mode;
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    if (!mode) return;
    if (!this._ensure()) return;

    const scales = {
      menu:    { root: 110, steps: [0, 3, 5, 7, 10], tempo: 620, padEvery: 16, bass: false },
      dungeon: { root: 82.4, steps: [0, 3, 5, 7, 10, 12], tempo: 480, padEvery: 16, bass: true },
      boss:    { root: 73.4, steps: [0, 1, 5, 6, 10], tempo: 260, padEvery: 8, bass: true },
    };
    const s = scales[mode];
    this._step = 0;
    const tick = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime + 0.02;
      const st = this._step++;
      // pad chord
      if (st % s.padEvery === 0) {
        for (const iv of [0, 3, 7]) {
          const f = s.root * Math.pow(2, (s.steps[0] + iv) / 12);
          this._osc('sawtooth', f, t, s.tempo * s.padEvery / 1000, 0.045, undefined, this.musicBus);
          this._osc('sawtooth', f * 1.005, t, s.tempo * s.padEvery / 1000, 0.045, undefined, this.musicBus);
        }
      }
      // arpeggio note (sparse)
      if (st % 2 === 0 && (mode === 'boss' || Math.random() < 0.7)) {
        const step = s.steps[(st / 2 + (st % 8 === 0 ? 2 : 0)) % s.steps.length | 0];
        const oct = mode === 'boss' && st % 4 === 0 ? 2 : 1;
        this._osc('triangle', s.root * 2 * oct * Math.pow(2, step / 12), t, 0.3, 0.09, undefined, this.musicBus);
      }
      // bass + percussion
      if (s.bass && st % 4 === 0) {
        this._osc('sine', s.root / 2, t, 0.4, mode === 'boss' ? 0.22 : 0.12, s.root / 2.5, this.musicBus);
      }
      if (mode === 'boss') {
        if (st % 4 === 0) { this._osc('sine', 100, t, 0.15, 0.4, 35, this.musicBus); } // kick
        if (st % 4 === 2) this._noise(t, 0.06, 0.12, 6000, 2, this.musicBus);          // hat
      }
    };
    this._musicTimer = setInterval(tick, s.tempo);
    tick();
  }

  stopAll() { this.music(null); }
}
