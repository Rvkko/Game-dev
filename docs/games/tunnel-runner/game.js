/* TUNNEL RUNNER 3D — three.js rendering, cannon-es ragdoll on crash.
   Endless procedural neon tunnel runner. Empire SDK integrated. */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EmpireClient } from '../../shared/empire-sdk.js';

// ============================== utils ==============================
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function todayKey() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
const $ = (id) => document.getElementById(id);

// ============================== audio ==============================
const AUDIO = {
  ctx: null, master: null, sfxGain: null, musGain: null,
  sfxOn: true, musicOn: true, musicTimer: null, step: 0,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.7; this.sfxGain.connect(this.master);
      this.musGain = this.ctx.createGain(); this.musGain.gain.value = 0.2; this.musGain.connect(this.master);
    } catch { /* no audio */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, dur, type = 'square', vol = 0.3, slide = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.4, freq = 800) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t);
  },
  jump() { this.tone(420, 0.14, 'square', 0.22, 260); },
  slide() { this.tone(200, 0.14, 'sawtooth', 0.2, -120); },
  coin() { this.tone(880, 0.07, 'square', 0.18, 380); },
  orb() { this.tone(660, 0.09, 'triangle', 0.2, 220); setTimeout(() => this.tone(880, 0.09, 'triangle', 0.18), 60); },
  fire() { this.tone(900, 0.05, 'square', 0.16, -500); },
  destroy() { this.noise(0.15, 0.3, 1200); this.tone(200, 0.1, 'sawtooth', 0.2, -100); },
  shockwave() { this.noise(0.3, 0.35, 500); this.tone(120, 0.3, 'sine', 0.3, 200); },
  overdrive() { [440, 660, 880, 1100].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.2), i * 60)); },
  crash() { this.noise(0.5, 0.5, 350); this.tone(90, 0.5, 'sawtooth', 0.4, -60); },
  hit() { this.tone(180, 0.15, 'sawtooth', 0.28, -80); },
  ach() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.22), i * 90)); },
  menu() { this.tone(500, 0.06, 'square', 0.15, 140); },
  win() { [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.24), i * 120)); },
  musicNote(freq, dur, vol) {
    if (!this.ctx || !this.musicOn) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.musGain); o.start(t); o.stop(t + dur + 0.02);
  },
  startMusic() {
    if (this.musicTimer) return;
    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    this.musicTimer = setInterval(() => {
      if (!this.musicOn) return;
      this.step++;
      const n = scale[Math.floor(Math.abs(Math.sin(this.step * 0.7)) * scale.length) % scale.length];
      this.musicNote(n, 0.35, 0.05);
      if (this.step % 4 === 0) this.musicNote(n / 2, 0.5, 0.04);
    }, 260);
  },
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } },
};

// ============================== save / SDK ==============================
const empire = new EmpireClient({ gameId: 'tunnel-runner', saveVersion: 1 });
const SKINS = [
  { id: 'cyan', name: 'Cyan Drift', cost: 0, color: 0x37f0ff, emissive: 0x0e5a66 },
  { id: 'magenta', name: 'Magenta Surge', cost: 200, color: 0xff3ec8, emissive: 0x66123f },
  { id: 'gold', name: 'Gold Rush', cost: 500, color: 0xffd24a, emissive: 0x6b5312 },
  { id: 'emerald', name: 'Emerald Flux', cost: 1000, color: 0x5aff8f, emissive: 0x175a2c },
  { id: 'violet', name: 'Violet Storm', cost: 2000, color: 0xa15aff, emissive: 0x3a1766 },
  { id: 'chrome', name: 'Chrome Ghost', cost: 4000, color: 0xe8eefc, emissive: 0x555a66 },
];
const ACHIEVEMENTS = [
  { id: 'first-run', title: 'First Contact', desc: 'Finish your first run' },
  { id: 'distance-500', title: 'Half-K Club', desc: 'Reach 500m in a single run' },
  { id: 'distance-2000', title: 'Long Hauler', desc: 'Reach 2000m in a single run' },
  { id: 'distance-5000', title: 'Tunnel Legend', desc: 'Reach 5000m in a single run' },
  { id: 'coin-collector', title: 'Coin Collector', desc: 'Collect 100 coins lifetime' },
  { id: 'coin-hoarder', title: 'Coin Hoarder', desc: 'Collect 500 coins lifetime' },
  { id: 'crate-smasher', title: 'Crate Smasher', desc: 'Destroy 25 crates with the blaster' },
  { id: 'overdrive-master', title: 'Overdrive Master', desc: 'Trigger Overdrive 20 times' },
  { id: 'daily-driver', title: 'Daily Driver', desc: 'Reach 300m in a daily seed challenge' },
  { id: 'skin-collector', title: 'Skin Collector', desc: 'Unlock 3 ship skins' },
  { id: 'close-call', title: 'Close Call', desc: 'Narrowly dodge 50 obstacles' },
  { id: 'hardcore', title: 'Hardcore', desc: 'Reach 1000m on Hard difficulty', hidden: true },
];
const save = {
  coins: 0, lifetimeCoins: 0, cratesDestroyed: 0, overdriveUses: 0, nearMisses: 0,
  bestDistance: 0, dailyBestDistance: 0, ownedSkins: ['cyan'], equippedSkin: 'cyan',
  achDone: {}, runsCompleted: 0,
};
function mergeSave(blob) { if (blob) Object.assign(save, blob); if (!save.ownedSkins.includes('cyan')) save.ownedSkins.push('cyan'); }
async function persist() {
  await empire.saveState('main', { ...save }, { label: 'Tunnel Runner', progress: save.bestDistance });
}
async function unlock(id) {
  if (save.achDone[id]) return;
  save.achDone[id] = true;
  AUDIO.ach();
  toast(`Achievement: ${ACHIEVEMENTS.find(a => a.id === id)?.title || id}`);
  try { await empire.unlockAchievement(id, 1); } catch { /* ignore */ }
  persist();
}

let settings = null;

// ============================== three.js scene ==============================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060b, 0.028);
scene.background = new THREE.Color(0x05060b);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 400);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.AmbientLight(0x3a4570, 0.55));
const hemi = new THREE.HemisphereLight(0x4488ff, 0x110022, 0.5);
scene.add(hemi);
const shipLight = new THREE.PointLight(0x8be8ff, 2.2, 22, 2);
scene.add(shipLight);

