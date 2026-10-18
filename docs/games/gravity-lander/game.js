import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EmpireClient } from '../../shared/empire-sdk.js';

const GAME_ID = 'gravity-lander';
const SAVE_VERSION = 1;
const NUM_PADS = 20;

// ============================================================================
// RNG / NOISE
// ============================================================================
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function makeHeightFn(rng) {
  const layers = [];
  for (let k = 0; k < 4; k++) {
    layers.push({
      freq: 0.018 * (k + 1) * (0.7 + rng() * 0.6),
      amp: (16 / (k + 1)) * (0.6 + rng() * 0.8),
      phaseX: rng() * 1000, phaseY: rng() * 1000,
    });
  }
  return (x, y) => {
    let h = 0;
    for (const L of layers) h += Math.sin(x * L.freq + L.phaseX) * Math.cos(y * L.freq * 0.6 + L.phaseY) * L.amp;
    return h;
  };
}

// ============================================================================
// DIFFICULTY PRESETS
// ============================================================================
const DIFFICULTY = {
  easy:   { label: 'Easy',   gravityMult: 0.8,  windMult: 0.5, fuelMult: 1.3, tolMult: 1.3, scoreMult: 0.7, desc: 'Gentle gravity, light wind, generous fuel and landing tolerance.' },
  normal: { label: 'Normal', gravityMult: 1.0,  windMult: 1.0, fuelMult: 1.0, tolMult: 1.0, scoreMult: 1.0, desc: 'Balanced challenge — the intended experience.' },
  hard:   { label: 'Hard',   gravityMult: 1.2,  windMult: 1.4, fuelMult: 0.85,tolMult: 0.8, scoreMult: 1.3, desc: 'Stronger gravity and wind, tighter margins.' },
  brutal: { label: 'Brutal', gravityMult: 1.45, windMult: 1.9, fuelMult: 0.7, tolMult: 0.6, scoreMult: 1.6, desc: 'Punishing. Precision only. Highest score multiplier.' },
};

// ============================================================================
// LEVEL GENERATION
// ============================================================================
const GRID_N = 40;
const ELEMENT_SIZE = 8;
const HALF = (GRID_N - 1) * ELEMENT_SIZE / 2;

function generatePad(index) {
  const seed = hashString('gravity-lander-pad-' + (index + 1)) ^ 0x9e3779b9;
  return buildLevel(seed, index, `Pad ${index + 1}`);
}
function generateDaily(dateStr) {
  const seed = hashString('gravity-lander-daily-' + dateStr);
  return buildLevel(seed, 9, `Daily — ${dateStr}`, true);
}

function buildLevel(seed, index, label, isDaily = false) {
  const rng = mulberry32(seed);
  const heightFn = makeHeightFn(rng);
  const t = index / (NUM_PADS - 1); // 0..1 progression
  const padRadiusCells = Math.max(2, 5 - Math.floor(index / 5));
  const padRadius = padRadiusCells * ELEMENT_SIZE;
  const iC = Math.floor(GRID_N / 2), jC = Math.floor(GRID_N / 2);

  // build height data
  const data = [];
  for (let i = 0; i < GRID_N; i++) {
    const col = [];
    for (let j = 0; j < GRID_N; j++) {
      const wx = i * ELEMENT_SIZE - HALF, wy = j * ELEMENT_SIZE - HALF;
      col.push(heightFn(wx, wy) * (0.5 + t * 1.2));
    }
    data.push(col);
  }
  const padHeight = data[iC][jC];
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const d = Math.hypot(i - iC, j - jC);
      if (d <= padRadiusCells) data[i][j] = padHeight;
      else if (d <= padRadiusCells + 2) {
        const w = (d - padRadiusCells) / 2;
        data[i][j] = padHeight * (1 - w) + data[i][j] * w;
      }
    }
  }

  const spawnDistCells = 9 + index * 1.35 + rng() * 3;
  const spawnSide = rng() < 0.5 ? -1 : 1;
  const spawnX = spawnSide * spawnDistCells * ELEMENT_SIZE;
  const spawnY = padHeight + 90 + index * 4 + rng() * 20;

  const windBase = (isDaily ? 1.4 : index * 0.16) + rng() * 0.6;
  const windFreq = 0.15 + rng() * 0.2;
  const windPhase = rng() * 1000;

  const fuelCapacity = Math.max(48, 100 - index * 1.6);
  const gravity = 1.62 + index * 0.045; // moon-ish, escalating
  const crashSpeed = 6.2;
  const crashTiltDeg = 34;

  return {
    index, label, seed, isDaily,
    heightData: data, padHeight, padCenter: { i: iC, j: jC }, padRadius,
    padWorld: { x: iC * ELEMENT_SIZE - HALF, y: padHeight, z: HALF - jC * ELEMENT_SIZE },
    spawn: { x: spawnX, y: spawnY, z: HALF - jC * ELEMENT_SIZE },
    windBase, windFreq, windPhase,
    fuelCapacity, gravity, crashSpeed, crashTiltDeg,
  };
}

