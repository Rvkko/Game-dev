export class GameAudio {
  private context: AudioContext | null = null;
  private ambient: OscillatorNode[] = [];
  private master: GainNode | null = null;

  start(volume: number) {
    if (this.context) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = volume * 0.035;
    this.master.connect(this.context.destination);
    for (const frequency of [110, 164.81, 220]) {
      const oscillator = this.context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(this.master);
      oscillator.start();
      this.ambient.push(oscillator);
    }
  }

  blip(frequency: number, volume: number, duration = 0.08) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    gain.gain.setValueAtTime(volume * 0.08, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }

  stop() {
    for (const oscillator of this.ambient) oscillator.stop();
    this.context?.close();
    this.context = null;
    this.ambient = [];
    this.master = null;
  }
}