// starfield background (distant points, purely aesthetic)
{
  const starGeo = new THREE.BufferGeometry();
  const n = 800; const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rand(80, 150), th = rand(0, Math.PI * 2), ph = rand(-1, 1) * Math.PI * 0.4;
    pos[i * 3] = Math.cos(th) * r; pos[i * 3 + 1] = Math.sin(ph) * r * 0.5 + 10; pos[i * 3 + 2] = Math.sin(th) * r - 200;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0x8fa0ff, size: 0.6, transparent: true, opacity: 0.5 });
  scene.add(new THREE.Points(starGeo, starMat));
}

// ============================== path (procedural tunnel curve) ==============================
const TUNNEL_R = 6.2;
const MAXLEN = 24000;
// Seed a stable preview path so the menu can render before the first run.
let pathCoef = null; // replaced per-run by startRun()

function genPathCoef(seed) {
  const rng = mulberry32(seed);
  const mk = () => ({ a1: (2.5 + rng() * 2.5) * (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 0.6), f1: 0.0035 + rng() * 0.003, p1: rng() * 6.28,
                      a2: (1 + rng() * 1.4) * (rng() < 0.5 ? -1 : 1), f2: 0.011 + rng() * 0.006, p2: rng() * 6.28 });
  return { x: mk(), y: mk() };
}
function axisVal(ax, s) { return ax.a1 * Math.sin(s * ax.f1 + ax.p1) + ax.a2 * Math.sin(s * ax.f2 + ax.p2); }
function pathX(s) { return axisVal(pathCoef.x, s); }
function pathY(s) { return axisVal(pathCoef.y, s) * 0.6 + 2; } // keep tunnel mostly above z axis, gentle vertical wander
function pathPoint(s, out) { out.set(pathX(s), pathY(s), -s); return out; }

const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
function getFrame(s, outPos, outFwd, outRight, outUp) {
  pathPoint(s, outPos);
  const h = 0.6;
  pathPoint(s + h, _p1); pathPoint(s - h, _p2);
  outFwd.copy(_p1).sub(_p2).normalize(); // points in direction of travel (increasing s)
  outRight.crossVectors(outFwd, WORLD_UP);
  if (outRight.lengthSq() < 1e-6) outRight.set(1, 0, 0); else outRight.normalize();
  outUp.crossVectors(outRight, outFwd).normalize();
}

class TunnelCurve extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) { return pathPoint(t * MAXLEN, target); }
}

let tunnelMesh = null, tunnelCurve = null;
function buildTunnel() {
  if (tunnelMesh) { scene.remove(tunnelMesh); tunnelMesh.geometry.dispose(); tunnelMesh.material.dispose(); }
  tunnelCurve = new TunnelCurve();
  const tubularSeg = 2200, radialSeg = 12;
  const geo = new THREE.TubeGeometry(tunnelCurve, tubularSeg, TUNNEL_R, radialSeg, false);
  geo.scale(1, 1, 1);
  // build a neon grid canvas texture
  const cnv = document.createElement('canvas'); cnv.width = 256; cnv.height = 256;
  const cx = cnv.getContext('2d');
  cx.fillStyle = '#050812'; cx.fillRect(0, 0, 256, 256);
  cx.strokeStyle = 'rgba(55,240,255,0.55)'; cx.lineWidth = 3;
  for (let i = 0; i <= 8; i++) { cx.beginPath(); cx.moveTo(i * 32, 0); cx.lineTo(i * 32, 256); cx.stroke(); }
  cx.strokeStyle = 'rgba(255,62,200,0.35)';
  for (let i = 0; i <= 4; i++) { cx.beginPath(); cx.moveTo(0, i * 64); cx.lineTo(256, i * 64); cx.stroke(); }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, Math.floor(MAXLEN / 14));
  const mat = new THREE.MeshStandardMaterial({
    map: tex, side: THREE.BackSide, emissive: 0x0c2530, emissiveIntensity: 0.9,
    roughness: 0.5, metalness: 0.2, fog: true,
  });
  tunnelMesh = new THREE.Mesh(geo, mat);
  scene.add(tunnelMesh);
}

// ============================== ship (player) ==============================
function buildShipModel(skin) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: skin.color, emissive: skin.emissive, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 8), bodyMat);
  nose.rotation.x = Math.PI / 2; nose.position.z = -0.55;
  g.add(nose);
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.7, 4, 8), bodyMat);
  hull.rotation.x = Math.PI / 2;
  g.add(hull);
  const wingGeo = new THREE.BoxGeometry(1.3, 0.06, 0.5);
  const wingMat = new THREE.MeshStandardMaterial({ color: skin.color, emissive: skin.emissive, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.4 });
  const wingL = new THREE.Mesh(wingGeo, wingMat); wingL.position.set(-0.55, 0, 0.25); g.add(wingL);
  const wingR = wingL.clone(); wingR.position.x = 0.55; g.add(wingR);
  const engineMat = new THREE.MeshBasicMaterial({ color: skin.color });
  const eng = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), engineMat);
  eng.position.z = 0.62; eng.rotation.y = Math.PI;
  g.add(eng);
  g.userData.color = skin.color;
  return g;
}
let ship = null, shipSkinId = 'cyan';
let profileShipAsset = null;
let profilePhysicsRadius = 0.9;
window.__tunnelAssetStatus = { loaded: false, attached: false, physics: false, error: '' };
async function loadProfileShipAsset() {
  const Loader = window.THREE?.GLTFLoader;
  if (!Loader) { window.__tunnelAssetStatus.error = 'GLTFLoader unavailable'; return; }
  try {
    const [physics, gltf] = await Promise.all([
      fetch('../../assets/blender-kits/tunnel-runner/physics.json').then((r) => r.ok ? r.json() : null),
      new Promise((resolve, reject) => new Loader().load('../../assets/blender-kits/tunnel-runner/tunnel-runner-kit.glb', resolve, undefined, reject)),
    ]);
    const source = gltf.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || gltf.scene.getObjectByName('PLAYER_BODY');
    if (!source) throw new Error('profile tunnel ship asset missing');
    profileShipAsset = source.clone(true);
    profileShipAsset.name = 'BLENDER_TUNNEL_SHIP';
    profileShipAsset.scale.setScalar(1.3);
    profileShipAsset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
    profilePhysicsRadius = physics?.playerCollider?.radius || profilePhysicsRadius;
    window.__tunnelAssetStatus.loaded = true;
    window.__tunnelAssetStatus.physics = !!physics?.playerCollider;
  } catch (error) { window.__tunnelAssetStatus.error = String(error?.message || error); }
}
pathCoef = genPathCoef(0x51f15e);
function setShip(skinId) {
  const skin = SKINS.find(s => s.id === skinId) || SKINS[0];
  if (ship) scene.remove(ship);
  ship = buildShipModel(skin);
  if (profileShipAsset) {
    ship.children.forEach((child) => { child.visible = false; });
    if (profileShipAsset.parent) profileShipAsset.parent.remove(profileShipAsset);
    ship.add(profileShipAsset);
    window.__tunnelAssetStatus.attached = true;
  }
  scene.add(ship);
  shipSkinId = skinId;
}