// ============================================================================
// AUDIO
// ============================================================================
class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.volume = 0.7;
    this.thrustNode = null; this.windNode = null;
  }
  ensure() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  resume() { this.ensure(); if (this.ctx.state === 'suspended') this.ctx.resume(); }
  _noiseBuffer(dur = 1) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  click() {
    this.ensure();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = 720;
    g.gain.setValueAtTime(0.14, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.1);
  }
  startThrust() {
    this.ensure();
    if (this.thrustNode) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(2); src.loop = true;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start();
    this.thrustNode = { src, g, filt };
  }
  setThrust(active, boost) {
    if (!this.thrustNode) return;
    const target = active ? (boost ? 0.32 : 0.2) : 0.0001;
    this.thrustNode.g.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
    this.thrustNode.filt.frequency.setTargetAtTime(active ? (boost ? 900 : 600) : 400, this.ctx.currentTime, 0.1);
  }
  stopThrust() {
    if (!this.thrustNode) return;
    try { this.thrustNode.src.stop(); } catch {}
    this.thrustNode = null;
  }
  setWind(strength) {
    this.ensure();
    if (!this.windNode) {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer(3); src.loop = true;
      const filt = this.ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 300; filt.Q.value = 0.6;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start();
      this.windNode = { src, g };
    }
    const t = Math.min(1, strength / 3);
    this.windNode.g.gain.setTargetAtTime(t * 0.1, this.ctx.currentTime, 0.3);
  }
  crash() {
    this.ensure();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.6);
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.setValueAtTime(1200, this.ctx.currentTime);
    filt.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.5);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
    src.connect(filt); filt.connect(g); g.connect(this.master); src.start(); src.stop(this.ctx.currentTime + 0.6);
    const o = this.ctx.createOscillator(); const og = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(90, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.5);
    og.gain.setValueAtTime(0.3, this.ctx.currentTime); og.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
    o.connect(og); og.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.6);
  }
  landChime(medal) {
    this.ensure();
    const freqs = medal === 'gold' ? [523, 659, 784, 1047] : medal === 'silver' ? [440, 554, 659] : [349, 440];
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const start = this.ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.22, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      o.connect(g); g.connect(this.master); o.start(start); o.stop(start + 0.55);
    });
  }
}
const audio = new AudioEngine();

// ============================================================================
// SDK CLIENT
// ============================================================================
function applyHubSettings(s) {
  if (!s) return;
  if (typeof s.sensitivity === 'number') game.settings.sensitivity = s.sensitivity;
  if (typeof s.volume === 'number') game.settings.volume = s.volume;
  if (typeof s.invertY === 'boolean') game.settings.invertY = s.invertY;
  audio.setVolume(game.settings.volume);
}
const empire = new EmpireClient({
  gameId: GAME_ID,
  saveVersion: SAVE_VERSION,
  onInit: (initData) => { if (initData && initData.settings) applyHubSettings(initData.settings); },
  onSettings: (s) => applyHubSettings(s),
  onPause: () => { if (game.state === 'playing') openPause(); },
  onResume: () => {},
});
/** Fire-and-forget achievement unlock — never lets a hub error surface as an unhandled rejection. */
function ach(id) { empire.unlockAchievement(id).catch(() => {}); }

// ============================================================================
// GLOBAL STATE
// ============================================================================
const game = {
  state: 'menu', // menu | playing | paused | result
  difficulty: 'normal',
  padIndex: 0,
  isDaily: false,
  level: null,
  playtimeSec: 0,
  settings: { sensitivity: 1.0, volume: 0.7, invertY: false },
  save: {
    padBest: {}, // index -> {medal, score}
    totalScore: 0,
    achievements: {},
    dailyStreak: 0,
    lastDailyDate: null,
  },
};
let liftoffUsed = false, crashedOnce = false, goldCount = 0;

let scene, camera, renderer, world, clock;
let starMesh, terrainMesh, padMarker, landerGroup, landerBody, debris = [];
let profileLanderAsset = null;
let profilePhysicsRadius = 0.9;
window.__gravityLanderAssetStatus = { loaded: false, attached: false, physics: false, error: '' };
async function loadProfileLanderAsset() {
  const Loader = window.THREE?.GLTFLoader;
  if (!Loader) { window.__gravityLanderAssetStatus.error = 'GLTFLoader unavailable'; return; }
  try {
    const [physics, gltf] = await Promise.all([
      fetch('../../assets/blender-kits/gravity-lander/physics.json').then((r) => r.ok ? r.json() : null),
      new Promise((resolve, reject) => new Loader().load('../../assets/blender-kits/gravity-lander/gravity-lander-kit.glb', resolve, undefined, reject)),
    ]);
    const source = gltf.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || gltf.scene.getObjectByName('PLAYER_BODY');
    if (!source) throw new Error('profile lander asset missing');
    profileLanderAsset = source.clone(true);
    profileLanderAsset.name = 'BLENDER_LANDER_DETAIL';
    profileLanderAsset.scale.setScalar(2.4);
    profileLanderAsset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
    profilePhysicsRadius = physics?.playerCollider?.radius || profilePhysicsRadius;
    window.__gravityLanderAssetStatus.loaded = true;
    window.__gravityLanderAssetStatus.physics = !!physics?.playerCollider;
  } catch (error) { window.__gravityLanderAssetStatus.error = String(error?.message || error); }
}
let lastReportedPlaytime = 0;
const keys = {};
let dragging = false, lastMouseX = 0, lastMouseY = 0;
let camAzimuth = Math.PI, camElevation = 0.35, camDist = 60;
let shakeTime = 0, shakeMag = 0;

