import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EmpireClient } from '../../shared/empire-sdk.js';

// ============================================================================
// CONSTANTS
// ============================================================================
const GAME_ID = 'spaceflight-explorer';
const SAVE_VERSION = 1;
const SECTOR_RADIUS = 900;
const STATION_DOCK_RANGE = 26;
const INTERACT_RANGE = 22;
const FIXED_DT = 1 / 60;

const DIFFICULTIES = {
  easy:   { label: 'CADET',      fuelDrainMul: 0.7, hullDamageMul: 0.6, resourceMul: 1.3, startFuel: 140, startHull: 140 },
  normal: { label: 'PILOT',      fuelDrainMul: 1.0, hullDamageMul: 1.0, resourceMul: 1.0, startFuel: 110, startHull: 100 },
  hard:   { label: 'VETERAN',    fuelDrainMul: 1.35, hullDamageMul: 1.5, resourceMul: 0.85, startFuel: 90,  startHull: 85 },
  challenge: { label: 'SEEDED CHALLENGE (no refuel)', fuelDrainMul: 1.15, hullDamageMul: 1.3, resourceMul: 1.0, startFuel: 100, startHull: 100, noRefuel: true },
};

// ============================================================================
// SEEDED RNG
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
function seedFromString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0);
}
function todaySeedString() {
  const d = new Date();
  return `${d.getFullYear()}${d.getMonth()+1}${d.getDate()}`;
}

// ============================================================================
// ACHIEVEMENTS
// ============================================================================
const ACHIEVEMENTS = [
  { id: 'first_ignition',   name: 'First Ignition',      desc: 'Fire your main engines for the first time.' },
  { id: 'first_ore',        name: 'Prospector',          desc: 'Mine your first resource node.' },
  { id: 'first_upgrade',    name: 'Wrench Time',         desc: 'Purchase your first ship upgrade.' },
  { id: 'first_dock',       name: 'Safe Harbor',         desc: 'Dock at a trade station.' },
  { id: 'sector_3',         name: 'Deep Space',          desc: 'Reach sector depth 3.' },
  { id: 'sector_5',         name: 'Frontier Runner',     desc: 'Reach sector depth 5.' },
  { id: 'sector_10',        name: 'Void Walker',         desc: 'Reach sector depth 10.' },
  { id: 'hull_critical',    name: 'Hairline Fracture',   desc: 'Survive with hull below 10%.' },
  { id: 'fuel_empty',       name: 'Dead Stick',          desc: 'Run completely out of fuel.' },
  { id: 'cargo_full',       name: 'Fully Loaded',        desc: 'Fill your cargo hold to capacity.' },
  { id: 'anomaly_scan',     name: 'Xenoarchaeologist',   desc: 'Scan a spatial anomaly.' },
  { id: 'max_engine',       name: 'Full Throttle',       desc: 'Max out the engine upgrade.' },
  { id: 'max_tank',         name: 'Long Haul',           desc: 'Max out the fuel tank upgrade.' },
  { id: 'max_cargo',        name: 'Freighter',           desc: 'Max out the cargo hold upgrade.' },
  { id: 'max_weapon',       name: 'Armed and Ready',     desc: 'Max out the weapon upgrade.' },
  { id: 'resources_1000',  name: 'Trader Baron',         desc: 'Collect a lifetime total of 1000 resources.' },
  { id: 'challenge_clear',  name: "Today's Gauntlet",    desc: 'Complete a seeded challenge run (reach sector 5, no refuel).' },
  { id: 'destroy_drone',    name: 'Hostile Neutralized', desc: 'Destroy a hazard drone with your weapon.' },
];

// ============================================================================
// AUDIO ENGINE (procedural WebAudio)
// ============================================================================
class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.musicGain = null; this.sfxGain = null;
    this.thrustOsc = null; this.thrustGain = null;
    this.volume = 0.7;
    this._musicTimer = null;
  }
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.22; this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.8; this.sfxGain.connect(this.master);
    this._startThrustBed();
    this._startMusic();
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _startThrustBed() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 200;
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(filt); filt.connect(gain); gain.connect(this.sfxGain);
    osc.start();
    this.thrustOsc = osc; this.thrustGain = gain; this.thrustFilt = filt;
  }
  setThrust(amount) { // 0..1
    if (!this.thrustGain) return;
    const t = this.ctx.currentTime;
    this.thrustGain.gain.setTargetAtTime(Math.min(0.18, amount * 0.18), t, 0.08);
    this.thrustFilt.frequency.setTargetAtTime(150 + amount * 500, t, 0.1);
  }
  beep(freq = 440, dur = 0.08, type = 'square', vol = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    osc.connect(g); g.connect(this.sfxGain);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  laser() { this.beep(880, 0.06, 'sawtooth', 0.12); }
  impact(strength = 1) { this.beep(90 - strength * 20, 0.25, 'triangle', Math.min(0.4, 0.15 + strength * 0.1)); }
  mine() { this.beep(220, 0.12, 'square', 0.1); }
  ui() { this.beep(660, 0.05, 'sine', 0.15); }
  achievement() {
    const t0 = this.ctx ? this.ctx.currentTime : 0;
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.15, 'sine', 0.2), i * 90));
  }
  alarm() { this.beep(220, 0.3, 'square', 0.25); }
  boom() { this.beep(50, 0.5, 'sawtooth', 0.35); }

  _startMusic() {
    // Sparse ambient arpeggio, deep space feel.
    const notes = [110, 130.8, 164.8, 196, 220, 164.8];
    let i = 0;
    const play = () => {
      if (!this.ctx) return;
      const f = notes[i % notes.length]; i++;
      const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
      const g = this.ctx.createGain(); g.gain.value = 0;
      osc.connect(g); g.connect(this.musicGain);
      const t = this.ctx.currentTime;
      g.gain.linearRampToValueAtTime(0.5, t + 1.2);
      g.gain.linearRampToValueAtTime(0, t + 3.4);
      osc.start(t); osc.stop(t + 3.6);
      this._musicTimer = setTimeout(play, 2200 + Math.random() * 1800);
    };
    play();
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

// ============================================================================
// GLOBAL GAME STATE
// ============================================================================
const game = {
  state: 'menu', // menu | playing | paused | dead
  difficulty: 'normal',
  seed: 0,
  seedLabel: '',
  rng: null,
  sectorIndex: 0,
  playtimeSec: 0,
  lifetimeResources: 0,
  achievements: new Set(),
  settings: { sensitivity: 1.0, volume: 0.7, invertY: false },
};

let ship = null;
let spaceKit = null;
const spaceAssetStatus = { loaded: false, attached: false, physics: false, error: '' };
window.__spaceAssetStatus = spaceAssetStatus;
let sector = null; // current sector object
let scene, camera, renderer, world, clock;
let hudCtx, minimapCtx;
let lastReportedPlaytime = 0;
let saveNoticeCooldown = 0;

// ============================================================================
// SETTINGS PERSISTENCE (local, independent of save slots)
// ============================================================================
function loadLocalSettings() {
  try {
    const raw = localStorage.getItem('sfx_explorer_settings');
    if (raw) Object.assign(game.settings, JSON.parse(raw));
  } catch {}
}
function saveLocalSettings() {
  try { localStorage.setItem('sfx_explorer_settings', JSON.stringify(game.settings)); } catch {}
}

// ============================================================================
// THREE.JS SCENE SETUP
// ============================================================================
function initThree() {
  const glCanvas = document.getElementById('gl');
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);

  scene.add(new THREE.AmbientLight(0x445577, 0.55));
  const sun = new THREE.DirectionalLight(0xffefd6, 1.4);
  sun.position.set(400, 300, 200);
  scene.add(sun);

  scene.add(makeStarfield());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const hudCanvas = document.getElementById('hud');
  hudCanvas.width = window.innerWidth; hudCanvas.height = window.innerHeight;
  window.addEventListener('resize', () => { hudCanvas.width = window.innerWidth; hudCanvas.height = window.innerHeight; });
  hudCtx = hudCanvas.getContext('2d');
  minimapCtx = document.getElementById('minimap').getContext('2d');
}