// engine trail particles
const TRAIL_MAX = 260;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(TRAIL_MAX * 3);
const trailCol = new Float32Array(TRAIL_MAX * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
const trailMat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
const trailPoints = new THREE.Points(trailGeo, trailMat);
scene.add(trailPoints);
const trail = []; // {pos, life, maxLife, color}
function spawnTrail(pos, color) {
  trail.push({ pos: pos.clone(), life: 0.5, maxLife: 0.5, color });
  if (trail.length > TRAIL_MAX) trail.shift();
}
function updateTrail(dt) {
  for (let i = trail.length - 1; i >= 0; i--) { trail[i].life -= dt; if (trail[i].life <= 0) trail.splice(i, 1); }
  for (let i = 0; i < TRAIL_MAX; i++) {
    if (i < trail.length) {
      const p = trail[i];
      trailPos[i * 3] = p.pos.x; trailPos[i * 3 + 1] = p.pos.y; trailPos[i * 3 + 2] = p.pos.z;
      const a = p.life / p.maxLife;
      trailCol[i * 3] = ((p.color >> 16) & 255) / 255 * a;
      trailCol[i * 3 + 1] = ((p.color >> 8) & 255) / 255 * a;
      trailCol[i * 3 + 2] = (p.color & 255) / 255 * a;
    } else { trailPos[i * 3 + 1] = -9999; }
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
}

// generic burst particles (explosions / coin sparkle)
const burstGeo = new THREE.BufferGeometry();
const BURST_MAX = 400;
const burstPos = new Float32Array(BURST_MAX * 3);
const burstCol = new Float32Array(BURST_MAX * 3);
burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
burstGeo.setAttribute('color', new THREE.BufferAttribute(burstCol, 3));
const burstMat = new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 1 });
const burstPoints = new THREE.Points(burstGeo, burstMat);
scene.add(burstPoints);
let bursts = [];
function spawnBurst(pos, color, count = 18, speed = 6) {
  for (let i = 0; i < count && bursts.length < BURST_MAX; i++) {
    bursts.push({
      pos: pos.clone(), vel: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.4, speed)),
      life: rand(0.4, 0.9), maxLife: 0.9, color,
    });
  }
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt; if (b.life <= 0) { bursts.splice(i, 1); continue; }
    b.vel.y -= 4 * dt;
    b.pos.addScaledVector(b.vel, dt);
  }
  for (let i = 0; i < BURST_MAX; i++) {
    if (i < bursts.length) {
      const b = bursts[i];
      burstPos[i * 3] = b.pos.x; burstPos[i * 3 + 1] = b.pos.y; burstPos[i * 3 + 2] = b.pos.z;
      const a = b.life / b.maxLife;
      burstCol[i * 3] = ((b.color >> 16) & 255) / 255 * a;
      burstCol[i * 3 + 1] = ((b.color >> 8) & 255) / 255 * a;
      burstCol[i * 3 + 2] = (b.color & 255) / 255 * a;
    } else { burstPos[i * 3 + 1] = -9999; }
  }
  burstGeo.attributes.position.needsUpdate = true;
  burstGeo.attributes.color.needsUpdate = true;
}

// ============================== input ==============================
const keys = new Set();
let mouseYaw = 0, mousePitch = 0;
let pointerLocked = false;
let lmbDown = false, rmbDown = false;
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Escape') { onEscape(); }
  if (e.code === 'KeyV') toggleCamera();
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => {
  AUDIO.init(); AUDIO.resume();
  if (state.mode === 'playing' && !pointerLocked) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; $('lockHint').style.display = (state.mode === 'playing' && !pointerLocked) ? 'block' : 'none'; });
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  const sens = (settings?.controls?.mouseSensitivity ?? 1) * 0.0022;
  mouseYaw -= e.movementX * sens;
  mousePitch += -e.movementY * sens; // non-inverted: mouse up -> look up
  mousePitch = clamp(mousePitch, -0.9, 0.9);
  mouseYaw = clamp(mouseYaw, -1.1, 1.1);
});
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) lmbDown = true; if (e.button === 2) rmbDown = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) lmbDown = false; if (e.button === 2) rmbDown = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let gpJumpPrev = false, gpSlidePrev = false, gpOverPrev = false, gpStartPrev = false;
function pollGamepad(dt) {
  const gp = navigator.getGamepads?.()[0];
  if (!gp) return { strafe: 0, look: [0, 0] };
  const dz = (v) => Math.abs(v) < 0.15 ? 0 : v;
  const strafe = dz(gp.axes[0] || 0);
  const lookX = dz(gp.axes[2] || 0), lookY = dz(gp.axes[3] || 0);
  mouseYaw = clamp(mouseYaw - lookX * dt * 2.2, -1.1, 1.1);
  mousePitch = clamp(mousePitch + -lookY * dt * 2.2, -0.9, 0.9);
  const jump = gp.buttons[0]?.pressed; // A
  const slide = gp.buttons[2]?.pressed; // X
  const over = gp.buttons[3]?.pressed; // Y
  const start = gp.buttons[9]?.pressed;
  if (jump && !gpJumpPrev) doJump();
  if (over && !gpOverPrev) doOverdrive();
  if (start && !gpStartPrev) onEscape();
  gpJumpPrev = jump; gpSlidePrev = slide; gpOverPrev = over; gpStartPrev = start;
  if (gp.buttons[7]?.pressed) doFire();      // RT — blaster
  if (gp.buttons[6]?.pressed) doShockwave(); // LT — shockwave
  return { strafe, slide };
}