// ============================================================================
// LOCAL SETTINGS / SAVE PERSISTENCE
// ============================================================================
function loadLocalSettings() {
  try { const raw = localStorage.getItem('gravlander_settings'); if (raw) Object.assign(game.settings, JSON.parse(raw)); } catch {}
}
function saveLocalSettings() {
  try { localStorage.setItem('gravlander_settings', JSON.stringify(game.settings)); } catch {}
}
function saveKey() { return empire.standalone ? 'auto' : 'auto'; }
async function persistSave() {
  try {
    await empire.saveState(saveKey(), game.save, { label: 'Gravity Lander', progress: clearedCount() / NUM_PADS, difficulty: game.difficulty });
  } catch { /* hub unavailable — progress stays in memory */ }
}
async function loadSave() {
  try {
    const rec = await empire.loadState(saveKey());
    if (rec && rec.blob) Object.assign(game.save, rec.blob);
  } catch {}
}
function clearedCount() { return Object.keys(game.save.padBest).length; }

// ============================================================================
// THREE / CANNON SETUP
// ============================================================================
function initThree() {
  const glCanvas = document.getElementById('gl');
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(0x05070f, 0.0022);
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4000);

  scene.add(new THREE.AmbientLight(0x445577, 0.65));
  const sun = new THREE.DirectionalLight(0xffefd6, 1.3);
  sun.position.set(300, 400, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -300; sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 300; sun.shadow.camera.bottom = -300;
  sun.shadow.camera.far = 1000;
  scene.add(sun);

  starMesh = makeStarfield();
  scene.add(starMesh);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
function makeStarfield() {
  const N = 2200;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 1200 + Math.random() * 800;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.6 + 40;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false });
  return new THREE.Points(geo, mat);
}

function initWorld() {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -1.62, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;
  world.solver.iterations = 12;
}

// ============================================================================
// LEVEL BUILD (terrain + pad + lander)
// ============================================================================
function clearLevelObjects() {
  if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); terrainMesh = null; }
  if (padMarker) { scene.remove(padMarker); padMarker = null; }
  if (landerGroup) { scene.remove(landerGroup); landerGroup = null; }
  if (world) {
    world.bodies.slice().forEach((b) => world.removeBody(b));
  }
  debris.forEach((d) => { scene.remove(d.mesh); });
  debris = [];
  landerBody = null;
}

function buildTerrainMesh(level) {
  const data = level.heightData;
  const geo = new THREE.BufferGeometry();
  const positions = [], colors = [], indices = [];
  const colorLow = new THREE.Color(0x3a3a44), colorHigh = new THREE.Color(0x8a7a6a), colorPad = new THREE.Color(0x2fd66a);
  for (let i = 0; i < GRID_N; i++) {
    for (let j = 0; j < GRID_N; j++) {
      const wx = i * ELEMENT_SIZE - HALF;
      const wz = HALF - j * ELEMENT_SIZE;
      const h = data[i][j];
      positions.push(wx, h, wz);
      const d = Math.hypot(i - level.padCenter.i, j - level.padCenter.j);
      let c;
      if (d <= level.padRadius / ELEMENT_SIZE + 0.2) c = colorPad;
      else { const tt = Math.min(1, Math.max(0, (h + 20) / 60)); c = colorLow.clone().lerp(colorHigh, tt); }
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < GRID_N - 1; i++) {
    for (let j = 0; j < GRID_N - 1; j++) {
      const a = i * GRID_N + j, b = (i + 1) * GRID_N + j, c = (i + 1) * GRID_N + (j + 1), d = i * GRID_N + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.05, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
function buildTerrainBody(level) {
  const matrix = level.heightData;
  const shape = new CANNON.Heightfield(matrix, { elementSize: ELEMENT_SIZE });
  const body = new CANNON.Body({ mass: 0, material: new CANNON.Material('ground') });
  body.addShape(shape);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  body.position.set(-HALF, 0, HALF);
  return body;
}
function buildPadMarker(level) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(level.padRadius * 0.75, level.padRadius, 32),
    new THREE.MeshBasicMaterial({ color: 0x2fd66a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(level.padWorld.x, level.padWorld.y + 0.3, level.padWorld.z);
  g.add(ring);
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 10, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
  flagPole.position.set(level.padWorld.x - level.padRadius * 0.7, level.padWorld.y + 5, level.padWorld.z);
  g.add(flagPole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshStandardMaterial({ color: 0xff5533, side: THREE.DoubleSide }));
  flag.position.set(level.padWorld.x - level.padRadius * 0.7 + 2, level.padWorld.y + 9, level.padWorld.z);
  g.add(flag);
  for (let k = 0; k < 6; k++) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0x66ffaa }));
    const ang = (k / 6) * Math.PI * 2;
    light.position.set(level.padWorld.x + Math.cos(ang) * level.padRadius * 0.9, level.padWorld.y + 0.5, level.padWorld.z + Math.sin(ang) * level.padRadius * 0.9);
    g.add(light);
  }
  return g;
}
function buildLander() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe0e4ea, metalness: 0.4, roughness: 0.45 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff8c2a, metalness: 0.3, roughness: 0.5 });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 3.4, 10), bodyMat);
  core.castShadow = true;
  g.add(core);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7, metalness: 0.2, roughness: 0.1 }));
  dome.position.y = 1.7;
  g.add(dome);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 1.6, 10), accentMat);
  nozzle.position.y = -2.4;
  g.add(nozzle);
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const legGroup = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 6), bodyMat);
    leg.position.set(Math.cos(ang) * 2.4, -3.2, Math.sin(ang) * 2.4);
    leg.rotation.z = Math.cos(ang) * 0.5;
    leg.rotation.x = Math.sin(ang) * 0.5;
    legGroup.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), accentMat);
    foot.position.set(Math.cos(ang) * 3.4, -4.7, Math.sin(ang) * 3.4);
    legGroup.add(foot);
    g.add(legGroup);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 3, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.0 })
  );
  flame.position.y = -4.2;
  flame.rotation.x = Math.PI;
  g.add(flame);
  g.userData.flame = flame;
  if (profileLanderAsset) {
    core.visible = false; dome.visible = false; nozzle.visible = false;
    profileLanderAsset.position.y = 0.15;
    if (profileLanderAsset.parent) profileLanderAsset.parent.remove(profileLanderAsset);
    g.add(profileLanderAsset);
    window.__gravityLanderAssetStatus.attached = true;
  }
  return g;
}