function makeStarfield() {
  const count = 4000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 3000 + Math.random() * 6000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);
    const c = 0.6 + Math.random() * 0.4;
    const tint = Math.random();
    col[i*3] = c * (tint > 0.8 ? 1 : 0.85);
    col[i*3+1] = c * (tint > 0.6 ? 0.95 : 0.85);
    col[i*3+2] = c * (tint < 0.3 ? 1 : 0.9);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: false });
  return new THREE.Points(geo, mat);
}

// procedural texture generator for planets
function planetTexture(rng, baseHue) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  const h1 = baseHue, h2 = (baseHue + 20 + rng()*30) % 360;
  g.addColorStop(0, `hsl(${h1},60%,${30+rng()*20}%)`);
  g.addColorStop(1, `hsl(${h2},55%,${15+rng()*15}%)`);
  ctx.fillStyle = g; ctx.fillRect(0,0,256,128);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `hsla(${(baseHue + rng()*60)%360},50%,${40+rng()*30}%,${0.15+rng()*0.3})`;
    const w = 20 + rng()*60, h = 4 + rng()*10;
    ctx.beginPath();
    ctx.ellipse(rng()*256, rng()*128, w, h, 0, 0, Math.PI*2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ============================================================================
// PHYSICS WORLD
// ============================================================================
function initPhysics() {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;
}

// ============================================================================
// SECTOR GENERATION
// ============================================================================
function generateSector(seed, index) {
  const rng = mulberry32(seed + index * 7919);
  const bodies = { planets: [], asteroids: [], anomalies: [], drones: [], station: null };

  // Station at origin-ish for first sector, otherwise offset
  const stationPos = new THREE.Vector3((rng()-0.5)*80, (rng()-0.5)*40, (rng()-0.5)*80);
  bodies.station = { position: stationPos };

  const planetCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < planetCount; i++) {
    const dist = 250 + rng() * SECTOR_RADIUS * 0.7;
    const ang = rng() * Math.PI * 2;
    const elev = (rng()-0.5) * 200;
    const pos = new THREE.Vector3(Math.cos(ang)*dist, elev, Math.sin(ang)*dist);
    bodies.planets.push({
      position: pos, radius: 22 + rng() * 55, hue: rng() * 360, seed: Math.floor(rng()*1e6),
      rotSpeed: (rng()-0.5) * 0.05,
    });
  }

  const asteroidCount = 14 + Math.floor(rng() * 14) + index * 2;
  for (let i = 0; i < asteroidCount; i++) {
    const dist = 40 + rng() * SECTOR_RADIUS;
    const ang = rng() * Math.PI * 2;
    const elev = (rng()-0.5) * 220;
    const pos = new THREE.Vector3(Math.cos(ang)*dist, elev, Math.sin(ang)*dist);
    const kind = rng() < 0.3 ? 'crystal' : (rng() < 0.55 ? 'gas' : 'ore');
    bodies.asteroids.push({
      position: pos, radius: 3 + rng() * 6, kind,
      resource: 20 + Math.floor(rng() * 40),
      maxResource: 0,
      seed: Math.floor(rng()*1e6),
      vel: new THREE.Vector3((rng()-0.5)*0.6, (rng()-0.5)*0.3, (rng()-0.5)*0.6),
      spin: new THREE.Vector3(rng()-0.5, rng()-0.5, rng()-0.5).normalize().multiplyScalar(0.2+rng()*0.4),
    });
  }
  bodies.asteroids.forEach(a => a.maxResource = a.resource);

  const anomalyCount = rng() < 0.7 ? 1 : 2;
  for (let i = 0; i < anomalyCount; i++) {
    const dist = 150 + rng() * SECTOR_RADIUS * 0.8;
    const ang = rng() * Math.PI * 2;
    const pos = new THREE.Vector3(Math.cos(ang)*dist, (rng()-0.5)*150, Math.sin(ang)*dist);
    bodies.anomalies.push({ position: pos, radius: 8, scanned: false, seed: Math.floor(rng()*1e6) });
  }

  if (index >= 2) {
    const droneCount = Math.min(6, index - 1 + Math.floor(rng()*2));
    for (let i = 0; i < droneCount; i++) {
      const dist = 100 + rng() * SECTOR_RADIUS * 0.6;
      const ang = rng() * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(ang)*dist, (rng()-0.5)*100, Math.sin(ang)*dist);
      bodies.drones.push({ position: pos, hp: 30 + index * 5, radius: 3.2, state: 'idle', fireCooldown: 0 });
    }
  }

  return { seed, index, rng, data: bodies, meshes: {}, objectiveTarget: 40 + index * 20, objectiveCollected: 0 };
}

function clearSectorVisuals() {
  if (!sector) return;
  for (const key of ['planets','asteroids','anomalies','drones']) {
    (sector.meshes[key] || []).forEach(m => { if (m.mesh) { scene.remove(m.mesh); } if (m.body) world.removeBody(m.body); });
  }
  if (sector.meshes.station) scene.remove(sector.meshes.station);
  sector.meshes = {};
}

function buildSectorVisuals(sec) {
  sec.meshes = { planets: [], asteroids: [], anomalies: [], drones: [] };
  const rng = sec.rng;

  // station
  const stGroup = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 3, 8), new THREE.MeshStandardMaterial({ color: 0x8fa8c0, metalness: 0.7, roughness: 0.35, emissive: 0x113355, emissiveIntensity: 0.4 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 0.8, 8, 24), new THREE.MeshStandardMaterial({ color: 0x4fd6ff, emissive: 0x1a6fa0, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.3 }));
  ring.rotation.x = Math.PI/2;
  stGroup.add(core, ring);
  const light = new THREE.PointLight(0x66ccff, 2, 60); stGroup.add(light);
  stGroup.position.copy(sec.data.station.position);
  scene.add(stGroup);
  sec.meshes.station = stGroup;

  sec.data.planets.forEach(p => {
    const tex = planetTexture(mulberry32(p.seed), p.hue);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 32, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    mesh.position.copy(p.position);
    scene.add(mesh);
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Sphere(p.radius) });
    body.position.copy(p.position);
    body.userData = { type: 'planet' };
    world.addBody(body);
    sec.meshes.planets.push({ mesh, body, data: p });
  });

  const asteroidGeoCache = {};
  sec.data.asteroids.forEach(a => {
    if (a.resource <= 0) return;
    const key = Math.round(a.radius*2);
    if (!asteroidGeoCache[key]) asteroidGeoCache[key] = new THREE.IcosahedronGeometry(a.radius, 0);
    const color = a.kind === 'crystal' ? 0x9fd0ff : a.kind === 'gas' ? 0xb0ffb8 : 0xc9a37a;
    const mesh = new THREE.Mesh(asteroidGeoCache[key], new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 }));
    mesh.position.copy(a.position);
    const rng2 = mulberry32(a.seed);
    const posAttr = mesh.geometry.attributes.position;
    if (!mesh.geometry.userData.jittered) {
      for (let i = 0; i < posAttr.count; i++) {
        const jx = (rng2()-0.5) * a.radius * 0.35;
        posAttr.setXYZ(i, posAttr.getX(i)+jx, posAttr.getY(i)+jx*0.6, posAttr.getZ(i)+jx*0.8);
      }
      posAttr.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.userData.jittered = true;
    }
    scene.add(mesh);
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Sphere(a.radius) });
    body.position.copy(a.position);
    body.userData = { type: 'asteroid', ref: a };
    world.addBody(body);
    sec.meshes.asteroids.push({ mesh, body, data: a });
  });

  sec.data.anomalies.forEach(an => {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(an.radius, 1), new THREE.MeshStandardMaterial({ color: 0xffd76b, emissive: 0xff9f2a, emissiveIntensity: 0.8, wireframe: false, transparent: true, opacity: 0.85 }));
    mesh.position.copy(an.position);
    scene.add(mesh);
    sec.meshes.anomalies.push({ mesh, data: an });
  });

  sec.data.drones.forEach(d => {
    const group = new THREE.Group();
    const body3 = new THREE.Mesh(new THREE.ConeGeometry(d.radius, d.radius*2, 6), new THREE.MeshStandardMaterial({ color: 0xff5555, emissive: 0x881111, emissiveIntensity: 0.6, flatShading: true }));
    body3.rotation.x = Math.PI/2;
    group.add(body3);
    group.position.copy(d.position);
    scene.add(group);
    const cbody = new CANNON.Body({ mass: 0, shape: new CANNON.Sphere(d.radius) });
    cbody.position.copy(d.position);
    cbody.userData = { type: 'drone', ref: d };
    world.addBody(cbody);
    sec.meshes.drones.push({ mesh: group, body: cbody, data: d });
  });
}