// ============================== game state ==============================
const DIFF = {
  easy: { speed: 13, ramp: 2400, cap: 2.4, gapMul: 1.4, label: 'EASY' },
  normal: { speed: 17, ramp: 2000, cap: 3.0, gapMul: 1.0, label: 'NORMAL' },
  hard: { speed: 21, ramp: 1700, cap: 3.6, gapMul: 0.78, label: 'HARD' },
};
const state = {
  mode: 'menu', // menu|playing|paused|crashing|gameover
  difficulty: 'normal', daily: false, seed: 0,
  s: 0, prevS: 0, speed: 0, camMode: 0, // 0 = 3rd person, 1 = 1st person
  player: { x: 0, jumping: false, jumpT: 0, sliding: false, slideT: 0, invuln: 0 },
  meter: 0, shockCd: 0, fireCd: 0,
  runCoins: 0, runNearMiss: 0, hitThisRun: false,
  spawnCursor: 40, rng: null,
  obstacles: [], collectibles: [],
  shakeT: 0, timeScale: 1, slowmoT: 0,
  freezeInputForCrash: false,
};

// ============================== obstacle / collectible spawning ==============================
const OBST_TYPES = ['barrierLow', 'barrierHigh', 'wallGap', 'crate', 'spinner'];
function spawnDescriptor(rng, s, diff) {
  const roll = rng();
  let type;
  if (roll < 0.24) type = 'barrierLow';
  else if (roll < 0.46) type = 'barrierHigh';
  else if (roll < 0.68) type = 'wallGap';
  else if (roll < 0.88) type = 'crate';
  else type = 'spinner';
  const maxX = 3.6;
  const sr = (a, b) => a + rng() * (b - a); // seeded, so daily runs are reproducible
  const d = { s, type, hit: false, meshMade: false, mesh: null, x: 0, halfW: 1.1, gapX: 0, gapHalf: 1.3 };
  if (type === 'wallGap') { d.gapX = sr(-maxX * 0.6, maxX * 0.6); d.gapHalf = 1.3; }
  else { d.x = sr(-maxX, maxX); d.halfW = type === 'crate' ? 0.8 : sr(1.4, 2.6); }
  return d;
}
function ensureSpawns() {
  if (!state.rng) return;
  const diff = DIFF[state.difficulty];
  const lookahead = 260;
  const sr = (a, b) => a + state.rng() * (b - a); // seeded, so daily runs are reproducible
  while (state.spawnCursor < state.s + lookahead) {
    const densityBoost = clamp(state.s / 6000, 0, 1);
    const gap = (sr(16, 26) - densityBoost * 6) * diff.gapMul;
    state.spawnCursor += Math.max(9, gap);
    if (state.spawnCursor > MAXLEN - 40) break;
    state.obstacles.push(spawnDescriptor(state.rng, state.spawnCursor, diff));
    // occasional collectible cluster between obstacles
    if (state.rng() < 0.7) {
      const cs = state.spawnCursor - sr(4, Math.max(5, gap - 4));
      const kind = state.rng() < 0.12 ? 'energy' : (state.rng() < 0.08 ? 'shield' : 'coin');
      const cx = sr(-3, 3);
      const arcCount = kind === 'coin' ? Math.floor(sr(3, 7)) : 1;
      for (let i = 0; i < arcCount; i++) {
        state.collectibles.push({ s: cs + i * 1.3, x: cx + Math.sin(i * 0.6) * 0.6, kind, taken: false, mesh: null });
      }
    }
  }
}

const obstMeshCache = { barrierLow: null, barrierHigh: null, wallGap: null, crate: null, spinner: null };
function makeObstacleMesh(d) {
  let mesh;
  if (d.type === 'barrierLow') {
    const geo = new THREE.BoxGeometry(d.halfW * 2, 1.1, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5a3e, emissive: 0x661a0c, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.4 });
    mesh = new THREE.Mesh(geo, mat); mesh.position.y = -TUNNEL_R + 1.2;
  } else if (d.type === 'barrierHigh') {
    const geo = new THREE.BoxGeometry(d.halfW * 2, 0.5, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x665012, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.4 });
    mesh = new THREE.Mesh(geo, mat); mesh.position.y = 1.0;
  } else if (d.type === 'wallGap') {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a3eff, emissive: 0x33116b, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide });
    const fullW = TUNNEL_R * 2.1;
    const leftW = (d.gapX - d.gapHalf) - (-fullW / 2);
    const rightW = (fullW / 2) - (d.gapX + d.gapHalf);
    if (leftW > 0.2) { const l = new THREE.Mesh(new THREE.BoxGeometry(leftW, TUNNEL_R * 1.6, 0.4), mat); l.position.set(-fullW / 2 + leftW / 2, 0, 0); g.add(l); }
    if (rightW > 0.2) { const r = new THREE.Mesh(new THREE.BoxGeometry(rightW, TUNNEL_R * 1.6, 0.4), mat); r.position.set(fullW / 2 - rightW / 2, 0, 0); g.add(r); }
    mesh = g;
  } else if (d.type === 'crate') {
    const geo = new THREE.BoxGeometry(d.halfW * 2, d.halfW * 2, d.halfW * 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3ec6ff, emissive: 0x0e3a4d, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.3, wireframe: false });
    mesh = new THREE.Mesh(geo, mat); mesh.position.y = -TUNNEL_R + 1.6;
  } else { // spinner
    const g = new THREE.Group();
    const barMat = new THREE.MeshStandardMaterial({ color: 0xff3ec8, emissive: 0x66123f, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.3 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(d.halfW * 2, 0.3, 0.3), barMat);
    g.add(bar); g.userData.spin = true; mesh = g;
  }
  return mesh;
}
function makeCollectibleMesh(kind) {
  if (kind === 'coin') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffd24a, emissiveIntensity: 1.1, metalness: 0.8, roughness: 0.2 });
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 16), mat);
    return m;
  } else if (kind === 'energy') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x37f0ff, emissive: 0x37f0ff, emissiveIntensity: 1.3, metalness: 0.3, roughness: 0.2 });
    return new THREE.Mesh(new THREE.OctahedronGeometry(0.34), mat);
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5aff8f, emissive: 0x5aff8f, emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.2 });
    return new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), mat);
  }
}

const _fp = new THREE.Vector3(), _fr = new THREE.Vector3(), _fu = new THREE.Vector3(), _ff = new THREE.Vector3();
function placeAtFrame(obj3d, s, x, y) {
  getFrame(s, _fp, _ff, _fr, _fu);
  obj3d.position.copy(_fp).addScaledVector(_fr, x).addScaledVector(_fu, y);
  const m = new THREE.Matrix4().makeBasis(_fr, _fu, _ff.clone().negate());
  obj3d.quaternion.setFromRotationMatrix(m);
}