function startLevel(level) {
  clearLevelObjects();
  game.level = level;
  initWorld();
  const groundBody = buildTerrainBody(level);
  groundBody.material = new CANNON.Material('ground');
  world.addBody(groundBody);
  world.gravity.set(0, -level.gravity * DIFFICULTY[game.difficulty].gravityMult, 0);

  terrainMesh = buildTerrainMesh(level);
  scene.add(terrainMesh);
  padMarker = buildPadMarker(level);
  scene.add(padMarker);

  landerGroup = buildLander();
  scene.add(landerGroup);

  const landerMat = new CANNON.Material('lander');
  const contact = new CANNON.ContactMaterial(groundBody.material, landerMat, { friction: 0.4, restitution: 0.05 });
  world.addContactMaterial(contact);

  const shape = new CANNON.Cylinder(profilePhysicsRadius * 2.45, profilePhysicsRadius * 2.9, 6.5, 10);
  landerBody = new CANNON.Body({ mass: 4, material: landerMat, angularDamping: 0.55, linearDamping: 0.02 });
  landerBody.addShape(shape);
  landerBody.position.set(level.spawn.x, level.spawn.y, level.spawn.z);
  landerBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), 0);
  world.addBody(landerBody);
  landerBody.addEventListener('collide', onLanderCollide);

  runtime.fuel = level.fuelCapacity;
  runtime.fuelCap = level.fuelCapacity;
  runtime.landed = false;
  runtime.crashed = false;
  runtime.thrustOn = false;
  runtime.tSinceStart = 0;
  camAzimuth = Math.PI; camElevation = 0.32; camDist = 62;

  document.getElementById('levelLabel').textContent = level.label + (game.isDaily ? '' : ` (${DIFFICULTY[game.difficulty].label})`);
  document.getElementById('objective').textContent = `Objective: land softly & upright on the green pad. Fuel: ${Math.round(level.fuelCapacity)}`;
}

// ============================================================================
// RUNTIME (per-attempt)
// ============================================================================
const runtime = { fuel: 100, fuelCap: 100, landed: false, crashed: false, thrustOn: false, tSinceStart: 0 };
const THRUST_FORCE = 26, BOOST_MULT = 1.7, ROLL_TORQUE = 18, FUEL_BURN = 11;

function onLanderCollide(e) {
  if (runtime.landed || runtime.crashed || !landerBody) return;
  const v = landerBody.velocity;
  const speed = v.length();
  const up = new CANNON.Vec3(0, 1, 0);
  const bodyUp = landerBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
  const tiltRad = Math.acos(Math.min(1, Math.max(-1, bodyUp.dot(up))));
  const tiltDeg = tiltRad * 180 / Math.PI;
  const level = game.level;
  const dx = landerBody.position.x - level.padWorld.x;
  const dz = landerBody.position.z - level.padWorld.z;
  const offset = Math.hypot(dx, dz);
  resolveLanding(speed, tiltDeg, offset);
}