// ============================================================================
// SHIP
// ============================================================================
class Ship {
  constructor(diff) {
    this.diff = diff;
    this.upgrades = { engine: 0, tank: 0, cargo: 0, weapon: 0 };
    this.fuel = diff.startFuel; this.maxFuel = diff.startFuel;
    this.hull = diff.startHull; this.maxHull = diff.startHull;
    this.cargoCap = 40;
    this.cargo = { ore: 0, crystal: 0, gas: 0 };
    this.credits = 0;
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3(0, 0, 20);
    this.quaternion = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    this.dockCount = 0;
    this.destroyedDrones = 0;
    this.hasFiredEngine = false;
    this.hasRunOutOfFuel = false;

    this.body = new CANNON.Body({ mass: 8, shape: new CANNON.Sphere(1.6), linearDamping: 0.35, angularDamping: 0.85 });
    this.body.position.copy(this.position);

    this.mesh = this._buildMesh();
    this.thrusterLights = [];
    this.attachSpaceKit();
  }
  attachSpaceKit() {
    if (!spaceKit || this.mesh.userData.blenderAsset) return;
    const source = spaceKit.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || spaceKit.scene.getObjectByName('PLAYER_BODY');
    if (!source) { spaceAssetStatus.error = 'Spacecraft player asset missing'; return; }
    const asset = source.clone(true);
    asset.name = 'BLENDER_SPACECRAFT_ASSET';
    asset.scale.setScalar(2.4);
    asset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
    this.mesh.children.forEach((child) => { if (child !== this.engineGlow) child.visible = false; });
    this.mesh.add(asset);
    this.mesh.userData.blenderAsset = asset;
    spaceAssetStatus.attached = true;
  }
  _buildMesh() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 3.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xd7e6f5, metalness: 0.6, roughness: 0.35, emissive: 0x0a1a2a })
    );
    hull.rotation.x = Math.PI/2;
    g.add(hull);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 1.1), new THREE.MeshStandardMaterial({ color: 0x3a5a78, metalness: 0.5, roughness: 0.5 }));
    wing.position.z = 0.4;
    g.add(wing);
    const glow = new THREE.PointLight(0x4fd6ff, 0, 12);
    glow.position.z = 1.8;
    g.add(glow);
    this.engineGlow = glow;
    return g;
  }
  get maxSpeed() { return 55 + this.upgrades.engine * 10; }
  get thrustForce() { return 210 + this.upgrades.engine * 60; }
  get tankBonus() { return this.upgrades.tank * 40; }
  get cargoBonus() { return this.upgrades.cargo * 25; }
  get weaponDamage() { return 8 + this.upgrades.weapon * 6; }
  refreshDerivedStats() {
    const oldMax = this.maxFuel;
    this.maxFuel = this.diff.startFuel + this.tankBonus;
    this.fuel = Math.min(this.maxFuel, this.fuel + (this.maxFuel - oldMax > 0 ? (this.maxFuel - oldMax) : 0));
    this.cargoCap = 40 + this.cargoBonus;
  }
  totalCargo() { return this.cargo.ore + this.cargo.crystal + this.cargo.gas; }
}

function loadSpaceKit() {
  const GLTFLoader = window.THREE?.GLTFLoader;
  if (!GLTFLoader) { spaceAssetStatus.error = 'GLTFLoader unavailable'; return; }
  const loader = new GLTFLoader();
  Promise.all([
    fetch('../../assets/blender-kits/spaceflight-explorer/physics.json').then((r) => r.ok ? r.json() : null).catch(() => null),
    new Promise((resolve, reject) => loader.load('../../assets/blender-kits/spaceflight-explorer/spaceflight-explorer-kit.glb', resolve, undefined, reject)),
  ]).then(([physics, gltf]) => {
    spaceKit = gltf;
    spaceAssetStatus.loaded = true;
    spaceAssetStatus.physics = !!physics?.playerCollider;
    ship?.attachSpaceKit();
  }).catch((error) => { spaceAssetStatus.error = String(error?.message || error); });
}
loadSpaceKit();

// ============================================================================
// INPUT
// ============================================================================
const input = {
  keys: new Set(),
  mouseDX: 0, mouseDY: 0,
  mouseDown: false, rightDown: false,
  pointerLocked: false,
  gp: null,
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  input.keys.add(e.code);
  handleKeyAction(e.code);
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
document.addEventListener('mousemove', (e) => {
  if (input.pointerLocked) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
});
document.getElementById('gl').addEventListener('mousedown', (e) => {
  if (game.state !== 'playing') return;
  if (!input.pointerLocked) { document.getElementById('gl').requestPointerLock(); return; }
  if (e.button === 0) input.mouseDown = true;
  if (e.button === 2) input.rightDown = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; if (e.button === 2) input.rightDown = false; });
document.getElementById('gl').addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  input.pointerLocked = document.pointerLockElement === document.getElementById('gl');
  document.getElementById('pointerLockHint').classList.toggle('hidden', input.pointerLocked);
});

function handleKeyAction(code) {
  if (game.state === 'playing') {
    if (code === 'Escape') { openPause(); return; }
    if (code === 'KeyI' || code === 'Tab') { toggleInventory(); return; }
    if (code === 'KeyM') { toggleMap(); return; }
    if (code === 'KeyF') { tryDock(); return; }
    if (code === 'KeyE') { tryScanAnomaly(); return; }
    if (code === 'KeyR') { cycleTarget(); return; }
  } else if (game.state === 'paused') {
    if (code === 'Escape') { closePause(); return; }
  } else if (game.state === 'paused_station') {
    if (code === 'Escape' || code === 'KeyF') { closeStation(); return; }
  }
}

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  input.gp = pads && pads[0] ? pads[0] : null;
}

// ============================================================================
// HELPERS: overlays
// ============================================================================
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function showOnly(id) {
  ['mainMenu','newGameMenu','loadMenu','settingsMenu','pauseMenu','stationMenu','invMenu','mapMenu','gameOverMenu'].forEach(x => hide(x));
  if (id) show(id);
}