function updateObstacleVisibility() {
  const behind = state.s - 12, ahead = state.s + 220;
  for (const d of state.obstacles) {
    const inRange = d.s > behind && d.s < ahead && !d.hit;
    if (inRange && !d.meshMade) {
      d.mesh = makeObstacleMesh(d);
      placeAtFrame(d.mesh, d.s, d.type === 'wallGap' ? 0 : d.x, 0);
      scene.add(d.mesh);
      d.meshMade = true;
    } else if (!inRange && d.meshMade) {
      scene.remove(d.mesh); disposeObj(d.mesh); d.mesh = null; d.meshMade = false;
    }
    if (d.mesh && d.mesh.userData.spin) d.mesh.rotation.z += 0.06;
  }
  for (const c of state.collectibles) {
    const inRange = c.s > behind && c.s < ahead && !c.taken;
    if (inRange && !c.mesh) {
      c.mesh = makeCollectibleMesh(c.kind);
      placeAtFrame(c.mesh, c.s, c.x, 0.3);
      scene.add(c.mesh);
    } else if (!inRange && c.mesh) {
      scene.remove(c.mesh); disposeObj(c.mesh); c.mesh = null;
    }
    if (c.mesh) { c.mesh.rotation.y += 0.05; c.mesh.position.y += Math.sin(performance.now() * 0.004 + c.s) * 0.002; }
  }
  // cull far-behind data entirely
  if (state.obstacles.length > 400) state.obstacles = state.obstacles.filter(d => d.s > state.s - 30);
  if (state.collectibles.length > 800) state.collectibles = state.collectibles.filter(c => c.s > state.s - 30);
}
function disposeObj(o) {
  o.traverse?.((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
  if (o.geometry) o.geometry.dispose();
}

// ============================== ragdoll (cannon-es) ==============================
let cworld = null, shards = [];
function startRagdoll(shipPos, shipVel) {
  cworld = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) });
  shards = [];
  const pieces = [
    { size: [0.6, 0.3, 1.0], color: ship.userData.color },
    { size: [0.5, 0.1, 0.4], color: ship.userData.color },
    { size: [0.5, 0.1, 0.4], color: ship.userData.color },
    { size: [0.3, 0.3, 0.3], color: ship.userData.color },
    { size: [0.25, 0.25, 0.25], color: ship.userData.color },
    { size: [0.25, 0.25, 0.25], color: ship.userData.color },
  ];
  for (const p of pieces) {
    const geo = new THREE.BoxGeometry(...p.size);
    const mat = new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(shipPos);
    scene.add(mesh);
    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2)) });
    body.position.set(shipPos.x, shipPos.y, shipPos.z);
    body.velocity.set(shipVel.x + rand(-6, 6), shipVel.y + rand(2, 7), shipVel.z + rand(-6, 6));
    body.angularVelocity.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
    cworld.addBody(body);
    shards.push({ mesh, body });
  }
  scene.remove(ship);
}
function updateRagdoll(dt) {
  if (!cworld) return;
  cworld.step(1 / 60, dt, 3);
  for (const s of shards) { s.mesh.position.copy(s.body.position); s.mesh.quaternion.copy(s.body.quaternion); }
}
function clearRagdoll() {
  for (const s of shards) { scene.remove(s.mesh); disposeObj(s.mesh); }
  shards = []; cworld = null;
}

// ============================== camera ==============================
function toggleCamera() { state.camMode = 1 - state.camMode; $('btnCam').textContent = 'CAMERA: ' + (state.camMode === 0 ? '3RD' : '1ST'); }
const _camFwd = new THREE.Vector3(), _camRight = new THREE.Vector3(), _camUp = new THREE.Vector3(), _camPos = new THREE.Vector3();
function updateCamera() {
  getFrame(state.s, _camPos, _camFwd, _camRight, _camUp);
  const shipWorld = new THREE.Vector3().copy(_camPos).addScaledVector(_camRight, state.player.x).addScaledVector(_camUp, playerY());
  if (ship) { ship.position.copy(shipWorld); const m = new THREE.Matrix4().makeBasis(_camRight, _camUp, _camFwd.clone().negate()); ship.quaternion.setFromRotationMatrix(m); ship.rotateZ(clamp(-(state.player.strafeVel || 0) / STRAFE_MAX_SPD, -1, 1) * 0.45); }
  shipLight.position.copy(shipWorld).addScaledVector(_camUp, 0.6);

  if (state.camMode === 0) {
    const dist = 5.6, height = 1.9;
    // mouse up (mousePitch > 0) drops the chase cam and raises the aim point => view tilts up
    const yaw = mouseYaw * 0.7, pitch = 0.18 - mousePitch * 0.35;
    const back = _camFwd.clone().multiplyScalar(-dist);
    const rotUp = _camUp.clone().multiplyScalar(Math.sin(pitch) * dist);
    back.multiplyScalar(Math.cos(pitch));
    const rotRight = _camRight.clone().multiplyScalar(Math.sin(yaw) * dist * 0.5);
    const camPos = shipWorld.clone().add(back).add(rotUp).add(rotRight).addScaledVector(_camUp, height);
    camera.position.copy(camPos);
    camera.up.copy(_camUp);
    camera.lookAt(shipWorld.clone().addScaledVector(_camFwd, 6).addScaledVector(_camUp, 0.6 + mousePitch * 4));
  } else {
    camera.position.copy(shipWorld).addScaledVector(_camUp, 0.35).addScaledVector(_camFwd, 0.5);
    camera.up.copy(_camUp);
    const lookTarget = shipWorld.clone().addScaledVector(_camFwd, 10).addScaledVector(_camRight, Math.sin(mouseYaw) * 6).addScaledVector(_camUp, Math.sin(mousePitch) * 6);
    camera.lookAt(lookTarget);
  }
  if (state.shakeT > 0) {
    camera.position.x += rand(-1, 1) * state.shakeT * 0.4;
    camera.position.y += rand(-1, 1) * state.shakeT * 0.4;
  }
}
function playerY() {
  let y = 0;
  if (state.player.jumping) { const t = state.player.jumpT / JUMP_DURATION; y += Math.sin(Math.PI * clamp(t, 0, 1)) * JUMP_HEIGHT; }
  if (state.player.sliding) y -= 0.9;
  return y;
}

// ============================== gameplay constants ==============================
const JUMP_DURATION = 0.62, JUMP_HEIGHT = 2.1;
const SLIDE_MIN = 0.5;
const STRAFE_MAX_X = 3.9, STRAFE_ACCEL = 26, STRAFE_MAX_SPD = 9, STRAFE_DAMP = 8;