function resolveLanding(speed, tiltDeg, offset) {
  const level = game.level;
  const tol = DIFFICULTY[game.difficulty].tolMult;
  const crashSpeed = level.crashSpeed * (1 + (tol - 1) * 0.5);
  const crashTilt = level.crashTiltDeg * tol;
  const onPad = offset <= level.padRadius;

  if (!onPad || speed > crashSpeed || tiltDeg > crashTilt) {
    triggerCrash();
    return;
  }
  runtime.landed = true;
  audio.stopThrust();
  let medal;
  const goldSpeed = 1.3 * tol, goldTilt = 7 * tol, goldOff = level.padRadius * 0.45;
  const silverSpeed = 2.7 * tol, silverTilt = 16 * tol, silverOff = level.padRadius * 0.8;
  if (speed <= goldSpeed && tiltDeg <= goldTilt && offset <= goldOff) medal = 'gold';
  else if (speed <= silverSpeed && tiltDeg <= silverTilt && offset <= silverOff) medal = 'silver';
  else medal = 'bronze';

  const fuelPct = runtime.fuel / runtime.fuelCap;
  const medalBase = medal === 'gold' ? 1000 : medal === 'silver' ? 600 : 300;
  const fuelBonus = Math.round(fuelPct * 300);
  const accBonus = Math.round(Math.max(0, (level.padRadius - offset) / level.padRadius) * 200);
  const score = Math.round((medalBase + fuelBonus + accBonus) * DIFFICULTY[game.difficulty].scoreMult);

  audio.landChime(medal);
  finishAttempt(medal, score, speed, tiltDeg, fuelPct, offset);
}

function triggerCrash() {
  if (runtime.crashed || runtime.landed) return;
  runtime.crashed = true;
  game.state = 'result';
  audio.stopThrust();
  audio.crash();
  shakeTime = 0.6; shakeMag = 2.5;
  spawnDebris();
  if (landerGroup) { scene.remove(landerGroup); landerGroup = null; }
  if (landerBody) { world.removeBody(landerBody); landerBody = null; }
  if (!crashedOnce) { crashedOnce = true; ach('crash_first'); }
  setTimeout(() => showResult('crash', 0, 0, 0, 0, 0), 900);
}

function spawnDebris() {
  const pos = landerBody.position, vel = landerBody.velocity;
  for (let k = 0; k < 9; k++) {
    const size = 0.4 + Math.random() * 0.7;
    const body = new CANNON.Body({ mass: 0.3, shape: new CANNON.Box(new CANNON.Vec3(size, size, size)) });
    body.position.set(pos.x + (Math.random() - 0.5) * 2, pos.y + Math.random() * 2, pos.z + (Math.random() - 0.5) * 2);
    body.velocity.set(vel.x + (Math.random() - 0.5) * 8, Math.abs(vel.y) * 0.5 + Math.random() * 4, vel.z + (Math.random() - 0.5) * 8);
    body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    world.addBody(body);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size * 2, size * 2, size * 2), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xe0e4ea : 0xff8c2a }));
    mesh.castShadow = true;
    scene.add(mesh);
    debris.push({ body, mesh, life: 3.5 });
  }
}

function finishAttempt(medal, score, speed, tiltDeg, fuelPct, offset) {
  game.state = 'result';
  const prev = game.save.padBest[game.padIndex];
  if (!game.isDaily) {
    if (!prev || score > prev.score) game.save.padBest[game.padIndex] = { medal, score };
    game.save.totalScore += score;
  }
  checkAchievements(medal, fuelPct, offset, level_windStrength());
  if (game.isDaily) handleDailyComplete(score);
  persistSave();
  showResult(medal, score, speed, tiltDeg, fuelPct);
}

function level_windStrength() { return game.level ? game.level.windBase * DIFFICULTY[game.difficulty].windMult : 0; }

function handleDailyComplete(score) {
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (game.save.lastDailyDate === today) { /* already counted today, just update score if better */ }
  else if (game.save.lastDailyDate === y) { game.save.dailyStreak += 1; }
  else { game.save.dailyStreak = 1; }
  game.save.lastDailyDate = today;
  ach('daily_complete');
  if (game.save.dailyStreak >= 3) ach('daily_streak_3');
}

function checkAchievements(medal, fuelPct, offset, wind) {
  if (!game.save.achievements.first_landing) { game.save.achievements.first_landing = true; ach('first_landing'); }
  if (medal === 'gold') {
    if (!game.save.achievements.gold_medal) { game.save.achievements.gold_medal = true; ach('gold_medal'); }
    goldCount++;
    game.save.goldCount = (game.save.goldCount || 0) + (game.save.padBest[game.padIndex] ? 0 : 1);
    const golds = Object.values(game.save.padBest).filter((p) => p.medal === 'gold').length;
    if (golds >= 5) ach('gold_sweep_5');
  } else if (medal === 'silver') {
    if (!game.save.achievements.silver_medal) { game.save.achievements.silver_medal = true; ach('silver_medal'); }
  } else if (medal === 'bronze') {
    if (!game.save.achievements.bronze_medal) { game.save.achievements.bronze_medal = true; ach('bronze_medal'); }
  }
  if (fuelPct < 0.05) ach('no_fuel_landing');
  if (fuelPct > 0.8) ach('fuel_saver');
  const speedOk = medal === 'gold';
  if (speedOk && offset < game.level.padRadius * 0.15) ach('perfect_landing');
  if (wind > 1.8 && medal !== 'crash') ach('wind_master');
  if (!game.isDaily && clearedCount() >= NUM_PADS) ach('all_20_cleared');
}