// ============================================================================
// TOASTS / ACHIEVEMENTS
// ============================================================================
function toast(text, cls) {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
async function unlockAchievement(id) {
  if (game.achievements.has(id)) return;
  game.achievements.add(id);
  const def = ACHIEVEMENTS.find(a => a.id === id);
  toast(`ACHIEVEMENT: ${def ? def.name : id}`);
  audio.achievement();
  try { await empire.unlockAchievement(id, 1); } catch {}
}

// ============================================================================
// DIFFICULTY / NEW GAME UI
// ============================================================================
function buildDiffGrid() {
  const grid = document.getElementById('diffGrid');
  grid.innerHTML = '';
  Object.entries(DIFFICULTIES).forEach(([key, d]) => {
    const btn = document.createElement('button');
    btn.className = 'btn'; btn.style.gridColumn = key === 'challenge' ? '1 / span 2' : '';
    btn.textContent = d.label;
    btn.dataset.key = key;
    btn.addEventListener('click', () => {
      [...grid.children].forEach(c => c.style.borderColor = '#3a7cbf');
      btn.style.borderColor = '#7fd4ff';
      game.difficulty = key;
      audio.ui();
    });
    grid.appendChild(btn);
  });
}

// ============================================================================
// GAME LIFECYCLE
// ============================================================================
function startNewGame(seedInput, difficultyOverride) {
  const diffKey = difficultyOverride || game.difficulty || 'normal';
  game.difficulty = diffKey;
  let seed;
  if (diffKey === 'challenge') {
    seed = seedFromString(todaySeedString());
    game.seedLabel = `Daily Challenge ${todaySeedString()}`;
  } else if (seedInput && seedInput.trim()) {
    seed = seedFromString(seedInput.trim());
    game.seedLabel = seedInput.trim();
  } else {
    seed = Math.floor(Math.random() * 1e9);
    game.seedLabel = String(seed);
  }
  game.seed = seed;
  game.sectorIndex = 0;
  game.playtimeSec = 0;
  game.lifetimeResources = 0;
  lastReportedPlaytime = 0;

  const diff = DIFFICULTIES[diffKey];
  if (ship && ship.mesh) scene.remove(ship.mesh);
  ship = new Ship(diff);
  world.bodies.slice().forEach(b => world.removeBody(b));
  world.addBody(ship.body);
  scene.add(ship.mesh);

  loadSector(0, true);
  game.state = 'playing';
  showOnly(null);
  show('hudRoot');
  audio.init();
  clock = new THREE.Clock();
  setObjectiveText();
  doSave('auto');
}

function loadSector(index, isFirst) {
  clearSectorVisuals();
  lockedTarget = null;
  game.sectorIndex = index;
  sector = generateSector(game.seed, index);
  buildSectorVisuals(sector);
  if (isFirst) {
    ship.body.position.set(0, 0, 30);
    ship.body.velocity.set(0,0,0);
  } else {
    // place ship near new station, drifting
    const sp = sector.data.station.position;
    ship.body.position.set(sp.x + 30, sp.y + 5, sp.z + 30);
    ship.body.velocity.set(0,0,0);
  }
  setObjectiveText();
}

function setObjectiveText() {
  const el = document.getElementById('objective');
  el.textContent = `SECTOR ${game.sectorIndex + 1} — Mine ${sector.objectiveTarget} resources, then dock & jump. (${Math.floor(sector.objectiveCollected)}/${sector.objectiveTarget})`;
}

// ============================================================================
// PAUSE / MENUS
// ============================================================================
function openPause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  showOnly('pauseMenu');
  document.exitPointerLock();
}
function closePause() {
  game.state = 'playing';
  showOnly(null); show('hudRoot');
  clock.getDelta();
}

function toggleInventory() {
  const isOpen = !document.getElementById('invMenu').classList.contains('hidden');
  if (isOpen) { showOnly(null); show('hudRoot'); return; }
  renderInventory();
  showOnly('invMenu');
}
function renderInventory() {
  const el = document.getElementById('invList');
  el.innerHTML = '';
  const rows = [
    ['Ore', Math.floor(ship.cargo.ore), '#c9a37a'],
    ['Crystal', Math.floor(ship.cargo.crystal), '#9fd0ff'],
    ['Gas', Math.floor(ship.cargo.gas), '#b0ffb8'],
  ];
  rows.forEach(([name, amt, color]) => {
    const d = document.createElement('div'); d.className = 'stat-line';
    d.innerHTML = `<span style="color:${color}">${name}</span><b>${amt}</b>`;
    el.appendChild(d);
  });
  const cap = document.createElement('div'); cap.className = 'stat-line';
  cap.innerHTML = `<span>Capacity</span><b>${Math.floor(ship.totalCargo())} / ${ship.cargoCap}</b>`;
  el.appendChild(cap);
  const eng = document.createElement('div'); eng.className = 'stat-line';
  eng.innerHTML = `<span>Engine Tier</span><b>${ship.upgrades.engine}</b>`;
  el.appendChild(eng);
  const wep = document.createElement('div'); wep.className = 'stat-line';
  wep.innerHTML = `<span>Weapon Tier</span><b>${ship.upgrades.weapon}</b>`;
  el.appendChild(wep);
}

function toggleMap() {
  const isOpen = !document.getElementById('mapMenu').classList.contains('hidden');
  if (isOpen) { showOnly(null); show('hudRoot'); return; }
  renderMap();
  showOnly('mapMenu');
}
function renderMap() {
  const el = document.getElementById('mapList');
  el.innerHTML = '';
  for (let i = 0; i <= game.sectorIndex + 1; i++) {
    const d = document.createElement('div'); d.className = 'stat-line';
    const label = i < game.sectorIndex ? 'Cleared' : i === game.sectorIndex ? 'Current' : 'Locked';
    d.innerHTML = `<span>Sector ${i+1}</span><b>${label}</b>`;
    el.appendChild(d);
  }
}

