/**
 * SNAKE REACTOR — WebAudio synthesiser.
 * Everything is generated at runtime; no audio files, no network.
 */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.65;
    this.muted = false;
    this.humOn = true;
    this._hum = null;
    this._noiseBuf = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    if (this.muted) this.stopHum();
  }

  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  _noise() {
    if (!this.ctx) return null;
    if (!this._noiseBuf) {
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    return src;
  }

  /** Single enveloped oscillator. */
  tone(freq, dur = 0.12, type = 'square', gain = 0.2, slideTo = null, delay = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const t = this._now() + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  burst(dur = 0.25, gain = 0.25, freq = 900, q = 1, delay = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    const src = this._noise();
    if (!src) return;
    const t = this._now() + delay;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(freq, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t + dur);
    flt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ---- game cues ----

  eat(combo = 1) {
    const step = Math.min(11, combo - 1);
    const base = 420 * Math.pow(2, step / 12);
    this.tone(base, 0.09, 'square', 0.16, base * 1.6);
    this.tone(base * 2, 0.06, 'sine', 0.07, base * 2.4, 0.02);
  }

  surge() {
    this.tone(600, 0.08, 'triangle', 0.16, 1200);
    this.tone(900, 0.1, 'square', 0.12, 1800, 0.06);
    this.tone(1400, 0.14, 'sine', 0.1, 2400, 0.12);
  }

  power(kind) {
    if (kind === 'slowmo') {
      this.tone(760, 0.36, 'sine', 0.18, 200);
      this.tone(380, 0.4, 'triangle', 0.12, 120, 0.03);
    } else if (kind === 'shrink') {
      this.tone(240, 0.22, 'sawtooth', 0.14, 900);
      this.burst(0.18, 0.14, 1400, 2);
    } else {
      this.tone(300, 0.3, 'square', 0.12, 620);
      this.tone(450, 0.3, 'sine', 0.1, 930, 0.05);
    }
  }

  portal() {
    this.tone(320, 0.16, 'sine', 0.14, 1250);
    this.tone(1250, 0.14, 'triangle', 0.08, 380, 0.05);
  }

  levelUp() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => this.tone(f, 0.13, 'square', 0.13, null, i * 0.075));
  }

  shift() {
    this.tone(180, 0.55, 'sawtooth', 0.14, 620);
    this.burst(0.5, 0.16, 500, 0.8);
  }

  die() {
    this.tone(300, 0.5, 'sawtooth', 0.22, 55);
    this.tone(150, 0.7, 'square', 0.16, 40, 0.05);
    this.burst(0.55, 0.22, 700, 0.6);
  }

  ui() { this.tone(680, 0.05, 'square', 0.07, 900); }
  back() { this.tone(420, 0.06, 'square', 0.06, 280); }
  warn() { this.tone(220, 0.1, 'square', 0.09, 180); }

  // ---- ambient reactor hum ----

  startHum() {
    if (this.muted || !this.humOn) return;
    this.init();
    if (!this.ctx || this._hum) return;
    const t = this._now();
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.22;
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.type = 'sine'; b.type = 'triangle';
    a.frequency.value = 55; b.frequency.value = 82.5;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 340;
    a.connect(flt); b.connect(flt); flt.connect(g); g.connect(this.master);
    a.start(t); b.start(t); lfo.start(t);
    this._hum = { a, b, lfo, g };
  }

  stopHum() {
    if (!this._hum || !this.ctx) return;
    const { a, b, lfo, g } = this._hum;
    const t = this._now();
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      a.stop(t + 0.45); b.stop(t + 0.45); lfo.stop(t + 0.45);
    } catch { /* already stopped */ }
    this._hum = null;
  }

  setHum(on) {
    this.humOn = !!on;
    if (!on) this.stopHum();
  }
}