// ============================================================================
// INPUT
// ============================================================================
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape') { if (game.state === 'playing') openPause(); else if (game.state === 'paused') closePause(); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
const glEl = () => document.getElementById('gl');
window.addEventListener('mousedown', (e) => { if (game.state === 'playing') { dragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY; } });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging || game.state !== 'playing') return;
  const dx = e.clientX - lastMouseX, dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX; lastMouseY = e.clientY;
  const sens = game.settings.sensitivity * 0.006;
  camAzimuth -= dx * sens;
  const invert = game.settings.invertY ? -1 : 1;
  camElevation += dy * sens * invert;
  camElevation = Math.max(-0.15, Math.min(1.3, camElevation));
});
window.addEventListener('wheel', (e) => {
  if (game.state !== 'playing') return;
  camDist = Math.max(20, Math.min(160, camDist + e.deltaY * 0.05));
});

// ============================================================================
// GAME LOOP
// ============================================================================
function stepPhysics(dt) {
  if (!world) return;
  // after a landing or a crash the lander is out of play, but debris still needs simulating
  if (!landerBody || runtime.landed || runtime.crashed) { world.step(1 / 60, dt, 5); return; }
  const boost = keys['ShiftLeft'] || keys['ShiftRight'];
  const thrustKey = keys['KeyW'] || keys['ArrowUp'];
  runtime.thrustOn = false;
  if (thrustKey && runtime.fuel > 0) {
    runtime.thrustOn = true;
    const mag = THRUST_FORCE * (boost ? BOOST_MULT : 1);
    const localUp = new CANNON.Vec3(0, 1, 0);
    const worldDir = landerBody.quaternion.vmult(localUp);
    landerBody.applyForce(worldDir.scale(mag * landerBody.mass), landerBody.position);
    runtime.fuel = Math.max(0, runtime.fuel - FUEL_BURN * (boost ? BOOST_MULT : 1) * dt);
    if (!liftoffUsed) { liftoffUsed = true; ach('first_liftoff'); }
  }
  audio.setThrust(runtime.thrustOn, boost);
  if (landerGroup && landerGroup.userData.flame) {
    landerGroup.userData.flame.material.opacity = runtime.thrustOn ? (0.6 + Math.random() * 0.4) : 0;
    landerGroup.userData.flame.scale.y = runtime.thrustOn ? (1 + Math.random() * 0.5) : 1;
  }

  if (keys['KeyA'] || keys['ArrowLeft']) landerBody.angularVelocity.z += ROLL_TORQUE * dt;
  if (keys['KeyD'] || keys['ArrowRight']) landerBody.angularVelocity.z -= ROLL_TORQUE * dt;
  // keep motion confined to X/Y plane (classic lander feel) while remaining a full 3D rigid body
  landerBody.velocity.z = 0;
  landerBody.position.z = game.level.spawn.z;
  landerBody.angularVelocity.x = 0;
  landerBody.angularVelocity.y = 0;

  // wind hazard
  const wind = level_windStrength();
  runtime.tSinceStart += dt;
  const windForce = Math.sin(runtime.tSinceStart * game.level.windFreq + game.level.windPhase) * wind * 3.2;
  landerBody.applyForce(new CANNON.Vec3(windForce, 0, 0), landerBody.position);
  document.getElementById('windVal').textContent = windForce.toFixed(1);

  world.step(1 / 60, dt, 5);

  // a collision resolved inside the step can end the attempt and dispose the lander
  if (!landerBody || !landerGroup) return;

  // update mesh
  landerGroup.position.copy(landerBody.position);
  landerGroup.quaternion.copy(landerBody.quaternion);

  // altitude / danger crash check (fell off world or excessive time)
  if (landerBody.position.y < -50) triggerCrash();
}

function stepDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
    d.life -= dt;
    if (d.life <= 0) {
      world.removeBody(d.body);
      scene.remove(d.mesh);
      debris.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  if (keys['KeyQ']) camAzimuth += 1.4 * dt;
  if (keys['KeyE']) camAzimuth -= 1.4 * dt;
  const target = landerBody ? landerBody.position : (game.level ? game.level.padWorld : { x: 0, y: 0, z: 0 });
  let sx = 0, sy = 0;
  if (shakeTime > 0) {
    shakeTime -= dt;
    const m = shakeMag * (shakeTime / 0.6);
    sx = (Math.random() - 0.5) * m; sy = (Math.random() - 0.5) * m;
  }
  const camX = target.x + camDist * Math.sin(camAzimuth) * Math.cos(camElevation) + sx;
  const camZ = target.z + camDist * Math.cos(camAzimuth) * Math.cos(camElevation);
  const camY = target.y + camDist * Math.sin(camElevation) + 12 + sy;
  camera.position.lerp(new THREE.Vector3(camX, camY, camZ), Math.min(1, dt * 5));
  camera.lookAt(target.x, target.y + 3, target.z);
}