// ============================================================================
// DOCKING / STATION
// ============================================================================
function nearStation() {
  if (!sector) return false;
  return ship.body.position.distanceTo(sector.data.station.position) < STATION_DOCK_RANGE;
}
function tryDock() {
  if (!nearStation()) { toast('Too far from station'); return; }
  ship.dockCount++;
  ship.hull = ship.maxHull;
  if (!(ship.diff.noRefuel && ship.dockCount > 1)) {
    ship.fuel = ship.maxFuel;
  }
  unlockAchievement('first_dock');
  openStation();
  audio.ui();
}
function openStation() {
  game.state = 'paused_station';
  document.exitPointerLock();
  renderStation();
  showOnly('stationMenu');
}
function closeStation() {
  game.state = 'playing';
  showOnly(null); show('hudRoot');
}
const UPGRADE_DEFS = [
  { key: 'engine', name: 'Engine Thrust', cost: (t) => 15 + t * 20, costRes: 'ore', max: 5 },
  { key: 'tank',   name: 'Fuel Tank',     cost: (t) => 12 + t * 18, costRes: 'gas', max: 5 },
  { key: 'cargo',  name: 'Cargo Hold',    cost: (t) => 10 + t * 15, costRes: 'ore', max: 5 },
  { key: 'weapon', name: 'Weapon Array',  cost: (t) => 14 + t * 22, costRes: 'crystal', max: 5 },
];
function renderStation() {
  const stats = document.getElementById('stationStats');
  stats.innerHTML = '';
  const info = [
    ['Fuel', `${Math.round(ship.fuel)} / ${ship.maxFuel}`],
    ['Hull', `${Math.round(ship.hull)} / ${ship.maxHull}`],
    ['Cargo', `Ore ${Math.floor(ship.cargo.ore)} / Crystal ${Math.floor(ship.cargo.crystal)} / Gas ${Math.floor(ship.cargo.gas)}`],
  ];
  info.forEach(([k,v]) => { const d = document.createElement('div'); d.className='stat-line'; d.innerHTML = `<span>${k}</span><b>${v}</b>`; stats.appendChild(d); });
  if (ship.diff.noRefuel) {
    const warn = document.createElement('div'); warn.className = 'small'; warn.style.color = '#ff9f7f';
    warn.textContent = 'SEEDED CHALLENGE: no free refuel — manage fuel carefully.';
    stats.appendChild(warn);
  }

  const list = document.getElementById('upgradeList');
  list.innerHTML = '';
  UPGRADE_DEFS.forEach(def => {
    const tier = ship.upgrades[def.key];
    const maxed = tier >= def.max;
    const cost = def.cost(tier);
    const have = ship.cargo[def.costRes];
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.disabled = maxed || have < cost;
    btn.textContent = maxed
      ? `${def.name} — MAXED (Tier ${tier})`
      : `${def.name} — Tier ${tier}→${tier+1} (cost ${cost} ${def.costRes})`;
    btn.addEventListener('click', () => {
      if (ship.cargo[def.costRes] < cost || tier >= def.max) return;
      ship.cargo[def.costRes] -= cost;
      ship.upgrades[def.key]++;
      ship.refreshDerivedStats();
      unlockAchievement('first_upgrade');
      if (ship.upgrades[def.key] >= def.max) unlockAchievement(`max_${def.key}`);
      audio.ui();
      renderStation();
    });
    list.appendChild(btn);
  });

  const jumpFuelCost = 25 + game.sectorIndex * 3;
  document.getElementById('jumpCost').textContent = jumpFuelCost;
  document.getElementById('sectorDepth').textContent = game.sectorIndex + 1;
  const jumpBtn = document.getElementById('btnJump');
  const canJump = sector.objectiveCollected >= sector.objectiveTarget;
  jumpBtn.disabled = !canJump || ship.fuel < jumpFuelCost;
  jumpBtn.textContent = canJump ? 'JUMP TO NEXT SECTOR' : `MINE MORE RESOURCES (${Math.floor(sector.objectiveCollected)}/${sector.objectiveTarget})`;
}
document.getElementById('btnJump').addEventListener('click', () => {
  const jumpFuelCost = 25 + game.sectorIndex * 3;
  if (sector.objectiveCollected < sector.objectiveTarget || ship.fuel < jumpFuelCost) return;
  ship.fuel -= jumpFuelCost;
  const nextIndex = game.sectorIndex + 1;
  loadSector(nextIndex, false);
  closeStation();
  checkSectorAchievements(nextIndex);
  audio.ui();
});
function checkSectorAchievements(idx) {
  if (idx + 1 >= 3) unlockAchievement('sector_3');
  if (idx + 1 >= 5) { unlockAchievement('sector_5'); if (ship.diff.noRefuel) unlockAchievement('challenge_clear'); }
  if (idx + 1 >= 10) unlockAchievement('sector_10');
}

// ============================================================================
// ANOMALY SCAN
// ============================================================================
function tryScanAnomaly() {
  if (!sector) return;
  const near = sector.meshes.anomalies.find(a => !a.data.scanned && ship.body.position.distanceTo(a.data.position) < INTERACT_RANGE);
  if (!near) { toast('No anomaly in range'); return; }
  near.data.scanned = true;
  near.mesh.material.opacity = 0.2;
  const bonus = 10 + Math.floor(Math.random()*15);
  const gain = Math.min(bonus, Math.max(0, ship.cargoCap - ship.totalCargo()));
  ship.cargo.crystal += gain;
  game.lifetimeResources += gain;
  sector.objectiveCollected = Math.min(sector.objectiveTarget, sector.objectiveCollected + gain);
  setObjectiveText();
  toast(gain > 0 ? `Anomaly scanned: +${gain} crystal data` : 'Anomaly scanned — cargo hold full');
  unlockAchievement('anomaly_scan');
  audio.mine();
}

// ============================================================================
// TARGET LOCK (cycle)
// ============================================================================
let lockedTarget = null;
function cycleTarget() {
  if (!sector) return;
  const candidates = [...sector.meshes.asteroids, ...sector.meshes.drones]
    .filter(o => (o.data.hp === undefined ? o.data.resource > 0 : o.data.hp > 0));
  if (!candidates.length) { lockedTarget = null; return; }
  let idx = lockedTarget ? candidates.indexOf(lockedTarget) : -1;
  idx = (idx + 1) % candidates.length;
  lockedTarget = candidates[idx];
  audio.ui();
}

// ============================================================================
// MAIN LOOP
// ============================================================================
function shipForward() { return new THREE.Vector3(0,0,-1).applyQuaternion(ship.mesh.quaternion); }
function shipUp() { return new THREE.Vector3(0,1,0).applyQuaternion(ship.mesh.quaternion); }
function shipRight() { return new THREE.Vector3(1,0,0).applyQuaternion(ship.mesh.quaternion); }

function updateShipControl(dt) {
  const sens = game.settings.sensitivity;
  const invert = game.settings.invertY ? -1 : 1;
  let dx = input.mouseDX, dy = input.mouseDY;
  input.mouseDX = 0; input.mouseDY = 0;

  if (input.gp) {
    const gpx = deadzone(input.gp.axes[2]) , gpy = deadzone(input.gp.axes[3]);
    dx += gpx * 22; dy += gpy * 22;
  }
  const aimSlow = input.rightDown ? 0.4 : 1.0;
  const yaw = -dx * 0.0022 * sens * aimSlow;
  const pitch = -dy * 0.0022 * sens * aimSlow * invert;
  const q = ship.mesh.quaternion;
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yaw);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), pitch);
  q.multiply(qYaw).multiply(qPitch);
  ship.body.quaternion.copy(q);

  const thrustForce = ship.thrustForce;
  const fwd = shipForward(), up = shipUp(), right = shipRight();
  let thrustVec = new THREE.Vector3();
  let wantThrust = false;
  const K = input.keys;
  if (K.has('KeyW')) { thrustVec.add(fwd); wantThrust = true; }
  if (K.has('KeyS')) { thrustVec.addScaledVector(fwd, -0.6); wantThrust = true; }
  if (K.has('KeyA')) { thrustVec.addScaledVector(right, -1); wantThrust = true; }
  if (K.has('KeyD')) { thrustVec.addScaledVector(right, 1); wantThrust = true; }
  if (K.has('Space')) { thrustVec.add(up); wantThrust = true; }
  if (K.has('ControlLeft') || K.has('KeyC')) { thrustVec.addScaledVector(up, -1); wantThrust = true; }

  if (input.gp) {
    const mx = deadzone(input.gp.axes[0]), my = deadzone(input.gp.axes[1]);
    if (Math.abs(mx) > 0) { thrustVec.addScaledVector(right, mx); wantThrust = true; }
    if (Math.abs(my) > 0) { thrustVec.addScaledVector(fwd, -my); wantThrust = true; }
    if (input.gp.buttons[0]?.pressed) { thrustVec.add(up); wantThrust = true; }
    if (input.gp.buttons[1]?.pressed) { thrustVec.addScaledVector(up, -1); wantThrust = true; }
  }

  const boosting = (K.has('ShiftLeft') || (input.gp && input.gp.buttons[7]?.pressed)) && ship.fuel > 0;
  const boostMul = boosting ? 1.8 : 1.0;

  if (wantThrust && ship.fuel > 0) {
    if (thrustVec.lengthSq() > 0) thrustVec.normalize();
    const f = thrustVec.multiplyScalar(thrustForce * boostMul);
    ship.body.applyForce(new CANNON.Vec3(f.x, f.y, f.z), ship.body.position);
    const fuelUse = (wantThrust ? 6 : 0) * boostMul * ship.diff.fuelDrainMul * dt;
    ship.fuel = Math.max(0, ship.fuel - fuelUse);
    audio.setThrust(boosting ? 1 : 0.55);
    if (!ship.hasFiredEngine) { ship.hasFiredEngine = true; unlockAchievement('first_ignition'); }
  } else {
    audio.setThrust(0);
  }
  if (ship.fuel <= 0 && !ship.hasRunOutOfFuel) { ship.hasRunOutOfFuel = true; unlockAchievement('fuel_empty'); }

  // clamp max speed
  const vel = ship.body.velocity;
  const speed = vel.length();
  if (speed > ship.maxSpeed) {
    const s = ship.maxSpeed / speed;
    vel.x *= s; vel.y *= s; vel.z *= s;
  }

  ship.engineGlow.intensity = wantThrust && ship.fuel > 0 ? (boosting ? 3.5 : 1.8) : 0.1;

  // firing beam
  const firing = input.mouseDown || (input.gp && input.gp.buttons[2]?.pressed);
  updateBeam(dt, firing, fwd);
}
function deadzone(v) { return Math.abs(v) < 0.15 ? 0 : v; }

