// WebAudio SFX + ambient music for Xeno Frontier. Procedural, no assets.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.vol = { master: 0.8, music: 0.55, sfx: 1.0, muted: false };
    this.musicOn = false;
    this._musicTimer = 0;
    this._step = 0;
  }
  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this._applyVol();
  }
  resume() { this._ensure(); if (this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolumes(v) { Object.assign(this.vol, v); if (this.ctx) this._applyVol(); }
  _applyVol() {
    const m = this.vol.muted ? 0 : this.vol.master;
    this.master.gain.value = m;
    this.musicGain.gain.value = this.vol.music;
    this.sfxGain.gain.value = this.vol.sfx;
  }
  _tone(freq, dur, type = 'sine', gain = 0.3, dest = null, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(dur, gain = 0.3, hp = 400) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t);
  }
  sfx(name) {
    if (!this.ctx || this.vol.muted) return;
    switch (name) {
      case 'click': this._tone(520, 0.05, 'square', 0.12); break;
      case 'place': this._tone(300, 0.12, 'triangle', 0.25, null, 120); this._noise(0.08, 0.08); break;
      case 'build': this._tone(440, 0.1, 'triangle', 0.2); this._tone(660, 0.12, 'sine', 0.15); break;
      case 'research': this._tone(700, 0.14, 'sine', 0.2, null, 200); this._tone(1050, 0.18, 'sine', 0.14); break;
      case 'birth': this._tone(600, 0.12, 'sine', 0.2, null, 300); this._tone(900, 0.16, 'triangle', 0.14); break;
      case 'death': this._tone(220, 0.4, 'sawtooth', 0.25, null, -140); this._noise(0.3, 0.12, 200); break;
      case 'shoot': this._tone(880, 0.06, 'square', 0.12, null, -400); this._noise(0.05, 0.06, 1200); break;
      case 'hit': this._noise(0.12, 0.18, 300); this._tone(160, 0.14, 'sawtooth', 0.18); break;
      case 'alarm': this._tone(760, 0.18, 'square', 0.2); setTimeout(() => this._tone(600, 0.18, 'square', 0.2), 180); break;
      case 'storm': this._noise(0.9, 0.16, 120); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 'triangle', 0.25), i * 130)); break;
      case 'lose': [400, 330, 262, 196].forEach((f, i) => setTimeout(() => this._tone(f, 0.35, 'sawtooth', 0.22), i * 160)); break;
      case 'ach': this._tone(784, 0.12, 'triangle', 0.22); setTimeout(() => this._tone(1175, 0.16, 'triangle', 0.2), 110); break;
      case 'eat': this._tone(340, 0.07, 'sine', 0.12); break;
    }
  }
  setMusic(on) { this._ensure(); this.musicOn = on; }
  // ambient generative pad + slow bass, called each frame
  update(dt) {
    if (!this.ctx || !this.musicOn || this.vol.muted) return;
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;
    this._musicTimer = 2.0;
    const scale = [55, 82.41, 98, 110, 146.83, 164.81];
    const root = scale[this._step % scale.length];
    this._step++;
    // pad chord
    [root, root * 1.5, root * 2].forEach((f, i) => {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = i === 0 ? 'sine' : 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 2.3);
    });
  }
}