function updateHud() {
  if (!landerBody && !runtime.crashed) return;
  const fuelPct = runtime.fuelCap ? runtime.fuel / runtime.fuelCap : 0;
  document.getElementById('fuelFill').style.width = `${Math.max(0, fuelPct * 100)}%`;
  if (!landerBody) return;
  const alt = Math.max(0, landerBody.position.y - game.level.padHeight);
  document.getElementById('altVal').textContent = alt.toFixed(0);
  const speed = landerBody.velocity.length();
  document.getElementById('speedFill').style.width = `${Math.min(100, (speed / game.level.crashSpeed) * 100)}%`;
  const bodyUp = landerBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
  const tiltDeg = Math.acos(Math.min(1, Math.max(-1, bodyUp.y))) * 180 / Math.PI;
  document.getElementById('tiltFill').style.width = `${Math.max(0, 100 - (tiltDeg / game.level.crashTiltDeg) * 100)}%`;
}

let lastTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (game.state === 'playing') {
    stepPhysics(dt);
    stepDebris(dt);
    updateCamera(dt);
    updateHud();
    game.playtimeSec += dt;
    if (game.playtimeSec - lastReportedPlaytime > 20) { lastReportedPlaytime = game.playtimeSec; empire.reportPlaytime(20); }
  } else if (game.state === 'result' || runtime.crashed) {
    stepPhysics(dt);
    stepDebris(dt);
    updateCamera(dt);
  }
  renderer.render(scene, camera);
}

// ============================================================================
// UI WIRING
// ============================================================================
const el = (id) => document.getElementById(id);
function showOverlay(id) { document.querySelectorAll('.overlay').forEach((o) => o.classList.add('hidden')); el(id).classList.remove('hidden'); }
function hideAllOverlays() { document.querySelectorAll('.overlay').forEach((o) => o.classList.add('hidden')); }

function toast(msg) {
  const wrap = el('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function refreshMainMenu() {
  el('menuBestScore').textContent = game.save.totalScore || 0;
  el('menuCleared').textContent = clearedCount();
  el('btnContinue').disabled = clearedCount() === 0 && !game.save.padBest;
}

function openMainMenu() {
  game.state = 'menu';
  el('hudRoot').classList.add('hidden');
  refreshMainMenu();
  showOverlay('mainMenu');
}

function buildPadList() {
  const list = el('padList');
  list.innerHTML = '';
  const highestCleared = clearedCount() ? Math.max(...Object.keys(game.save.padBest).map(Number)) : -1;
  for (let i = 0; i < NUM_PADS; i++) {
    const best = game.save.padBest[i];
    const locked = i > highestCleared + 1;
    const row = document.createElement('div');
    row.className = 'padrow' + (locked ? ' locked' : '');
    const medalIcon = best ? (best.medal === 'gold' ? '🥇' : best.medal === 'silver' ? '🥈' : '🥉') : '—';
    const tagClass = i < 7 ? 'easy' : i >= 14 ? 'hard' : '';
    row.innerHTML = `<span class="medal">${medalIcon}</span><span>Pad ${i + 1}${tagClass ? `<span class="tag ${tagClass}">${tagClass}</span>` : ''}</span><span>${best ? best.score : ''}</span>`;
    if (!locked) {
      row.addEventListener('click', () => {
        audio.click();
        game.padIndex = i; game.isDaily = false;
        hideAllOverlays();
        beginRun(generatePad(i));
      });
    }
    list.appendChild(row);
  }
}

function beginRun(level) {
  audio.resume();
  audio.startThrust();
  startLevel(level);
  liftoffUsed = liftoffUsed; // preserved across attempts
  game.state = 'playing';
  el('hudRoot').classList.remove('hidden');
}

function openPause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  audio.setThrust(false, false);
  showOverlay('pauseMenu');
}
function closePause() {
  game.state = 'playing';
  hideAllOverlays();
  el('hudRoot').classList.remove('hidden');
}

function showResult(medal, score, speed, tiltDeg, fuelPct) {
  hideAllOverlays();
  el('hudRoot').classList.add('hidden');
  const icon = medal === 'gold' ? '🥇' : medal === 'silver' ? '🥈' : medal === 'bronze' ? '🥉' : '💥';
  const title = medal === 'gold' ? 'GOLD LANDING' : medal === 'silver' ? 'SILVER LANDING' : medal === 'bronze' ? 'BRONZE LANDING' : 'CRASH LANDING';
  el('resultIcon').textContent = icon;
  el('resultTitle').textContent = title;
  el('resultSub').textContent = game.isDaily ? 'Daily Challenge' : game.level.label;
  el('statSpeed').textContent = medal === 'crash' ? '—' : `${speed.toFixed(2)} m/s`;
  el('statTilt').textContent = medal === 'crash' ? '—' : `${tiltDeg.toFixed(1)}°`;
  el('statFuel').textContent = medal === 'crash' ? '—' : `${Math.round(fuelPct * 100)}%`;
  el('statScore').textContent = medal === 'crash' ? '0' : score;
  el('btnNextPad').disabled = game.isDaily || game.padIndex >= NUM_PADS - 1 || medal === 'crash';
  showOverlay('resultMenu');
}