let beamLine = null;
function updateBeam(dt, firing, fwd) {
  if (!beamLine) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.9 });
    beamLine = new THREE.Line(geo, mat);
    beamLine.visible = false;
    scene.add(beamLine);
  }
  if (!firing || ship.fuel <= 0) { beamLine.visible = false; return; }
  const origin = ship.body.position;
  const dir = fwd.clone().normalize();
  const range = 60;
  // raycast against asteroids/drones
  let closest = null, closestDist = range;
  const targets = [...(sector?.meshes.asteroids || []), ...(sector?.meshes.drones || [])];
  for (const t of targets) {
    if (t.data.resource === 0 || t.data.hp === 0) continue;
    const rel = new THREE.Vector3(t.mesh.position.x - origin.x, t.mesh.position.y - origin.y, t.mesh.position.z - origin.z);
    const proj = rel.dot(dir);
    if (proj < 0 || proj > range) continue;
    const perp = rel.clone().sub(dir.clone().multiplyScalar(proj));
    const r = t.data.radius || 3;
    if (perp.length() < r + 1.2 && proj < closestDist) { closest = t; closestDist = proj; }
  }
  const end = origin.clone().addScaledVector(dir, closest ? closestDist : range);
  beamLine.geometry.setFromPoints([
    new THREE.Vector3(origin.x, origin.y - 0.3, origin.z),
    new THREE.Vector3(end.x, end.y, end.z),
  ]);
  beamLine.visible = true;
  beamLine.material.opacity = 0.5 + Math.random()*0.4;

  if (closest && Math.random() < 0.6) audio.mine();

  if (closest) {
    if (closest.data.hp !== undefined) {
      // drone
      closest.data.hp -= ship.weaponDamage * dt * 10;
      if (closest.data.hp <= 0) {
        scene.remove(closest.mesh); world.removeBody(closest.body);
        closest.data.hp = 0;
        ship.destroyedDrones++;
        unlockAchievement('destroy_drone');
        audio.boom();
        addShake(0.25);
      }
    } else {
      // asteroid mining
      const rate = 8 * dt;
      const take = Math.min(rate, closest.data.resource);
      closest.data.resource -= take;
      const gained = take * ship.diff.resourceMul;
      const capLeft = ship.cargoCap - ship.totalCargo();
      const actualGain = Math.min(gained, Math.max(0, capLeft));
      ship.cargo[closest.data.kind] += actualGain;
      game.lifetimeResources += actualGain;
      sector.objectiveCollected = Math.min(sector.objectiveTarget, sector.objectiveCollected + actualGain);
      if (ship.totalCargo() >= ship.cargoCap - 0.01) unlockAchievement('cargo_full');
      if (!ship._minedOnce) { ship._minedOnce = true; unlockAchievement('first_ore'); }
      if (game.lifetimeResources >= 1000) unlockAchievement('resources_1000');
      if (closest.data.resource <= 0) {
        scene.remove(closest.mesh); world.removeBody(closest.body);
      }
      setObjectiveText();
    }
  }
}

function updateDrones(dt) {
  if (!sector) return;
  sector.meshes.drones.forEach(d => {
    if (d.data.hp <= 0) return;
    const toShip = new THREE.Vector3().subVectors(ship.body.position, d.mesh.position);
    const dist = toShip.length();
    if (dist < 140) {
      toShip.normalize();
      d.mesh.position.addScaledVector(toShip, dt * 8);
      d.body.position.copy(d.mesh.position);
      d.mesh.lookAt(ship.body.position);
      d.data.fireCooldown -= dt;
      if (dist < 70 && d.data.fireCooldown <= 0) {
        d.data.fireCooldown = 1.6;
        const dmg = 4 * ship.diff.hullDamageMul;
        if (dist < 40) { ship.hull = Math.max(0, ship.hull - dmg); audio.impact(0.5); addShake(0.35); }
      }
    }
  });
}

function checkCollisions() {
  const sp = ship.body.position;
  const checkList = [...sector.meshes.planets, ...sector.meshes.asteroids];
  for (const t of checkList) {
    if (t.data.resource !== undefined && t.data.resource <= 0) continue; // mined-out rock, already despawned
    const r = (t.data.radius || 1) + 1.6;
    const d = sp.distanceTo(t.body.position);
    if (d < r) {
      const push = new CANNON.Vec3().copy(sp).vsub(t.body.position);
      const pushLen = push.length() || 1;
      push.scale((r - d + 0.1) / pushLen, push);
      ship.body.position.vadd(push, ship.body.position);
      const impactSpeed = ship.body.velocity.length();
      const dmg = Math.max(1, impactSpeed * 1.4) * ship.diff.hullDamageMul;
      ship.hull = Math.max(0, ship.hull - dmg);
      ship.body.velocity.scale(-0.3, ship.body.velocity);
      audio.impact(Math.min(1, impactSpeed / 20));
      addShake(Math.min(0.9, 0.15 + impactSpeed * 0.03));
      if (ship.hull > 0 && ship.hull < ship.maxHull * 0.1) unlockAchievement('hull_critical');
      if (ship.hull <= 0) triggerGameOver();
    }
  }
}

function triggerGameOver() {
  if (game.state === 'dead') return;
  game.state = 'dead';
  document.exitPointerLock();
  document.getElementById('gameOverStats').textContent =
    `Reached Sector ${game.sectorIndex+1} · Lifetime resources ${Math.floor(game.lifetimeResources)} · Playtime ${formatTime(game.playtimeSec)}`;
  showOnly('gameOverMenu');
  audio.boom();
  const unreported = game.playtimeSec - lastReportedPlaytime;
  if (unreported > 0) { lastReportedPlaytime = game.playtimeSec; empire.reportPlaytime(unreported).catch(() => {}); }
  doSave('auto');
}
function formatTime(sec) {
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return `${m}m ${s}s`;
}

