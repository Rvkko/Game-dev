/* RVKKO procedural audio and voice bank.
 * No external files or services: every cue is seeded by game id + cue name.
 * Games opt in with RVKKOAudio.cue(gameId, cue) and RVKKOAudio.speak(gameId, text).
 */
(function (global) {
  const profiles = {
    'voxhaven': { base: 220, wave: 'triangle', pitch: 0.92, rate: 0.92 },
    'pilot-fuel-tanker-training': { base: 146, wave: 'sine', pitch: 0.82, rate: 0.88 },
    'neon-breach-fps': { base: 330, wave: 'sawtooth', pitch: 1.12, rate: 1.05 },
    'dungeon-rpg': { base: 174, wave: 'square', pitch: 0.86, rate: 0.9 },
    'alpine-rush': { base: 262, wave: 'triangle', pitch: 1.08, rate: 1.02 },
  };
  const fallback = { base: 200, wave: 'triangle', pitch: 1, rate: 1 };
  let ctx = null;
  let master = null;
  const hash = (value) => Array.from(String(value)).reduce((n, ch) => ((n * 33) ^ ch.charCodeAt(0)) >>> 0, 2166136261);
  function init() {
    if (ctx) return ctx;
    const AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    return ctx;
  }
  function cue(gameId, cueName, strength = 1) {
    const audio = init();
    if (!audio || !master) return;
    const profile = profiles[gameId] || fallback;
    const seed = hash(`${gameId}:${cueName}`);
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const duration = cueName === 'ambient' ? 0.8 : 0.12 + (seed % 90) / 1000;
    osc.type = profile.wave;
    osc.frequency.value = profile.base * (0.75 + (seed % 80) / 100);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.01, 0.12 * strength), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
  function speak(gameId, text) {
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) return;
    const profile = profiles[gameId] || fallback;
    const utterance = new SpeechSynthesisUtterance(String(text));
    const voices = global.speechSynthesis.getVoices();
    if (voices.length) utterance.voice = voices[hash(gameId) % voices.length];
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;
    utterance.volume = 0.75;
    global.speechSynthesis.cancel();
    global.speechSynthesis.speak(utterance);
  }
  global.RVKKOAudio = { init, cue, speak, profiles };
})(window);