function doJump() {
  if (state.mode !== 'playing') return;
  if (state.player.jumping || state.player.sliding) return;
  state.player.jumping = true; state.player.jumpT = 0;
  AUDIO.jump();
}
function doOverdrive() {
  if (state.mode !== 'playing') return;
  if (state.meter < 100 || state.player.invuln > 0) return;
  state.meter = 0;
  state.player.invuln = 4;
  save.overdriveUses = (save.overdriveUses || 0) + 1;
  AUDIO.overdrive();
  toast('OVERDRIVE!');
  if (save.overdriveUses >= 20) unlock('overdrive-master');
}
function doShockwave() {
  if (state.mode !== 'playing' || state.shockCd > 0) return;
  state.shockCd = 8;
  AUDIO.shockwave();
  state.shakeT = 0.3; state.slowmoT = 1.0;
  let cleared = 0;
  for (const d of state.obstacles) {
    if (!d.hit && d.s > state.s && d.s < state.s + 13) { d.hit = true; cleared++; state.runCoins += 1; }
  }
  if (cleared) toast(`Shockwave cleared ${cleared}!`);
}
function doFire() {
  if (state.mode !== 'playing' || state.fireCd > 0) return;
  state.fireCd = 0.28;
  AUDIO.fire();
  let best = null;
  for (const d of state.obstacles) {
    if (d.hit || d.type !== 'crate') continue;
    if (d.s > state.s + 1 && d.s < state.s + 16 && Math.abs(d.x - state.player.x) < 1.3) {
      if (!best || d.s < best.s) best = d;
    }
  }
  if (best) {
    best.hit = true;
    if (best.mesh) spawnBurst(best.mesh.position, 0x3ec6ff, 22, 7);
    if (best.mesh) { scene.remove(best.mesh); disposeObj(best.mesh); best.mesh = null; }
    AUDIO.destroy();
    state.runCoins += 2;
    save.cratesDestroyed = (save.cratesDestroyed || 0) + 1;
    if (save.cratesDestroyed >= 25) unlock('crate-smasher');
  }
}

// ============================== HUD ==============================
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.style.opacity = 1;
  clearTimeout(toast._t); toast._t = setTimeout(() => el.style.opacity = 0, 1600);
}
function announce(msg) {
  const el = $('announcer'); el.textContent = msg; el.style.opacity = 1;
  clearTimeout(announce._t); announce._t = setTimeout(() => el.style.opacity = 0, 1300);
}
function updateHud() {
  $('distLabel').textContent = Math.floor(state.s) + 'm';
  $('distSub').textContent = 'best: ' + Math.floor(state.daily ? save.dailyBestDistance : save.bestDistance) + 'm';
  $('coinLabel').textContent = '◆ ' + (save.coins + state.runCoins);
  const spd = (state.speed / DIFF[state.difficulty].speed).toFixed(1);
  $('speedLabel').textContent = 'SPEED x' + spd;
  $('meterBar').style.width = state.meter + '%';
  $('shieldLabel').textContent = state.player.invuln > 0 ? `SHIELD ${state.player.invuln.toFixed(1)}s` : '';
  const setCd = (id, cd, max) => { const el = $(id); el.classList.toggle('ready', cd <= 0); };
  setCd('cdFire', state.fireCd); setCd('cdShock', state.shockCd); setCd('cdOver', state.meter < 100 ? 1 : 0);
}

// ============================== collision ==============================
function checkCollisions(dt) {
  // sweep from where we were last frame so fast runs cannot tunnel through obstacles
  const behind = Math.min(state.prevS, state.s) - 1, ahead = state.s + 1.4;
  for (const d of state.obstacles) {
    if (d.hit) continue;
    if (d.s < behind || d.s > ahead) continue;
    let overlap = false, safe = false;
      const px = state.player.x, halfP = Math.max(0.55, profilePhysicsRadius * 0.65);
    if (d.type === 'wallGap') {
      overlap = Math.abs(px - d.gapX) > d.gapHalf - halfP;
      safe = false;
    } else {
      overlap = Math.abs(px - d.x) < d.halfW + halfP;
      if (d.type === 'barrierLow' || d.type === 'crate') safe = state.player.jumping && state.player.jumpT > 0.08 && state.player.jumpT < JUMP_DURATION - 0.05;
      else if (d.type === 'barrierHigh' || d.type === 'spinner') safe = state.player.sliding;
    }
    if (overlap && !safe) {
      if (state.player.invuln > 0) { d.hit = true; state.shakeT = 0.15; continue; }
      crash();
      return;
    } else if (d.s <= state.s + 0.3) {
      d.hit = true; // passed safely
      const nearMiss = (d.type !== 'wallGap') ? Math.abs(px - d.x) < d.halfW + halfP + 0.5 : Math.abs(px - d.gapX) > d.gapHalf - halfP - 0.4;
      if (nearMiss) { state.runNearMiss++; save.nearMisses = (save.nearMisses || 0) + 1; if (save.nearMisses >= 50) unlock('close-call'); }
    }
  }
  for (const c of state.collectibles) {
    if (c.taken) continue;
    if (Math.abs(c.s - state.s) < 1.1 && Math.abs(c.x - state.player.x) < 1.0) {
      c.taken = true;
      if (c.mesh) { spawnBurst(c.mesh.position, c.kind === 'coin' ? 0xffd24a : (c.kind === 'energy' ? 0x37f0ff : 0x5aff8f), 10, 4); scene.remove(c.mesh); disposeObj(c.mesh); c.mesh = null; }
      if (c.kind === 'coin') { state.runCoins += 1; AUDIO.coin(); }
      else if (c.kind === 'energy') { state.meter = clamp(state.meter + 26, 0, 100); AUDIO.orb(); }
      else { state.player.invuln = Math.max(state.player.invuln, 2.5); AUDIO.orb(); toast('Shield!'); }
    }
  }
}

function crash() {
  if (state.mode !== 'playing') return;
  state.mode = 'crashing'; state.hitThisRun = true;
  AUDIO.crash();
  document.exitPointerLock?.();
  $('dmgVignette').style.opacity = 1;
  state.shakeT = 0.8;
  const shipPos = ship.position.clone();
  const vel = _camFwd.clone().multiplyScalar(-state.speed * 0.6);
  startRagdoll(shipPos, vel);
  state.crashTimer = 2.0;
}

