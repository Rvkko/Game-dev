// Procedural WebAudio: SFX + generative music for Tower Siege.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null; this.sfxGain = null; this.musGain = null;
    this.musicVol = 0.6; this.sfxVol = 0.8;
    this.intensity = 0; // 0 calm .. 1 combat
    this._musicTimer = null; this._step = 0;
    this._unlocked = false;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxVol; this.sfxGain.connect(this.master);
    this.musGain = this.ctx.createGain(); this.musGain.gain.value = this.musicVol * 0.5; this.musGain.connect(this.master);
  }
  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this._unlocked) { this._unlocked = true; this.startMusic(); }
  }
  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (this.musGain) this.musGain.gain.value = music * 0.5;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
  }
  _now() { return this.ctx ? this.ctx.currentTime : 0; }
  _env(gainNode, t, a, peak, d) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  _osc(type, freq, t, a, peak, d, dest, detune = 0) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    this._env(g, t, a, peak, d);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  _noise(t, a, peak, d, filterFreq, dest, type = 'lowpass') {
    const len = Math.ceil(this.ctx.sampleRate * (a + d + 0.05));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); this._env(g, t, a, peak, d);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t); src.stop(t + a + d + 0.05);
  }
  // ---- SFX ----
  shot(kind) {
    if (!this.ctx) return; const t = this._now();
    if (kind === 'bolt') { this._osc('square', 880, t, 0.005, 0.12, 0.08, null); this._osc('sine', 1400, t, 0.004, 0.08, 0.05); }
    else if (kind === 'cannon') { this._noise(t, 0.005, 0.35, 0.18, 500); this._osc('sine', 90, t, 0.005, 0.3, 0.2); }
    else if (kind === 'tesla') { this._noise(t, 0.003, 0.2, 0.12, 4200, null, 'highpass'); this._osc('sawtooth', 220, t, 0.003, 0.12, 0.1, null, 30); }
    else if (kind === 'sniper') { this._noise(t, 0.002, 0.3, 0.22, 2400); this._osc('sine', 160, t, 0.002, 0.2, 0.15); }
    else if (kind === 'frost') { this._osc('sine', 620, t, 0.02, 0.1, 0.28); this._osc('sine', 930, t + 0.03, 0.02, 0.07, 0.24); }
  }
  explosion(big = false) {
    if (!this.ctx) return; const t = this._now();
    this._noise(t, 0.008, big ? 0.5 : 0.32, big ? 0.6 : 0.3, big ? 320 : 600);
    this._osc('sine', big ? 50 : 70, t, 0.008, big ? 0.5 : 0.3, big ? 0.55 : 0.3);
  }
  hit() { if (!this.ctx) return; const t = this._now(); this._osc('triangle', 300 + Math.random() * 120, t, 0.002, 0.09, 0.06); }
  death() { if (!this.ctx) return; const t = this._now(); this._osc('sawtooth', 240, t, 0.005, 0.12, 0.16); this._osc('sawtooth', 160, t + 0.04, 0.005, 0.1, 0.14); this._noise(t, 0.004, 0.1, 0.12, 900); }
  leak() {
    if (!this.ctx) return; const t = this._now();
    this._osc('square', 340, t, 0.01, 0.22, 0.14); this._osc('square', 240, t + 0.15, 0.01, 0.22, 0.2);
  }
  waveStart() {
    if (!this.ctx) return; const t = this._now();
    [220, 293, 330].forEach((f, i) => this._osc('sawtooth', f, t + i * 0.09, 0.02, 0.16, 0.25));
  }
  bossRoar() {
    if (!this.ctx) return; const t = this._now();
    this._osc('sawtooth', 55, t, 0.05, 0.4, 0.9, null, 15); this._osc('sawtooth', 82, t, 0.05, 0.3, 0.8, null, -20);
    this._noise(t, 0.05, 0.2, 0.8, 250);
  }
  place() { if (!this.ctx) return; const t = this._now(); this._osc('sine', 320, t, 0.005, 0.16, 0.09); this._osc('sine', 480, t + 0.06, 0.005, 0.14, 0.1); this._noise(t, 0.004, 0.1, 0.08, 1200); }
  upgrade() { if (!this.ctx) return; const t = this._now(); [420, 530, 640, 840].forEach((f, i) => this._osc('sine', f, t + i * 0.06, 0.01, 0.13, 0.14)); }
  sell() { if (!this.ctx) return; const t = this._now(); [700, 520, 390].forEach((f, i) => this._osc('sine', f, t + i * 0.06, 0.01, 0.12, 0.12)); }
  coin() { if (!this.ctx) return; const t = this._now(); this._osc('sine', 1100, t, 0.002, 0.06, 0.07); this._osc('sine', 1500, t + 0.04, 0.002, 0.05, 0.09); }
  click() { if (!this.ctx) return; const t = this._now(); this._osc('sine', 640, t, 0.002, 0.08, 0.05); }
  error() { if (!this.ctx) return; const t = this._now(); this._osc('square', 150, t, 0.005, 0.12, 0.14); }
  achievement() { if (!this.ctx) return; const t = this._now(); [523, 659, 784, 1046].forEach((f, i) => this._osc('sine', f, t + i * 0.09, 0.01, 0.15, 0.3)); }
  victory() {
    if (!this.ctx) return; const t = this._now();
    [[523,0],[659,.14],[784,.28],[1046,.42],[784,.6],[1046,.72]].forEach(([f, d]) => this._osc('triangle', f, t + d, 0.02, 0.2, 0.35));
  }
  defeat() {
    if (!this.ctx) return; const t = this._now();
    [[330,0],[311,.25],[294,.5],[262,.8]].forEach(([f, d]) => { this._osc('sawtooth', f, t + d, 0.03, 0.18, 0.45); this._osc('sawtooth', f / 2, t + d, 0.03, 0.14, 0.45); });
  }
  // ---- Music: generative loop, ramps with intensity ----
  startMusic() {
    if (!this.ctx || this._musicTimer) return;
    const chords = [ // Am, F, C, G (freqs of roots)
      [110, 220, 261.6, 329.6], [87.3, 174.6, 261.6, 349.2],
      [130.8, 261.6, 329.6, 392], [98, 196, 293.7, 392],
    ];
    const scale = [220, 246.9, 261.6, 293.7, 329.6, 392, 440, 493.9, 523.3];
    const stepDur = 0.22;
    let nextTime = this._now() + 0.1;
    const tick = () => {
      if (!this.ctx) return;
      while (nextTime < this._now() + 0.5) {
        const s = this._step++;
        const bar = Math.floor(s / 16) % 4;
        const chord = chords[bar];
        const t = nextTime;
        if (s % 16 === 0) { // pad
          chord.slice(1).forEach(f => this._osc('triangle', f, t, 0.6, 0.05 + this.intensity * 0.02, stepDur * 14, this.musGain));
        }
        if (s % 4 === 0) this._osc('sine', chord[0], t, 0.02, 0.12, stepDur * 2.6, this.musGain); // bass
        if (this.intensity > 0.15 && s % 2 === 0) { // arp
          const n = scale[(s * 3 + bar * 2) % scale.length];
          this._osc('square', n, t, 0.01, 0.028 + this.intensity * 0.035, stepDur * 0.9, this.musGain);
        }
        if (this.intensity > 0.5) { // drive perc
          if (s % 4 === 0) this._noise(t, 0.002, 0.05, 0.05, 300, this.musGain);
          if (s % 4 === 2) this._noise(t, 0.002, 0.035, 0.04, 5000, this.musGain, 'highpass');
        }
        nextTime += stepDur;
      }
    };
    this._musicTimer = setInterval(tick, 120);
  }
}