function wireUI() {
  el('btnNewGame').addEventListener('click', () => { audio.click(); buildPadList(); showOverlay('padSelect'); });
  el('padSelectClose').addEventListener('click', () => { audio.click(); showOverlay('mainMenu'); });
  el('btnContinue').addEventListener('click', () => {
    audio.click();
    const highest = clearedCount() ? Math.max(...Object.keys(game.save.padBest).map(Number)) + 1 : 0;
    const idx = Math.min(NUM_PADS - 1, highest);
    game.padIndex = idx; game.isDaily = false;
    hideAllOverlays();
    beginRun(generatePad(idx));
  });
  el('btnDaily').addEventListener('click', () => {
    audio.click();
    const today = new Date().toISOString().slice(0, 10);
    game.isDaily = true;
    hideAllOverlays();
    beginRun(generateDaily(today));
  });
  document.querySelectorAll('[data-diff]').forEach((b) => {
    b.addEventListener('click', () => {
      game.difficulty = b.dataset.diff;
      document.querySelectorAll('[data-diff]').forEach((x) => x.classList.remove('primary'));
      b.classList.add('primary');
      el('diffDesc').textContent = DIFFICULTY[game.difficulty].desc;
      audio.click();
    });
  });
  el('diffDesc').textContent = DIFFICULTY[game.difficulty].desc;

  el('btnSettings').addEventListener('click', () => openSettings());
  el('btnPauseSettings').addEventListener('click', () => openSettings());
  el('settingsClose').addEventListener('click', () => closeSettings());
  el('settingsDone').addEventListener('click', () => closeSettings());
  el('sensSlider').addEventListener('input', (e) => { game.settings.sensitivity = parseFloat(e.target.value); el('sensVal').textContent = game.settings.sensitivity.toFixed(1); saveLocalSettings(); });
  el('volSlider').addEventListener('input', (e) => { game.settings.volume = parseFloat(e.target.value); el('volVal').textContent = Math.round(game.settings.volume * 100) + '%'; audio.setVolume(game.settings.volume); saveLocalSettings(); });
  el('invertY').addEventListener('change', (e) => { game.settings.invertY = e.target.checked; saveLocalSettings(); });

  el('btnHowTo').addEventListener('click', () => showOverlay('howToMenu'));
  el('howToClose').addEventListener('click', () => openMainMenu());
  el('howToDone').addEventListener('click', () => openMainMenu());

  el('btnResume').addEventListener('click', () => { audio.click(); closePause(); });
  el('btnRestartLevel').addEventListener('click', () => { audio.click(); hideAllOverlays(); beginRun(game.isDaily ? generateDaily(game.level.label.split('— ')[1]) : generatePad(game.padIndex)); });
  el('btnQuitMenu').addEventListener('click', () => { audio.click(); audio.stopThrust(); openMainMenu(); });

  el('btnNextPad').addEventListener('click', () => {
    audio.click();
    game.padIndex = Math.min(NUM_PADS - 1, game.padIndex + 1);
    hideAllOverlays();
    beginRun(generatePad(game.padIndex));
  });
  el('btnRetryPad').addEventListener('click', () => {
    audio.click();
    hideAllOverlays();
    beginRun(game.isDaily ? generateDaily(new Date().toISOString().slice(0, 10)) : generatePad(game.padIndex));
  });
  el('btnResultMenu').addEventListener('click', () => { audio.click(); openMainMenu(); });
  el('pauseBtn').addEventListener('click', () => openPause());
}
function openSettings() {
  el('sensSlider').value = game.settings.sensitivity;
  el('sensVal').textContent = game.settings.sensitivity.toFixed(1);
  el('volSlider').value = game.settings.volume;
  el('volVal').textContent = Math.round(game.settings.volume * 100) + '%';
  el('invertY').checked = game.settings.invertY;
  showOverlay('settingsMenu');
}
function closeSettings() {
  saveLocalSettings();
  if (game.state === 'paused') showOverlay('pauseMenu');
  else openMainMenu();
}

// ============================================================================
// BOOT
// ============================================================================
async function boot() {
  loadLocalSettings();
  initThree();
  initWorld();
  await loadProfileLanderAsset();
  wireUI();
  await empire.connect();
  await loadSave();
  applyHubSettings(game.settings);
  openMainMenu();
  requestAnimationFrame(animate);
  window.addEventListener('beforeunload', () => { if (game.playtimeSec > 0) empire.reportPlaytime(Math.floor(game.playtimeSec % 20)); });
}
boot();
