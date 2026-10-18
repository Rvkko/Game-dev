/* WebAudio: procedural ambient pad + one-shot SFX. Respects settings volumes. */
export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.musicGain = null; this.sfxGain = null;
    this.vol = { master: 0.8, music: 0.5, sfx: 1.0, muted: false };
    this._musicNodes = []; this._started = false;
  }
  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master); this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this._applyVol();
  }
  resume() { this._ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolumes(v) { Object.assign(this.vol, v || {}); this._applyVol(); }
  _applyVol() {
    if (!this.ctx) return;
    const m = this.vol.muted ? 0 : this.vol.master;
    this.master.gain.value = m;
    this.musicGain.gain.value = this.vol.music;
    this.sfxGain.gain.value = this.vol.sfx;
  }
  startMusic() {
    this._ensure(); if (!this.ctx || this._started) return; this._started = true;
    // gentle evolving drone: two detuned oscillators + slow LFO on a lowpass
    const now = this.ctx.currentTime;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 600; filt.Q.value = 3;
    filt.connect(this.musicGain);
    const lfo = this.ctx.createOscillator(); const lfoG = this.ctx.createGain();
    lfo.frequency.value = 0.05; lfoG.gain.value = 260; lfo.connect(lfoG); lfoG.connect(filt.frequency); lfo.start();
    const base = [110, 164.81, 220]; // A2, E3, A3
    for (const f of base) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const d = this.ctx.createOscillator(); d.type = 'sine'; d.frequency.value = f * 1.005;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      o.connect(g); d.connect(g); g.connect(filt); o.start(now); d.start(now);
      this._musicNodes.push(o, d);
    }
    this._musicNodes.push(lfo);
  }
  stopMusic() {
    for (const n of this._musicNodes) { try { n.stop(); } catch { } }
    this._musicNodes = []; this._started = false;
  }
  // ---- SFX ----
  _blip(freq, dur, type = 'sine', gain = 0.3, slideTo = null) {
    this._ensure(); if (!this.ctx || this.vol.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(dur, gain = 0.3, lp = 2000) {
    this._ensure(); if (!this.ctx || this.vol.muted) return;
    const t = this.ctx.currentTime; const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t);
  }
  sfx(name) {
    switch (name) {
      case 'birth': this._blip(660, 0.25, 'sine', 0.25, 990); break;
      case 'death': this._blip(220, 0.5, 'sine', 0.25, 90); break;
      case 'build': this._blip(300, 0.12, 'square', 0.2); setTimeout(() => this._blip(440, 0.1, 'square', 0.18), 90); break;
      case 'tech': this._blip(523, 0.15, 'triangle', 0.25, 784); setTimeout(() => this._blip(784, 0.2, 'triangle', 0.22, 1046), 120); break;
      case 'union': this._blip(494, 0.2, 'sine', 0.2, 740); break;
      case 'found': this._blip(392, 0.3, 'triangle', 0.3, 587); break;
      case 'bless': this._blip(880, 0.4, 'sine', 0.3, 1320); break;
      case 'curse': this._blip(180, 0.5, 'sawtooth', 0.28, 70); break;
      case 'disaster': this._noise(0.8, 0.4, 1200); this._blip(120, 0.6, 'sawtooth', 0.25, 50); break;
      case 'smite': this._noise(0.3, 0.5, 6000); this._blip(80, 0.4, 'square', 0.3, 40); break;
      case 'food': this._blip(700, 0.15, 'sine', 0.22, 900); break;
      case 'wood': case 'stone': this._blip(260, 0.12, 'square', 0.18); break;
      case 'click': this._blip(440, 0.05, 'square', 0.12); break;
      case 'ach': this._blip(659, 0.12, 'triangle', 0.3); setTimeout(() => this._blip(880, 0.12, 'triangle', 0.3), 110); setTimeout(() => this._blip(1174, 0.2, 'triangle', 0.3), 230); break;
    }
  }
}