function finishRun() {
  state.mode = 'gameover';
  const dist = Math.floor(state.s);
  save.coins += state.runCoins; save.lifetimeCoins += state.runCoins;
  save.runsCompleted = (save.runsCompleted || 0) + 1;
  if (state.daily) { if (dist > save.dailyBestDistance) save.dailyBestDistance = dist; if (dist >= 300) unlock('daily-driver'); }
  else if (dist > save.bestDistance) save.bestDistance = dist;
  unlock('first-run');
  if (dist >= 500) unlock('distance-500');
  if (dist >= 2000) unlock('distance-2000');
  if (dist >= 5000) unlock('distance-5000');
  if (save.lifetimeCoins >= 100) unlock('coin-collector');
  if (save.lifetimeCoins >= 500) unlock('coin-hoarder');
  if (state.difficulty === 'hard' && dist >= 1000) unlock('hardcore');
  if (save.ownedSkins.length >= 3) unlock('skin-collector');
  persist();
  $('endTitle').textContent = state.hitThisRun ? 'CRASHED' : 'RUN COMPLETE';
  $('endBody').innerHTML = `
    <div class="statLine"><span>Distance</span><span>${dist}m</span></div>
    <div class="statLine"><span>Coins earned</span><span>◆ ${state.runCoins}</span></div>
    <div class="statLine"><span>Near misses</span><span>${state.runNearMiss}</span></div>
    <div class="statLine"><span>Mode</span><span>${state.daily ? 'Daily Seed' : DIFF[state.difficulty].label}</span></div>
    <div class="statLine"><span>Best distance</span><span>${Math.floor(state.daily ? save.dailyBestDistance : save.bestDistance)}m</span></div>`;
  show('endScreen');
  $('hud').classList.add('hidden');
  reportPlaytimeIfDue(true);
}

// ============================== run lifecycle ==============================
let runStartTime = 0;
function startRun(difficulty, daily) {
  state.mode = 'playing'; state.difficulty = difficulty; state.daily = daily;
  state.seed = daily ? hashStr('tunnel-' + todayKey()) : ((Math.random() * 0xffffffff) >>> 0);
  pathCoef = genPathCoef(state.seed);
  buildTunnel();
  state.rng = mulberry32(state.seed ^ 0x9e3779b9);
  state.s = 0; state.prevS = 0; state.player.x = 0; state.player.jumping = false; state.player.sliding = false; state.player.invuln = 0;
  state.meter = 0; state.shockCd = 0; state.fireCd = 0;
  state.runCoins = 0; state.runNearMiss = 0; state.hitThisRun = false;
  state.spawnCursor = 40;
  for (const d of state.obstacles) if (d.mesh) { scene.remove(d.mesh); disposeObj(d.mesh); }
  for (const c of state.collectibles) if (c.mesh) { scene.remove(c.mesh); disposeObj(c.mesh); }
  state.obstacles = []; state.collectibles = [];
  clearRagdoll();
  setShip(save.equippedSkin);
  $('dmgVignette').style.opacity = 0;
  $('hud').classList.remove('hidden');
  hideAll(); $('lockHint').style.display = 'block';
  runStartTime = performance.now();
  AUDIO.startMusic();
  announce(daily ? 'DAILY SEED CHALLENGE' : DIFF[difficulty].label);
}

function onEscape() {
  if (state.mode === 'playing') {
    state.mode = 'paused'; document.exitPointerLock?.();
    $('pauseStats').textContent = `Distance: ${Math.floor(state.s)}m  ·  Coins this run: ${state.runCoins}`;
    show('pause');
  } else if (state.mode === 'paused') {
    resumeRun();
  }
}
function resumeRun() { state.mode = 'playing'; hideAll(); $('lockHint').style.display = pointerLocked ? 'none' : 'block'; }

function reportPlaytimeIfDue(force) {
  const secs = Math.round((performance.now() - runStartTime) / 1000);
  if (secs > 0) { try { empire.reportPlaytime(secs); } catch { /* ignore */ } }
  runStartTime = performance.now();
}

// ============================== menu wiring ==============================
function hideAll() {
  for (const id of ['menu', 'garage', 'achMenu', 'howMenu', 'pause', 'endScreen']) $(id).classList.add('hidden');
}
function show(id) { hideAll(); $(id).classList.remove('hidden'); }

let selDiff = 'normal';
document.querySelectorAll('.diffBtn').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.diffBtn').forEach((x) => x.classList.remove('sel'));
  b.classList.add('sel'); selDiff = b.dataset.diff; AUDIO.menu();
}));
$('btnPlay').addEventListener('click', () => startRun(selDiff, false));
$('btnDaily').addEventListener('click', () => startRun('normal', true));
$('btnGarage').addEventListener('click', () => { renderGarage(); show('garage'); });
$('btnAch').addEventListener('click', () => { renderAch(); show('achMenu'); });
$('btnHow').addEventListener('click', () => show('howMenu'));
$('howBack').addEventListener('click', () => show('menu'));
$('achBack').addEventListener('click', () => show('menu'));
$('garageBack').addEventListener('click', () => show('menu'));
$('btnResume').addEventListener('click', resumeRun);
$('btnRestart').addEventListener('click', () => startRun(state.difficulty, state.daily));
$('btnQuit').addEventListener('click', async () => { await persist(); reportPlaytimeIfDue(true); state.mode = 'menu'; hideAll(); $('hud').classList.add('hidden'); refreshMenuStats(); show('menu'); });
$('btnEndMenu').addEventListener('click', () => { state.mode = 'menu'; refreshMenuStats(); show('menu'); });
$('btnEndRetry').addEventListener('click', () => startRun(state.difficulty, state.daily));
$('btnCam').addEventListener('click', toggleCamera);
$('btnMusic').addEventListener('click', () => { AUDIO.musicOn = !AUDIO.musicOn; $('btnMusic').textContent = 'MUSIC: ' + (AUDIO.musicOn ? 'ON' : 'OFF'); if (AUDIO.musicOn) AUDIO.startMusic(); else AUDIO.stopMusic(); });
$('btnSfx').addEventListener('click', () => { AUDIO.sfxOn = !AUDIO.sfxOn; $('btnSfx').textContent = 'SFX: ' + (AUDIO.sfxOn ? 'ON' : 'OFF'); });