function syncMeshFromBody() {
  ship.mesh.position.copy(ship.body.position);
  ship.mesh.quaternion.copy(ship.body.quaternion);
  sector.meshes.asteroids.forEach(a => {
    if (a.data.resource <= 0) return;
    a.mesh.position.copy(a.body.position);
    a.mesh.rotation.x += a.data.spin.x * FIXED_DT;
    a.mesh.rotation.y += a.data.spin.y * FIXED_DT;
  });
  sector.meshes.planets.forEach(p => { p.mesh.rotation.y += p.data.rotSpeed * FIXED_DT; });
  sector.meshes.anomalies.forEach(a => {
    a.mesh.rotation.y += 0.4 * FIXED_DT; a.mesh.rotation.x += 0.15 * FIXED_DT;
    a.mesh.position.y += Math.sin(performance.now()/600 + a.data.seed) * 0.01;
  });
  if (sector.meshes.station) sector.meshes.station.rotation.y += 0.15 * FIXED_DT;
}

let shakeMag = 0;
function addShake(amount) { shakeMag = Math.min(1.5, shakeMag + amount); }
function updateCamera(dt) {
  const back = new THREE.Vector3(0, 2.4, 7.5).applyQuaternion(ship.mesh.quaternion);
  camera.position.copy(ship.mesh.position).add(back);
  if (shakeMag > 0.001) {
    camera.position.x += (Math.random()-0.5) * shakeMag;
    camera.position.y += (Math.random()-0.5) * shakeMag;
    camera.position.z += (Math.random()-0.5) * shakeMag;
    shakeMag *= Math.pow(0.02, dt || FIXED_DT);
    if (shakeMag < 0.01) shakeMag = 0;
  }
  const lookTarget = ship.mesh.position.clone().add(shipForward().multiplyScalar(20));
  camera.up.copy(shipUp());
  camera.lookAt(lookTarget);
  camera.fov = input.rightDown ? 55 : 75;
  camera.updateProjectionMatrix();
}

function updateHud() {
  document.getElementById('fuelFill').style.width = `${Math.max(0,(ship.fuel/ship.maxFuel)*100)}%`;
  document.getElementById('hullFill').style.width = `${Math.max(0,(ship.hull/ship.maxHull)*100)}%`;
  document.getElementById('cargoFill').style.width = `${Math.min(100,(ship.totalCargo()/ship.cargoCap)*100)}%`;
  const hullFill = document.getElementById('hullFill');
  hullFill.style.background = ship.hull < ship.maxHull*0.25 ? '#ff5f5f' : '#4fd67a';
  const fuelFill = document.getElementById('fuelFill');
  fuelFill.style.background = ship.fuel < ship.maxFuel*0.2 ? '#ff9f4f' : '#4fd6ff';
  document.getElementById('boostFill').style.width = `${Math.min(100, (ship.fuel/ship.maxFuel)*100)}%`;

  const speed = ship.body.velocity.length();
  document.getElementById('speedo').innerHTML = `SPEED<br><b style="font-size:20px">${speed.toFixed(1)}</b> u/s`;
  document.getElementById('topHud').innerHTML = `SECTOR ${game.sectorIndex+1} &middot; ${DIFFICULTIES[game.difficulty].label}`;

  const dockPrompt = document.getElementById('dockPrompt');
  if (nearStation()) { dockPrompt.classList.remove('hidden'); dockPrompt.textContent = 'Press F to dock'; }
  else dockPrompt.classList.add('hidden');

  const ti = document.getElementById('targetInfo');
  if (lockedTarget && (lockedTarget.data.resource > 0 || lockedTarget.data.hp > 0)) {
    const d = ship.body.position.distanceTo(lockedTarget.mesh.position).toFixed(0);
    if (lockedTarget.data.hp !== undefined) ti.innerHTML = `TARGET: Hazard Drone<br>HP ${Math.max(0,lockedTarget.data.hp|0)} &middot; ${d}m`;
    else ti.innerHTML = `TARGET: ${lockedTarget.data.kind}<br>Resource ${Math.max(0,lockedTarget.data.resource|0)} &middot; ${d}m`;
  } else ti.innerHTML = '';

  drawMinimap();
}

function drawMinimap() {
  const ctx = minimapCtx; const w = 150, h = 150, cx = w/2, cy = h/2;
  ctx.clearRect(0,0,w,h);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx,cy,74,0,Math.PI*2); ctx.clip();
  ctx.fillStyle = 'rgba(4,10,18,0.4)'; ctx.fillRect(0,0,w,h);
  const scale = 74 / (SECTOR_RADIUS * 0.6);
  const sp = ship.body.position;
  const drawDot = (pos, color, r) => {
    const x = cx + (pos.x - sp.x) * scale;
    const y = cy + (pos.z - sp.z) * scale;
    if (x < -5 || x > w+5 || y < -5 || y > h+5) return;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  };
  sector.data.asteroids.forEach(a => { if (a.resource > 0) drawDot(a.position, '#c9a37a', 1.6); });
  sector.data.planets.forEach(p => drawDot(p.position, '#7fd4ff', 3));
  sector.data.drones.forEach(d => { if (d.hp > 0) drawDot(d.position, '#ff5555', 2.2); });
  drawDot(sector.data.station.position, '#4fd67a', 3.5);
  ctx.restore();
  // ship arrow
  ctx.save();
  ctx.translate(cx, cy);
  const fwd = shipForward();
  const ang = Math.atan2(fwd.x, fwd.z);
  ctx.rotate(-ang);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(4,5); ctx.lineTo(-4,5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#2a5a80'; ctx.beginPath(); ctx.arc(cx,cy,74,0,Math.PI*2); ctx.stroke();
}

let physAccumulator = 0;
function animate() {
  requestAnimationFrame(animate);
  pollGamepad();
  if (game.state === 'playing') {
    const dt = Math.min(0.05, clock.getDelta());
    physAccumulator += dt;
    while (physAccumulator >= FIXED_DT) {
      updateShipControl(FIXED_DT);
      world.step(FIXED_DT);
      updateDrones(FIXED_DT);
      checkCollisions();
      physAccumulator -= FIXED_DT;
    }
    syncMeshFromBody();
    updateCamera(dt);
    updateHud();

    game.playtimeSec += dt;
    if (game.playtimeSec - lastReportedPlaytime > 20) {
      const delta = game.playtimeSec - lastReportedPlaytime;
      lastReportedPlaytime = game.playtimeSec;
      empire.reportPlaytime(delta).catch(()=>{});
    }
  } else {
    clock && clock.getDelta();
  }
  renderer.render(scene, camera);
}