function renderGarage() {
  $('garageCoins').textContent = save.coins;
  const grid = $('garageGrid'); grid.innerHTML = '';
  for (const skin of SKINS) {
    const owned = save.ownedSkins.includes(skin.id);
    const equipped = save.equippedSkin === skin.id;
    const card = document.createElement('div');
    card.className = 'shopCard' + (owned ? ' owned' : '') + (equipped ? ' sel' : '');
    const swatchColor = '#' + skin.color.toString(16).padStart(6, '0');
    card.innerHTML = `<div class="skinSwatch" style="background:${swatchColor};box-shadow:0 0 14px ${swatchColor}"></div>
      <div class="t">${skin.name}</div><div class="d">${owned ? (equipped ? 'Equipped' : 'Owned') : `Cost: <span class="price">◆ ${skin.cost}</span>`}</div>`;
    const btn = document.createElement('button');
    if (equipped) { btn.textContent = 'EQUIPPED'; btn.disabled = true; }
    else if (owned) { btn.textContent = 'EQUIP'; btn.addEventListener('click', () => { save.equippedSkin = skin.id; AUDIO.menu(); persist(); renderGarage(); }); }
    else { btn.textContent = 'UNLOCK'; btn.disabled = save.coins < skin.cost; btn.addEventListener('click', () => { if (save.coins >= skin.cost) { save.coins -= skin.cost; save.ownedSkins.push(skin.id); save.equippedSkin = skin.id; AUDIO.ach(); if (save.ownedSkins.length >= 3) unlock('skin-collector'); persist(); renderGarage(); } }); }
    card.appendChild(btn); grid.appendChild(card);
  }
}
function renderAch() {
  const body = $('achBody'); body.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const done = !!save.achDone[a.id];
    if (a.hidden && !done) { body.innerHTML += `<div class="achRow locked"><span>??? (hidden)</span><span>locked</span></div>`; continue; }
    body.innerHTML += `<div class="achRow${done ? '' : ' locked'}"><span><b>${a.title}</b> — ${a.desc}</span><span>${done ? '✓' : 'locked'}</span></div>`;
  }
}
function refreshMenuStats() {
  $('menuStats').textContent = `Best distance: ${Math.floor(save.bestDistance)}m  ·  Daily best: ${Math.floor(save.dailyBestDistance)}m  ·  Coins: ◆ ${save.coins}  ·  Runs: ${save.runsCompleted || 0}`;
  $('dailyTag').textContent = '(' + todayKey() + ')';
}

// ============================== main loop ==============================
let lastT = performance.now();
function tick() {
  const now = performance.now();
  let dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  requestAnimationFrame(tick);

  if (state.mode === 'crashing') {
    updateRagdoll(dt);
    state.crashTimer -= dt;
    state.shakeT = Math.max(0, state.shakeT - dt);
    if (shards.length) camera.lookAt(shards[0].mesh.position);
    renderer.render(scene, camera);
    if (state.crashTimer <= 0) { clearRagdoll(); finishRun(); }
    return;
  }

  if (state.mode !== 'playing') { renderer.render(scene, camera); return; }

  const gp = pollGamepad(dt);
  const diff = DIFF[state.difficulty];

  // forward speed
  let base = diff.speed * (1 + clamp(state.s / diff.ramp, 0, diff.cap - 1));
  if (keys.has('KeyW')) base *= 1.12;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) base *= 1.55;
  if (state.player.invuln > 0) base *= 1.25;
  state.speed = base;

  const timeScale = state.slowmoT > 0 ? 0.4 : 1;
  state.slowmoT = Math.max(0, state.slowmoT - dt);
  const sdt = dt * timeScale;

  state.prevS = state.s;
  state.s += state.speed * sdt;

  // strafing
  let strafeInput = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (gp.strafe || 0);
  strafeInput = clamp(strafeInput, -1, 1);
  state.player.strafeVel = (state.player.strafeVel || 0) + strafeInput * STRAFE_ACCEL * dt;
  state.player.strafeVel = clamp(state.player.strafeVel, -STRAFE_MAX_SPD, STRAFE_MAX_SPD);
  if (Math.abs(strafeInput) < 0.05) state.player.strafeVel *= Math.max(0, 1 - STRAFE_DAMP * dt);
  state.player.x = clamp(state.player.x + state.player.strafeVel * dt, -STRAFE_MAX_X, STRAFE_MAX_X);
  if (state.player.x <= -STRAFE_MAX_X || state.player.x >= STRAFE_MAX_X) state.player.strafeVel = 0;

  // jump
  if (keys.has('Space')) doJump();
  if (state.player.jumping) { state.player.jumpT += dt; if (state.player.jumpT >= JUMP_DURATION) { state.player.jumping = false; state.player.jumpT = 0; } }
  // slide
  const wantSlide = keys.has('KeyS') || (gp.slide);
  if (wantSlide && !state.player.jumping) { if (!state.player.sliding) AUDIO.slide(); state.player.sliding = true; state.player.slideT = (state.player.slideT || 0) + dt; }
  else { state.player.sliding = false; state.player.slideT = 0; }

  // fire / shockwave / overdrive
  state.fireCd = Math.max(0, state.fireCd - dt);
  state.shockCd = Math.max(0, state.shockCd - dt);
  if (lmbDown) doFire();
  if (rmbDown) doShockwave();
  if (keys.has('KeyE')) { doOverdrive(); keys.delete('KeyE'); }
  state.player.invuln = Math.max(0, state.player.invuln - dt);
  state.meter = clamp(state.meter + dt * 1.6, 0, 100);

  ensureSpawns();
  updateObstacleVisibility();
  checkCollisions(dt);
  if (state.mode !== 'playing') { renderer.render(scene, camera); return; }

  updateCamera();
  if (ship) spawnTrail(ship.position.clone().addScaledVector(_camFwd, 0.6), ship.userData.color);
  updateTrail(dt);
  updateBursts(dt);
  state.shakeT = Math.max(0, state.shakeT - dt * 2);

  updateHud();
  $('speedLines').style.opacity = state.speed > diff.speed * 1.8 ? 0.5 : 0;

  renderer.render(scene, camera);

  if (now - (tick._lastSave || 0) > 15000) { tick._lastSave = now; persist(); }
}

// ============================== boot ==============================
async function boot() {
  const init = await empire.connect();
  mergeSave(init.blob || init.saveBlob || null);
  try {
    const loaded = await empire.loadState('main');
    if (loaded && loaded.blob) mergeSave(loaded.blob);
  } catch { /* ignore */ }
  try { settings = await empire.getSettings(); } catch { settings = null; }
  await loadProfileShipAsset();
  refreshMenuStats();
  buildTunnel();
  setShip(save.equippedSkin);
  camera.position.set(0, 2, 8);
  camera.lookAt(0, 1, -10);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
boot();