// ============================================================================
// SAVE / LOAD
// ============================================================================
function serializeGame() {
  return {
    seed: game.seed, seedLabel: game.seedLabel, difficulty: game.difficulty,
    sectorIndex: game.sectorIndex, playtimeSec: game.playtimeSec, lifetimeResources: game.lifetimeResources,
    achievements: [...game.achievements],
    ship: {
      fuel: ship.fuel, maxFuel: ship.maxFuel, hull: ship.hull, maxHull: ship.maxHull,
      cargo: ship.cargo, cargoCap: ship.cargoCap, upgrades: ship.upgrades,
      dockCount: ship.dockCount, destroyedDrones: ship.destroyedDrones,
      hasFiredEngine: ship.hasFiredEngine, hasRunOutOfFuel: ship.hasRunOutOfFuel, minedOnce: !!ship._minedOnce,
      position: [ship.body.position.x, ship.body.position.y, ship.body.position.z],
      quaternion: [ship.body.quaternion.x, ship.body.quaternion.y, ship.body.quaternion.z, ship.body.quaternion.w],
    },
    sectorObjective: { collected: sector.objectiveCollected, target: sector.objectiveTarget },
  };
}
function deserializeGame(blob) {
  game.seed = blob.seed; game.seedLabel = blob.seedLabel; game.difficulty = blob.difficulty;
  game.playtimeSec = blob.playtimeSec || 0;
  lastReportedPlaytime = game.playtimeSec;
  game.lifetimeResources = blob.lifetimeResources || 0;
  game.achievements = new Set(blob.achievements || []);

  const diff = DIFFICULTIES[game.difficulty] || DIFFICULTIES.normal;
  if (ship && ship.mesh) scene.remove(ship.mesh);
  ship = new Ship(diff);
  Object.assign(ship.upgrades, blob.ship.upgrades);
  ship.refreshDerivedStats();
  ship.fuel = blob.ship.fuel; ship.hull = blob.ship.hull;
  ship.cargo = blob.ship.cargo; ship.cargoCap = blob.ship.cargoCap;
  if (ship.hull <= 0) { ship.hull = ship.maxHull * 0.25; toast('Salvage crew patched your hull to 25%'); }
  ship.dockCount = blob.ship.dockCount || 0; ship.destroyedDrones = blob.ship.destroyedDrones || 0;
  ship.hasFiredEngine = blob.ship.hasFiredEngine; ship.hasRunOutOfFuel = blob.ship.hasRunOutOfFuel;
  ship._minedOnce = blob.ship.minedOnce;

  world.bodies.slice().forEach(b => world.removeBody(b));
  world.addBody(ship.body);
  scene.add(ship.mesh);

  loadSector(blob.sectorIndex, false);
  ship.body.position.set(...blob.ship.position);
  ship.body.quaternion.set(...blob.ship.quaternion);
  if (blob.sectorObjective) sector.objectiveCollected = blob.sectorObjective.collected;
  setObjectiveText();

  game.state = 'playing';
  showOnly(null); show('hudRoot');
  clock = new THREE.Clock();
}

async function doSave(slot) {
  const blob = serializeGame();
  const thumb = renderer.domElement.toDataURL('image/jpeg', 0.5);
  const meta = {
    label: `Sector ${game.sectorIndex+1} · ${DIFFICULTIES[game.difficulty].label}`,
    playtimeSec: Math.floor(game.playtimeSec),
    thumbnail: thumb,
    progress: Math.min(1, (game.sectorIndex+1) / 10),
    mode: game.difficulty,
    difficulty: game.difficulty,
    seed: game.seedLabel,
  };
  try {
    await empire.saveState(slot, blob, meta);
    toast('Game saved');
  } catch (e) { toast('Save failed'); }
}
async function doLoad(slot) {
  try {
    const record = await empire.loadState(slot);
    if (!record) { toast('No save in that slot'); return false; }
    deserializeGame(record.blob);
    return true;
  } catch (e) {
    toast('Load failed (incompatible save)');
    return false;
  }
}

// autosave every 60s while playing
setInterval(() => { if (game.state === 'playing') doSave('auto'); }, 60000);

// ============================================================================
// UI WIRING
// ============================================================================
document.querySelectorAll('.close-x').forEach(x => x.addEventListener('click', () => {
  const back = x.dataset.back;
  if (back) { showOnly(back); }
  else { showOnly(null); if (game.state === 'playing') show('hudRoot'); }
}));

document.getElementById('btnNewGame').addEventListener('click', () => { buildDiffGrid(); showOnly('newGameMenu'); });
document.getElementById('btnUseTodaySeed').addEventListener('click', () => {
  game.difficulty = 'challenge';
  document.getElementById('seedInput').value = todaySeedString();
  [...document.getElementById('diffGrid').children].forEach(c => { c.style.borderColor = c.dataset.key === 'challenge' ? '#7fd4ff' : '#3a7cbf'; });
});
document.getElementById('btnStartGame').addEventListener('click', () => {
  startNewGame(document.getElementById('seedInput').value, game.difficulty);
});
document.getElementById('btnContinue').addEventListener('click', async () => {
  const ok = await doLoad('auto');
  if (!ok) toast('No autosave found');
});
document.getElementById('btnLoadMenu').addEventListener('click', async () => {
  await renderSlotList();
  showOnly('loadMenu');
});
async function renderSlotList() {
  const el = document.getElementById('slotList');
  el.innerHTML = 'Loading…';
  let saves = [];
  try { saves = await empire.listSaves(); } catch {}
  el.innerHTML = '';
  const slots = ['auto','slot1','slot2','slot3','slot4','slot5'];
  slots.forEach(slot => {
    const rec = saves.find(s => s.slot === slot);
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = rec ? `${slot.toUpperCase()} — ${rec.meta.label} (${formatTime(rec.meta.playtimeSec||0)})` : `${slot.toUpperCase()} — empty`;
    btn.disabled = !rec;
    btn.addEventListener('click', async () => { const ok = await doLoad(slot); if (ok) showOnly(null); });
    el.appendChild(btn);
  });
}

document.getElementById('btnSettingsMenu').addEventListener('click', () => { openSettings('mainMenu'); });
document.getElementById('btnPauseSettings').addEventListener('click', () => { openSettings('pauseMenu'); });
let settingsReturnTo = 'mainMenu';
function openSettings(returnTo) {
  settingsReturnTo = returnTo;
  document.getElementById('sensSlider').value = game.settings.sensitivity;
  document.getElementById('volSlider').value = game.settings.volume;
  document.getElementById('invertY').checked = game.settings.invertY;
  document.getElementById('sensVal').textContent = game.settings.sensitivity.toFixed(2);
  document.getElementById('volVal').textContent = game.settings.volume.toFixed(2);
  showOnly('settingsMenu');
}
document.getElementById('sensSlider').addEventListener('input', (e) => {
  game.settings.sensitivity = parseFloat(e.target.value);
  document.getElementById('sensVal').textContent = game.settings.sensitivity.toFixed(2);
  saveLocalSettings();
});
document.getElementById('volSlider').addEventListener('input', (e) => {
  game.settings.volume = parseFloat(e.target.value);
  document.getElementById('volVal').textContent = game.settings.volume.toFixed(2);
  audio.setVolume(game.settings.volume);
  saveLocalSettings();
});
document.getElementById('invertY').addEventListener('change', (e) => { game.settings.invertY = e.target.checked; saveLocalSettings(); });
document.getElementById('btnSettingsDone').addEventListener('click', () => { showOnly(settingsReturnTo === 'mainMenu' ? 'mainMenu' : null); if (settingsReturnTo !== 'mainMenu') show('hudRoot'); });
document.getElementById('settingsClose').addEventListener('click', () => { showOnly(settingsReturnTo === 'mainMenu' ? 'mainMenu' : null); if (settingsReturnTo !== 'mainMenu') show('hudRoot'); });

document.getElementById('btnResume').addEventListener('click', closePause);
document.getElementById('btnSaveGame').addEventListener('click', () => doSave('slot1'));
document.getElementById('btnQuitToMenu').addEventListener('click', () => {
  game.state = 'menu';
  showOnly('mainMenu');
});

document.getElementById('stationClose').addEventListener('click', closeStation);
document.getElementById('invClose').addEventListener('click', () => { showOnly(null); show('hudRoot'); });
document.getElementById('mapClose').addEventListener('click', () => { showOnly(null); show('hudRoot'); });
document.getElementById('btnRestart').addEventListener('click', () => { showOnly('mainMenu'); game.state = 'menu'; });

// ============================================================================
// BOOT
// ============================================================================
async function boot() {
  loadLocalSettings();
  initThree();
  initPhysics();
  buildDiffGrid();
  await empire.connect().catch(() => {});
  clock = new THREE.Clock();
  animate();
}
boot();
