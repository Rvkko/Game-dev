import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EmpireClient } from '../../shared/empire-sdk.js';

/* ============================== SDK ============================== */
const empire = new EmpireClient({ gameId: 'hex-tactics', saveVersion: 1 });
let sdkInit = null;

/* ============================== RNG ============================== */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 1779033703; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return (h ^ (h >>> 16)) >>> 0; }
function todaySeed() { const d = new Date(); return hashStr(`hex-daily-${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`); }

/* ============================== HEX MATH ============================== */
const HS = 1.05; // hex size
const HDIRS = [[1,-1,0],[1,0,-1],[0,1,-1],[-1,1,0],[-1,0,1],[0,-1,1]];
function axToCube(q, r) { return { x: q, z: r, y: -q - r }; }
function cubeDist(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)); }
function hexDist(q1, r1, q2, r2) { return cubeDist(axToCube(q1, r1), axToCube(q2, r2)); }
function hexNeighbors(q, r) { return HDIRS.map(([dx, , dz]) => [q + dx, r + dz]); }
function axKey(q, r) { return q + ',' + r; }
function hexToWorld(q, r, h) {
  const x = HS * Math.sqrt(3) * (q + r / 2);
  const z = HS * 1.5 * r;
  return new THREE.Vector3(x, h * 0.5, z);
}
function cubeLerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; }
function cubeRound(c) {
  let rx = Math.round(c.x), ry = Math.round(c.y), rz = Math.round(c.z);
  const dx = Math.abs(rx - c.x), dy = Math.abs(ry - c.y), dz = Math.abs(rz - c.z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}
function hexLine(q1, r1, q2, r2) {
  const a = axToCube(q1, r1), b = axToCube(q2, r2);
  const n = cubeDist(a, b);
  const out = [];
  for (let i = 0; i <= n; i++) { const c = cubeRound(cubeLerp(a, b, n === 0 ? 0 : i / n)); out.push([c.x, c.z]); }
  return out;
}

/* ============================== AUDIO ============================== */
const Audio_ = { ctx: null, master: null, musicGain: null, sfxGain: null, musicNodes: [], musicOn: true };
function initAudio() {
  Audio_.ctx = new (window.AudioContext || window.webkitAudioContext)();
  Audio_.master = Audio_.ctx.createGain(); Audio_.master.connect(Audio_.ctx.destination);
  Audio_.musicGain = Audio_.ctx.createGain(); Audio_.musicGain.gain.value = 0.5; Audio_.musicGain.connect(Audio_.master);
  Audio_.sfxGain = Audio_.ctx.createGain(); Audio_.sfxGain.gain.value = 0.7; Audio_.sfxGain.connect(Audio_.master);
}
function setVol(kind, v01) { if (kind === 'music') Audio_.musicGain.gain.value = v01; else Audio_.sfxGain.gain.value = v01; }
function beep(freq, dur, type = 'sine', gainv = 0.3, sweep = null, delay = 0) {
  if (!Audio_.ctx) return;
  const t0 = Audio_.ctx.currentTime + delay;
  const o = Audio_.ctx.createOscillator(); const g = Audio_.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t0 + dur);
  g.gain.setValueAtTime(gainv, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(Audio_.sfxGain); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noiseBurst(dur, gainv = 0.3, delay = 0, filterFreq = 1800) {
  if (!Audio_.ctx) return;
  const t0 = Audio_.ctx.currentTime + delay;
  const bufSize = Audio_.ctx.sampleRate * dur;
  const buf = Audio_.ctx.createBuffer(1, bufSize, Audio_.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const src = Audio_.ctx.createBufferSource(); src.buffer = buf;
  const f = Audio_.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = Audio_.ctx.createGain(); g.gain.setValueAtTime(gainv, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(Audio_.sfxGain); src.start(t0);
}
const SFX = {
  shot: () => { noiseBurst(0.12, 0.5, 0, 3200); beep(180, 0.08, 'square', 0.2, 60); },
  hit: () => { noiseBurst(0.15, 0.4, 0, 900); beep(140, 0.15, 'sawtooth', 0.25, 50); },
  crit: () => { noiseBurst(0.2, 0.55, 0, 1500); beep(320, 0.2, 'square', 0.3, 90); },
  miss: () => beep(600, 0.08, 'sine', 0.12, 800),
  death: () => { beep(200, 0.4, 'sawtooth', 0.3, 40); noiseBurst(0.3, 0.3, 0.05, 500); },
  heal: () => { beep(500, 0.2, 'sine', 0.2, 800); beep(700, 0.2, 'sine', 0.15, 1000, 0.1); },
  grenade: () => { noiseBurst(0.5, 0.6, 0, 400); beep(80, 0.5, 'sawtooth', 0.35, 30); },
  ui: () => beep(440, 0.06, 'sine', 0.15, 700),
  move: () => beep(220, 0.05, 'triangle', 0.08, 260),
  ach: () => { beep(523, 0.12, 'sine', 0.25); beep(659, 0.12, 'sine', 0.25, null, 0.1); beep(784, 0.2, 'sine', 0.25, null, 0.2); },
  win: () => { beep(523, 0.2, 'sine', 0.3); beep(659, 0.2, 'sine', 0.3, null, 0.15); beep(784, 0.2, 'sine', 0.3, null, 0.3); beep(1046, 0.35, 'sine', 0.3, null, 0.45); },
  lose: () => { beep(220, 0.4, 'sawtooth', 0.3, 100); beep(160, 0.5, 'sawtooth', 0.25, 60, 0.2); },
};
function startMusic() {
  if (!Audio_.ctx) return;
  stopMusic();
  const notes = [130.8, 155.6, 164.8, 196, 220];
  let i = 0;
  const play = () => {
    const f = notes[i % notes.length]; i++;
    const o = Audio_.ctx.createOscillator(); const g = Audio_.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    const t0 = Audio_.ctx.currentTime;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.18, t0 + 0.3); g.gain.linearRampToValueAtTime(0, t0 + 2.2);
    o.connect(g); g.connect(Audio_.musicGain); o.start(t0); o.stop(t0 + 2.3);
    Audio_.musicNodes.push(o);
  };
  play();
  Audio_.musicTimer = setInterval(play, 2400);
}
function stopMusic() { if (Audio_.musicTimer) clearInterval(Audio_.musicTimer); Audio_.musicNodes = []; }

/* ============================== THREE SETUP ============================== */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1420);
scene.fog = new THREE.Fog(0x0a1420, 25, 60);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
const camTarget = new THREE.Vector3(0, 0, 0);
let camDist = 18, camYaw = Math.PI * 0.25, camPitch = 0.85; // pitch: 0=horizon .. PI/2 = top-down

function updateCamera() {
  const x = camTarget.x + camDist * Math.sin(camPitch) * Math.sin(camYaw);
  const y = camTarget.y + camDist * Math.cos(camPitch);
  const z = camTarget.z + camDist * Math.sin(camPitch) * Math.cos(camYaw);
  camera.position.set(x, y, z);
  camera.lookAt(camTarget);
}
updateCamera();

const hemi = new THREE.HemisphereLight(0x8fbfff, 0x101820, 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
sun.position.set(20, 30, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30; sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
scene.add(sun); scene.add(sun.target);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

/* ============================== CANNON (ragdoll only) ============================== */
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
const ragdolls = []; // {body, mesh, life}
let profileCommanderAsset = null;
let profilePhysicsRadius = 0.7;
window.__hexAssetStatus = { loaded: false, attached: false, physics: false, error: '' };
async function loadProfileCommanderAsset() {
  const Loader = window.THREE?.GLTFLoader;
  if (!Loader) { window.__hexAssetStatus.error = 'GLTFLoader unavailable'; return; }
  try {
    const [physics, gltf] = await Promise.all([
      fetch('../../assets/blender-kits/hex-tactics/physics.json').then((r) => r.ok ? r.json() : null),
      new Promise((resolve, reject) => new Loader().load('../../assets/blender-kits/hex-tactics/hex-tactics-kit.glb', resolve, undefined, reject)),
    ]);
    const source = gltf.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || gltf.scene.getObjectByName('PLAYER_BODY');
    if (!source) throw new Error('profile commander asset missing');
    profileCommanderAsset = source.clone(true);
    profileCommanderAsset.name = 'BLENDER_COMMANDER_DETAIL';
    profileCommanderAsset.scale.setScalar(1.15);
    profileCommanderAsset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
    profilePhysicsRadius = physics?.playerCollider?.radius || profilePhysicsRadius;
    window.__hexAssetStatus.loaded = true;
    window.__hexAssetStatus.physics = !!physics?.playerCollider;
  } catch (error) { window.__hexAssetStatus.error = String(error?.message || error); }
}
// static floor so corpses land on the battlefield instead of falling forever
const ragdollFloor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
ragdollFloor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(ragdollFloor);

/* ============================== CAMERA CONTROL ============================== */
const keys = {};
let dragging = false, dragBtn = -1, lastX = 0, lastY = 0;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => { dragging = true; dragBtn = e.button; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', e => {
  if (dragging && (dragBtn === 0 || dragBtn === 2)) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    camYaw -= dx * 0.006;
    camPitch = clamp(camPitch - dy * 0.006, 0.25, 1.45); // mouse-up (dy<0) -> pitch decreases -> looking more from above->down => "look up" means tilt camera toward horizon; non-inverted mapping
    updateCamera();
  }
});
canvas.addEventListener('wheel', e => { camDist = clamp(camDist + e.deltaY * 0.01, 8, 34); updateCamera(); e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', e => { keys[e.code] = true; handleKeyDown(e); });
window.addEventListener('keyup', e => { keys[e.code] = false; });

function panCamera(dt) {
  let sprint = keys['ShiftLeft'] || keys['ShiftRight'] ? 2.0 : 1.0;
  const speed = 9 * sprint * dt;
  const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw)).normalize();
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  let mv = new THREE.Vector3();
  if (keys['KeyW']) mv.add(fwd);
  if (keys['KeyS']) mv.sub(fwd);
  if (keys['KeyD']) mv.add(right);
  if (keys['KeyA']) mv.sub(right);
  if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(speed); camTarget.add(mv); updateCamera(); }
  // gamepad
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (gp) {
    const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
    if (Math.abs(lx) > 0.15 || Math.abs(ly) > 0.15) {
      const mv2 = fwd.clone().multiplyScalar(-ly * speed).add(right.clone().multiplyScalar(lx * speed));
      camTarget.add(mv2); updateCamera();
    }
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    if (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15) {
      camYaw -= rx * 0.03; camPitch = clamp(camPitch - ry * 0.03, 0.25, 1.45); updateCamera();
    }
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ============================== GAME STATE ============================== */
const DIFF = {
  easy:      { enemyMult: 0.8, enemyHp: 0.85, enemyAcc: 0.9, waveScale: 0.85, label: 'Easy' },
  normal:    { enemyMult: 1.0, enemyHp: 1.0,  enemyAcc: 1.0, waveScale: 1.0,  label: 'Normal' },
  hard:      { enemyMult: 1.25, enemyHp: 1.15, enemyAcc: 1.08, waveScale: 1.15, label: 'Hard' },
  nightmare: { enemyMult: 1.55, enemyHp: 1.35, enemyAcc: 1.18, waveScale: 1.35, label: 'Nightmare' },
};
const CLASS_DEFS = {
  trooper: { name: 'Trooper', hp: 13, move: 4, range: 4, dmg: [3, 5], acc: 0.78, crit: 0.1, color: 0x4fb0ff, abilities: ['overwatch'] },
  sniper:  { name: 'Sniper',  hp: 9,  move: 3, range: 7, dmg: [5, 9], acc: 0.62, crit: 0.18, color: 0x8fe86b, abilities: ['aim', 'snipe'] },
  heavy:   { name: 'Heavy',   hp: 17, move: 3, range: 3, dmg: [4, 7], acc: 0.7,  crit: 0.08, color: 0xff8a4a, abilities: ['grenade', 'suppress'] },
  medic:   { name: 'Medic',   hp: 11, move: 4, range: 3, dmg: [2, 3], acc: 0.72, crit: 0.06, color: 0xffe36b, abilities: ['heal', 'shield'] },
};
const ABILITY_DEFS = {
  overwatch: { name: 'Overwatch', desc: 'Reaction shot vs enemies who move in range', cost: 1 },
  aim:       { name: 'Aim', desc: '+35% accuracy on next shot this turn', cost: 1 },
  snipe:     { name: 'Snipe', desc: 'No move, high dmg, +20% crit', cost: 1 },
  grenade:   { name: 'Grenade', desc: 'AoE dmg radius 1, ignores cover', cost: 1 },
  suppress:  { name: 'Suppress', desc: '-30% target accuracy until your next turn', cost: 1 },
  heal:      { name: 'Heal', desc: 'Restore 7 HP to an ally', cost: 1 },
  shield:    { name: 'Shield', desc: 'Grant 6 shield HP to an ally', cost: 1 },
};

let state = null; // full run state
let scene3d = { tiles: new Map(), units: new Map(), fxGroup: null };
let ui = {};
let uiState = { selectedUnitId: null, mode: 'idle', abilityPending: null, moveRange: null, atkRange: null };
let paused = false;
let dailySeed = todaySeed();
let audioStarted = false;

function newRunState(difficulty, seed, isDaily) {
  return {
    difficulty, seed, isDaily: !!isDaily,
    wave: 1, turn: 1, phase: 'player',
    squad: makeStartingSquad(),
    meta: { kills: 0, wins: 0 },
    achProg: {},
    log: [],
  };
}
function makeStartingSquad() {
  const roster = [
    { classType: 'trooper', name: 'Reyes' },
    { classType: 'sniper', name: 'Kade' },
    { classType: 'heavy', name: 'Brix' },
    { classType: 'medic', name: 'Solene' },
  ];
  return roster.map((r, i) => makeUnit('p' + i, 'player', r.classType, r.name, 1));
}
function makeUnit(id, team, classType, name, level) {
  const def = CLASS_DEFS[classType];
  const lvlMult = 1 + (level - 1) * 0.12;
  return {
    id, team, classType, name, level: level || 1, xp: 0,
    maxHp: Math.round(def.hp * lvlMult), hp: Math.round(def.hp * lvlMult),
    move: def.move, range: def.range, dmg: def.dmg.slice(), acc: def.acc,
    crit: def.crit, abilities: def.abilities.slice(),
    q: 0, r: 0, alive: true, acted: false, moved: false,
    aimBonus: 0, suppressed: 0, shieldHp: 0, overwatching: false, hasOverwatchedThisTurn: false,
  };
}
function xpForNext(level) { return 30 + (level - 1) * 25; }
function grantXp(u, amt) {
  if (u.team !== 'player') return;
  u.xp += amt;
  let leveled = false;
  while (u.xp >= xpForNext(u.level) && u.level < 8) {
    u.xp -= xpForNext(u.level); u.level++;
    const def = CLASS_DEFS[u.classType];
    u.maxHp = Math.round(def.hp * (1 + (u.level - 1) * 0.12));
    u.hp = u.maxHp;
    u.acc = Math.min(0.95, u.acc + 0.02);
    u.dmg = [u.dmg[0] + 1, u.dmg[1] + 1];
    leveled = true;
    logMsg(`${u.name} reached level ${u.level}!`);
    if (u.level >= 5) unlockAch('veteran');
  }
}

/* ============================== BOARD GEN ============================== */
const BOARD_R = 6;
function genBoard(seedNum, waveNum) {
  const rng = mulberry32(seedNum + waveNum * 7919);
  const tiles = new Map();
  for (let q = -BOARD_R; q <= BOARD_R; q++) {
    for (let r = -BOARD_R; r <= BOARD_R; r++) {
      if (hexDist(0, 0, q, r) > BOARD_R) continue;
      const d = hexDist(0, 0, q, r);
      const n = rng();
      let height = 0;
      if (n > 0.82) height = 2; else if (n > 0.55) height = 1;
      if (d <= 1) height = 0; // keep center clearer
      let blocked = false, cover = false;
      const n2 = rng();
      if (d > 1 && d < BOARD_R - 1) {
        if (n2 > 0.93) blocked = true;
        else if (n2 > 0.78) cover = true;
      }
      tiles.set(axKey(q, r), { q, r, height, blocked, cover, occupant: null });
    }
  }
  // Ensure spawn zones clear: player near q,r with r close to -BOARD_R, enemy near +BOARD_R
  const clearZone = (predicate) => {
    for (const t of tiles.values()) if (predicate(t)) { t.blocked = false; t.cover = false; t.height = Math.min(t.height, 1); }
  };
  clearZone(t => t.r <= -BOARD_R + 2);
  clearZone(t => t.r >= BOARD_R - 2);
  return tiles;
}
function tileAt(q, r) { return state.board.get(axKey(q, r)); }

/* ============================== BOARD MESH ============================== */
const hexGeoCache = new Map();
function hexGeo(h) {
  const key = h;
  if (hexGeoCache.has(key)) return hexGeoCache.get(key);
  const geo = new THREE.CylinderGeometry(HS * 0.96, HS * 0.96, 0.5 + h * 0.5, 6, 1);
  hexGeoCache.set(key, geo);
  return geo;
}
function biomeColor(t) {
  if (t.blocked) return 0x2a3038;
  if (t.height === 2) return 0x8a7d5a;
  if (t.height === 1) return 0x5d7a4a;
  return 0x3a6b3f;
}
function buildBoardMeshes() {
  const group = new THREE.Group(); group.name = 'board';
  scene3d.tiles.clear();
  for (const t of state.board.values()) {
    const geo = hexGeo(t.height);
    const mat = new THREE.MeshStandardMaterial({ color: biomeColor(t), roughness: 0.85, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    const pos = hexToWorld(t.q, t.r, 0); pos.y = (0.5 + t.height * 0.5) / 2 - 0.02;
    mesh.position.copy(pos);
    mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.userData = { q: t.q, r: t.r, isTile: true };
    group.add(mesh);
    scene3d.tiles.set(axKey(t.q, t.r), mesh);
    if (t.cover) {
      const wallGeo = new THREE.BoxGeometry(0.9, 0.6, 0.22);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.9 });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.copy(pos); wall.position.y = mesh.position.y + (0.5 + t.height * 0.5) / 2 + 0.3;
      wall.rotation.y = Math.random() * Math.PI;
      wall.castShadow = true; wall.receiveShadow = true;
      group.add(wall);
    }
    if (t.blocked) {
      const rockGeo = new THREE.ConeGeometry(0.55, 1.6, 5);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.8, flatShading: true });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.copy(pos); rock.position.y = mesh.position.y + (0.5 + t.height * 0.5) / 2 + 0.8;
      rock.castShadow = true;
      group.add(rock);
    }
  }
  scene.add(group);
  scene3d.boardGroup = group;

  // highlight overlay meshes reused
  scene3d.highlightGroup = new THREE.Group(); scene.add(scene3d.highlightGroup);
}
function clearBoardMeshes() {
  if (scene3d.boardGroup) scene.remove(scene3d.boardGroup);
  if (scene3d.highlightGroup) scene.remove(scene3d.highlightGroup);
}
function tileTopY(t) { return (0.5 + t.height * 0.5); }

/* ============================== UNIT MESH ============================== */
function buildUnitMesh(u) {
  const g = new THREE.Group();
  const color = u.team === 'player' ? CLASS_DEFS[u.classType].color : 0xd84a4a;
  const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.55, 4, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15 });
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.6; body.castShadow = true;
  g.add(body);
  const headGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe8c9a0, roughness: 0.7 });
  const head = new THREE.Mesh(headGeo, headMat); head.position.y = 1.05; head.castShadow = true;
  g.add(head);
  const ringGeo = new THREE.RingGeometry(0.42, 0.5, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: u.team === 'player' ? 0x3fd0ff : 0xff5b5b, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  g.add(ring);
  if (profileCommanderAsset && u.team === 'player') {
    const detail = profileCommanderAsset.clone(true);
    detail.name = 'BLENDER_PLAYER_UNIT_DETAIL';
    detail.scale.setScalar(0.8);
    detail.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
    g.add(detail);
    window.__hexAssetStatus.attached = true;
  }
  g.userData = { unitId: u.id, body, head, ring };
  return g;
}
function unitWorldPos(u) {
  const t = tileAt(u.q, u.r);
  const p = hexToWorld(u.q, u.r, 0);
  p.y = tileTopY(t);
  return p;
}
function placeUnitMesh(u) {
  let mesh = scene3d.units.get(u.id);
  if (!mesh) { mesh = buildUnitMesh(u); scene.add(mesh); scene3d.units.set(u.id, mesh); }
  mesh.position.copy(unitWorldPos(u));
  mesh.visible = u.alive;
}
function removeUnitMesh(u) {
  const mesh = scene3d.units.get(u.id);
  if (mesh) { scene.remove(mesh); scene3d.units.delete(u.id); }
}

/* ============================== PATHFINDING / LOS ============================== */
function reachableTiles(u) {
  const start = axKey(u.q, u.r);
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const frontier = [[u.q, u.r, 0]];
  while (frontier.length) {
    frontier.sort((a, b) => a[2] - b[2]);
    const [q, r, d] = frontier.shift();
    const cur = tileAt(q, r);
    for (const [nq, nr] of hexNeighbors(q, r)) {
      const nt = tileAt(nq, nr);
      if (!nt || nt.blocked || nt.occupant) continue;
      const hdiff = nt.height - cur.height;
      if (hdiff > 1) continue;
      const cost = 1 + Math.max(0, hdiff);
      const nd = d + cost;
      if (nd > u.move) continue;
      const key = axKey(nq, nr);
      if (!dist.has(key) || nd < dist.get(key)) {
        dist.set(key, nd); prev.set(key, axKey(q, r));
        frontier.push([nq, nr, nd]);
      }
    }
  }
  dist.delete(start);
  return { dist, prev };
}
function buildPath(prev, targetKey) {
  const path = [];
  let k = targetKey;
  while (k && prev.has(k)) { path.unshift(k); k = prev.get(k); }
  return path;
}
function hasLOS(q1, r1, q2, r2) {
  const line = hexLine(q1, r1, q2, r2);
  const t1 = tileAt(q1, r1), t2 = tileAt(q2, r2);
  const maxEndHeight = Math.max(t1.height, t2.height);
  for (let i = 1; i < line.length - 1; i++) {
    const [q, r] = line[i];
    const t = tileAt(q, r);
    if (!t) continue;
    if (t.blocked && t.height >= maxEndHeight - 0 + 1) return false;
    if (t.blocked) return false;
  }
  return true;
}
function tilesInRange(q, r, range) {
  const out = [];
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
      const nq = q + dq, nr = r + dr;
      const t = tileAt(nq, nr);
      if (t) out.push(t);
    }
  }
  return out;
}

/* ============================== COMBAT ============================== */
function rng() { return state.rngFn(); }
function computeHitChance(att, def) {
  const at = tileAt(att.q, att.r), dt = tileAt(def.q, def.r);
  let acc = att.acc + (att.aimBonus || 0);
  const dist = hexDist(att.q, att.r, def.q, def.r);
  acc -= Math.max(0, dist - att.range) * 0.15; // shouldn't normally exceed range
  if (at.height > dt.height) acc += 0.15;
  else if (at.height < dt.height) acc -= 0.15;
  if (dt.cover) acc -= 0.22;
  if (def.suppressed > 0) acc -= 0; // suppress affects the suppressed unit's own accuracy, handled elsewhere
  if (att.suppressed > 0) acc -= 0.3;
  const diffCfg = DIFF[state.difficulty];
  if (att.team === 'enemy') acc *= diffCfg.enemyAcc;
  return clamp(acc, 0.05, 0.95);
}
function rollDamage(att, ignoreCover, def) {
  const [lo, hi] = att.dmg;
  let dmg = lo + Math.floor(rng() * (hi - lo + 1));
  const isCrit = rng() < (att.crit + (att.critBonus || 0));
  if (isCrit) dmg = Math.round(dmg * 1.6);
  if (def && def.tileCover && !ignoreCover) dmg = Math.round(dmg * 0.75);
  return { dmg, isCrit };
}
function applyDamage(def, dmg) {
  let remaining = dmg;
  if (def.shieldHp > 0) { const absorb = Math.min(def.shieldHp, remaining); def.shieldHp -= absorb; remaining -= absorb; }
  def.hp = Math.max(0, def.hp - remaining);
  return def.hp <= 0;
}
function floatingDamage(unit, text, cls) {
  const mesh = scene3d.units.get(unit.id);
  if (!mesh) return;
  const v = mesh.position.clone(); v.y += 1.7;
  const proj = v.clone().project(camera);
  const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
  const y = (1 - (proj.y * 0.5 + 0.5)) * window.innerHeight;
  const el = document.createElement('div');
  el.className = 'dnum ' + (cls || '');
  el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  document.getElementById('dmgpop').appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function screenShake(amount) {
  const start = performance.now();
  const dur = 260;
  function step() {
    const t = (performance.now() - start) / dur;
    if (t >= 1) { updateCamera(); return; } // snap back to the orbit position so shake never drifts
    const s = amount * (1 - t);
    camera.position.x += (Math.random() - 0.5) * s * 0.1;
    camera.position.y += (Math.random() - 0.5) * s * 0.1;
    requestAnimationFrame(step);
  }
  step();
}
function spawnMuzzleFlash(pos) {
  const light = new THREE.PointLight(0xfff2b0, 4, 6);
  light.position.copy(pos); light.position.y += 1.3;
  scene.add(light);
  setTimeout(() => scene.remove(light), 90);
}
function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone().add(new THREE.Vector3(0, 1.3, 0)), to.clone().add(new THREE.Vector3(0, 1.0, 0))]);
  const mat = new THREE.LineBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  setTimeout(() => scene.remove(line), 90);
}
function spawnExplosion(pos, radius) {
  const geo = new THREE.SphereGeometry(0.3, 12, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff9040, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pos); mesh.position.y += 0.8;
  scene.add(mesh);
  const start = performance.now();
  function step() {
    const t = (performance.now() - start) / 500;
    if (t >= 1) { scene.remove(mesh); return; }
    mesh.scale.setScalar(1 + t * (radius * 3));
    mat.opacity = 0.85 * (1 - t);
    requestAnimationFrame(step);
  }
  step();
  const light = new THREE.PointLight(0xff9040, 6, 10);
  light.position.copy(pos); light.position.y += 1;
  scene.add(light); setTimeout(() => scene.remove(light), 260);
}

function ragdollUnit(u) {
  const mesh = scene3d.units.get(u.id);
  if (!mesh) return;
  const body = new CANNON.Body({ mass: 4, shape: new CANNON.Box(new CANNON.Vec3(profilePhysicsRadius * 0.4, profilePhysicsRadius * 0.7, profilePhysicsRadius * 0.4)) });
  body.position.set(mesh.position.x, mesh.position.y + 0.6, mesh.position.z);
  body.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6);
  body.velocity.set((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2);
  world.addBody(body);
  ragdolls.push({ body, mesh, life: 3.2 });
}

/* ============================== ACHIEVEMENTS / LOG ============================== */
function logMsg(text, cls) {
  const el = document.createElement('div');
  el.className = 'msg' + (cls ? ' ' + cls : '');
  el.textContent = text;
  ui.msglog.appendChild(el);
  setTimeout(() => el.remove(), 3400);
  while (ui.msglog.children.length > 4) ui.msglog.removeChild(ui.msglog.firstChild);
}
function unlockAch(id, progress) {
  empire.unlockAchievement(id, progress === undefined ? 1 : progress).then(r => {
    if (r && r.unlocked && !state.achProg[id + '_shown']) {
      state.achProg[id + '_shown'] = true;
      SFX.ach(); logMsg('Achievement: ' + id, 'ach');
    }
  }).catch(() => {});
}
function progAch(id, count, target) { unlockAch(id, Math.min(1, count / target)); }

/* ============================== SPAWN ENEMIES ============================== */
function spawnWave() {
  const cfg = DIFF[state.difficulty];
  const count = Math.min(8, Math.round((3 + Math.floor(state.wave * 0.7)) * cfg.enemyMult));
  const classes = ['trooper', 'sniper', 'heavy'];
  const enemies = [];
  for (let i = 0; i < count; i++) {
    const ct = classes[Math.floor(state.rngFn() * classes.length)];
    const level = 1 + Math.floor(state.wave / 3);
    const u = makeUnit('e' + state.wave + '_' + i, 'enemy', ct, 'Hostile ' + (i + 1), level);
    u.maxHp = Math.round(u.maxHp * cfg.enemyHp); u.hp = u.maxHp;
    enemies.push(u);
  }
  return enemies;
}
function placeUnitsOnBoard() {
  const spots = [];
  for (const t of state.board.values()) if (t.r <= -BOARD_R + 2 && !t.blocked) spots.push(t);
  shuffleArr(spots, state.rngFn);
  for (const u of state.squad) {
    if (!u.alive) continue;
    const t = spots.pop() || [...state.board.values()].find(tt => !tt.blocked && !tt.occupant);
    t.occupant = u.id; u.q = t.q; u.r = t.r;
  }
  const espots = [];
  for (const t of state.board.values()) if (t.r >= BOARD_R - 2 && !t.blocked) espots.push(t);
  shuffleArr(espots, state.rngFn);
  for (const u of state.enemies) {
    const t = espots.pop() || [...state.board.values()].find(tt => !tt.blocked && !tt.occupant);
    t.occupant = u.id; u.q = t.q; u.r = t.r;
  }
}
function shuffleArr(arr, rf) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rf() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }

/* ============================== MISSION SETUP ============================== */
function setupMission() {
  clearBoardMeshes();
  for (const mesh of scene3d.units.values()) scene.remove(mesh);
  scene3d.units.clear();
  state.board = genBoard(state.seed, state.wave);
  state.rngFn = mulberry32(state.seed + state.wave * 104729 + state.turn);
  state.enemies = spawnWave();
  for (const t of state.board.values()) t.occupant = null;
  for (const u of state.squad) { if (u.alive) { u.acted = false; u.moved = false; u.hasOverwatchedThisTurn = false; } }
  placeUnitsOnBoard();
  buildBoardMeshes();
  for (const u of state.squad) if (u.alive) placeUnitMesh(u);
  for (const u of state.enemies) placeUnitMesh(u);
  state.turn = 1; state.phase = 'player';
  state.missionKillsNoLoss = true;
  focusCameraOnSquad();
  renderHUD();
  logMsg(`Wave ${state.wave} — ${state.enemies.length} hostiles detected`);
  saveProgress(); // checkpoint at the start of every skirmish as well as at the end
}
function focusCameraOnSquad() {
  const alive = state.squad.filter(u => u.alive);
  if (!alive.length) return;
  const p = unitWorldPos(alive[0]);
  camTarget.copy(p); camTarget.y = 0;
  updateCamera();
}

/* ============================== TURN / SELECTION ============================== */
function allUnits() { return [...state.squad, ...state.enemies]; }
function unitById(id) { return allUnits().find(u => u.id === id); }
function playerUnitsAlive() { return state.squad.filter(u => u.alive); }
function enemyUnitsAlive() { return state.enemies.filter(u => u.alive); }

function selectUnit(id) {
  const u = unitById(id);
  if (!u || u.team !== 'player' || !u.alive) return;
  uiState.selectedUnitId = id;
  uiState.mode = 'idle'; uiState.abilityPending = null;
  showMoveRange(u);
  renderUnitInfo(u);
  renderAbilityBar(u);
  renderSquadBar();
}
function clearSelection() {
  uiState.selectedUnitId = null; uiState.mode = 'idle'; uiState.abilityPending = null;
  clearHighlights();
  document.getElementById('unitinfo').classList.add('hidden');
  ui.abilbar.innerHTML = '';
  renderSquadBar();
}
function clearHighlights() { scene3d.highlightGroup.clear(); }
function addHighlight(q, r, color, y) {
  const t = tileAt(q, r); if (!t) return;
  const geo = new THREE.RingGeometry(HS * 0.7, HS * 0.92, 6);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  const p = hexToWorld(q, r, 0); p.y = tileTopY(t) + (y || 0.02);
  mesh.position.copy(p); mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.PI / 6;
  scene3d.highlightGroup.add(mesh);
}
function showMoveRange(u) {
  clearHighlights();
  if (u.acted) { uiState.moveInfo = null; return; }
  const { dist, prev } = reachableTiles(u);
  uiState.moveInfo = { dist, prev };
  for (const key of dist.keys()) { const [q, r] = key.split(',').map(Number); addHighlight(q, r, 0x3fd0ff); }
  addHighlight(u.q, u.r, 0xffd76b);
}
function showAttackRange(u) {
  clearHighlights();
  const tiles = tilesInRange(u.q, u.r, u.range);
  for (const t of tiles) {
    if (t.occupant) {
      const target = unitById(t.occupant);
      if (target && target.team === 'enemy' && target.alive) addHighlight(t.q, t.r, 0xff5b5b, 0.04);
    }
  }
  addHighlight(u.q, u.r, 0xffd76b);
}

/* ============================== UNIT ACTIONS ============================== */
function moveUnitTo(u, path) {
  return new Promise(resolve => {
    let i = 0;
    function step() {
      // an Overwatch reaction shot can kill the mover part-way along the path
      if (i >= path.length || !u.alive) { resolve(); return; }
      const [q, r] = path[i].split(',').map(Number);
      const oldTile = tileAt(u.q, u.r); if (oldTile) oldTile.occupant = null;
      u.q = q; u.r = r;
      const newTile = tileAt(q, r); newTile.occupant = u.id;
      SFX.move();
      const mesh = scene3d.units.get(u.id);
      const target = unitWorldPos(u);
      const start = mesh.position.clone();
      const t0 = performance.now();
      function anim() {
        const t = clamp((performance.now() - t0) / 160, 0, 1);
        mesh.position.lerpVectors(start, target, t);
        if (t < 1) requestAnimationFrame(anim); else { i++; checkOverwatchTrigger(u); step(); }
      }
      anim();
    }
    step();
  });
}
function checkOverwatchTrigger(mover) {
  for (const ow of allUnits()) {
    if (!ow.alive || ow.team === mover.team || !ow.overwatching) continue;
    const dist = hexDist(ow.q, ow.r, mover.q, mover.r);
    if (dist <= ow.range && hasLOS(ow.q, ow.r, mover.q, mover.r)) {
      ow.overwatching = false;
      resolveAttack(ow, mover, { overwatch: true });
    }
  }
}
async function performMove(u, targetKey) {
  const path = buildPath(uiState.moveInfo.prev, targetKey);
  if (!path.length) return;
  await moveUnitTo(u, path);
  u.moved = true;
  if (u.hp <= 0) return;
  showAttackRangeOrEnd(u);
}
function showAttackRangeOrEnd(u) {
  clearHighlights();
  showMoveRange(u); // will show nothing if acted; refresh
  renderAbilityBar(u);
}
function resolveAttack(att, def, opts = {}) {
  opts = opts || {};
  const attT = tileAt(att.q, att.r);
  const defT = tileAt(def.q, def.r);
  const hitChance = opts.forceHit ? 1 : computeHitChance(att, def);
  const hit = rng() < hitChance;
  spawnMuzzleFlash(unitWorldPos(att));
  spawnTracer(unitWorldPos(att), unitWorldPos(def));
  SFX.shot();
  if (!hit) {
    floatingDamage(def, 'MISS', 'miss');
    logMsg(`${att.name} misses ${def.name}`);
    att.aimBonus = 0;
    return { hit: false };
  }
  const { dmg, isCrit } = rollDamage(att, opts.ignoreCover, { tileCover: defT.cover });
  const dead = applyDamage(def, dmg);
  floatingDamage(def, (isCrit ? 'CRIT ' : '') + dmg, isCrit ? 'crit' : '');
  if (isCrit) SFX.crit(); else SFX.hit();
  screenShake(isCrit ? 6 : 3);
  logMsg(`${att.name} ${isCrit ? 'crits' : 'hits'} ${def.name} for ${dmg}`);
  att.aimBonus = 0;
  if (opts.overwatch) unlockAch('overwatch-kill', dead ? 1 : 0.001);
  if (dead) killUnit(def, att, opts);
  return { hit: true, dmg, isCrit, dead };
}
function killUnit(u, killer, opts) {
  u.alive = false;
  const t = tileAt(u.q, u.r); if (t) t.occupant = null;
  logMsg(`${u.name} is down!`, 'kill');
  SFX.death();
  ragdollUnit(u);
  removeUnitMesh(u);
  if (killer && killer.team === 'player') {
    state.meta.kills++;
    progAch('century', state.meta.kills, 100);
    unlockAch('first-blood');
    grantXp(killer, 15);
    const kt = tileAt(killer.q, killer.r), dt0 = tileAt(u.q, u.r);
    if (kt.height > dt0.height) unlockAch('high-ground');
    if (opts && opts.snipe && hexDist(killer.q, killer.r, u.q, u.r) >= 6) unlockAch('sniper-elite');
    if (opts && opts.grenade) {
      opts.grenadeKillCount = (opts.grenadeKillCount || 0) + 1;
    }
  } else if (killer && killer.team === 'enemy') {
    state.missionKillsNoLoss = false;
  }
}

/* ============================== ABILITIES ============================== */
function useAbility(u, ability, targetUnit, targetTile) {
  if (ability === 'overwatch') { u.overwatching = true; u.acted = true; logMsg(`${u.name} on overwatch`); endUnitTurnUI(u); return; }
  if (ability === 'aim') { u.aimBonus = 0.35; u.acted = false; logMsg(`${u.name} takes aim`); renderAbilityBar(u); return; }
  if (ability === 'snipe') {
    if (!targetUnit) return;
    u.critBonus = 0.2;
    resolveAttack(u, targetUnit, { snipe: true });
    u.critBonus = 0; u.acted = true; endUnitTurnUI(u); return;
  }
  if (ability === 'grenade') {
    if (!targetTile) return;
    spawnExplosion(hexToWorld(targetTile.q, targetTile.r, 0).setY(tileTopY(targetTile)), 1);
    SFX.grenade(); screenShake(8);
    const targets = tilesInRange(targetTile.q, targetTile.r, 1);
    const opts = { grenade: true, ignoreCover: true, grenadeKillCount: 0 };
    for (const t of targets) {
      if (t.occupant) {
        const tu = unitById(t.occupant);
        if (tu && tu.alive) {
          const { dmg } = rollDamage(u, true);
          const dead = applyDamage(tu, dmg);
          floatingDamage(tu, dmg, '');
          logMsg(`Grenade hits ${tu.name} for ${dmg}`);
          if (dead) killUnit(tu, u, opts);
        }
      }
    }
    if (opts.grenadeKillCount >= 2) unlockAch('grenade-master');
    u.acted = true; endUnitTurnUI(u); return;
  }
  if (ability === 'suppress') {
    if (!targetUnit) return;
    targetUnit.suppressed = 1;
    logMsg(`${u.name} suppresses ${targetUnit.name}`);
    u.acted = true; endUnitTurnUI(u); return;
  }
  if (ability === 'heal') {
    if (!targetUnit) return;
    targetUnit.hp = Math.min(targetUnit.maxHp, targetUnit.hp + 7);
    floatingDamage(targetUnit, '+7', 'heal'); SFX.heal();
    logMsg(`${u.name} heals ${targetUnit.name}`);
    unlockAch('medic-touch');
    u.acted = true; endUnitTurnUI(u); return;
  }
  if (ability === 'shield') {
    if (!targetUnit) return;
    targetUnit.shieldHp = Math.max(targetUnit.shieldHp, 6);
    logMsg(`${u.name} shields ${targetUnit.name}`);
    u.acted = true; endUnitTurnUI(u); return;
  }
}
function endUnitTurnUI(u) {
  clearHighlights();
  renderSquadBar();
  document.getElementById('unitinfo').classList.add('hidden');
  ui.abilbar.innerHTML = '';
  uiState.selectedUnitId = null; uiState.mode = 'idle'; uiState.abilityPending = null;
  checkMissionEnd();
}

/* ============================== INPUT: TILE / UNIT CLICK ============================== */
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
canvas.addEventListener('click', e => {
  if (!state || paused || state.phase !== 'player') return;
  if (dragMoved) { dragMoved = false; return; }
  handleBoardClick(e);
});
let mouseDownPos = null, dragMoved = false;
canvas.addEventListener('mousedown', e => { mouseDownPos = [e.clientX, e.clientY]; dragMoved = false; });
canvas.addEventListener('mousemove', e => { if (mouseDownPos && (Math.abs(e.clientX - mouseDownPos[0]) > 4 || Math.abs(e.clientY - mouseDownPos[1]) > 4)) dragMoved = true; });
canvas.addEventListener('contextmenu', e => { e.preventDefault(); if (uiState.selectedUnitId) clearSelection(); });

function handleBoardClick(e) {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  const unitMeshes = [...scene3d.units.values()];
  const hitsUnits = raycaster.intersectObjects(unitMeshes, true);
  if (hitsUnits.length) {
    let obj = hitsUnits[0].object; while (obj && !obj.userData.unitId) obj = obj.parent;
    if (obj) { onUnitClicked(obj.userData.unitId); return; }
  }
  const tileMeshes = [...scene3d.tiles.values()];
  const hitsTiles = raycaster.intersectObjects(tileMeshes, false);
  if (hitsTiles.length) {
    const { q, r } = hitsTiles[0].object.userData;
    onTileClicked(q, r);
  }
}
function onUnitClicked(id) {
  const u = unitById(id);
  if (u.team === 'player' && u.alive) {
    if (uiState.abilityPending) {
      // targeting ally ability
      const sel = unitById(uiState.selectedUnitId);
      const abDef = uiState.abilityPending;
      if (['heal', 'shield'].includes(abDef) && u.team === 'player') { useAbility(sel, abDef, u, null); return; }
      return;
    }
    selectUnit(id); return;
  }
  if (u.team === 'enemy' && u.alive) {
    const sel = uiState.selectedUnitId && unitById(uiState.selectedUnitId);
    if (!sel) return;
    if (uiState.abilityPending) {
      const abDef = uiState.abilityPending;
      if (['snipe', 'suppress'].includes(abDef)) { useAbility(sel, abDef, u, null); return; }
      return;
    }
    if (sel.acted) return;
    const dist = hexDist(sel.q, sel.r, u.q, u.r);
    if (dist <= sel.range && hasLOS(sel.q, sel.r, u.q, u.r)) {
      resolveAttack(sel, u, {});
      sel.acted = true;
      endUnitTurnUI(sel);
    } else {
      logMsg('Target out of range or blocked');
    }
  }
}
function onTileClicked(q, r) {
  const sel = uiState.selectedUnitId && unitById(uiState.selectedUnitId);
  if (!sel) return;
  if (uiState.abilityPending === 'grenade') {
    const t = tileAt(q, r);
    if (t && hexDist(sel.q, sel.r, q, r) <= 4) useAbility(sel, 'grenade', null, t);
    return;
  }
  if (sel.moved || sel.acted) return;
  if (!uiState.moveInfo) return;
  const key = axKey(q, r);
  if (uiState.moveInfo.dist.has(key)) performMove(sel, key);
}

/* ============================== KEYBOARD ============================== */
function handleKeyDown(e) {
  if (e.code === 'Escape') { togglePause(); return; }
  if (e.code === 'Space') { e.preventDefault(); if (state && !paused && state.phase === 'player') endPlayerTurn(); return; }
  if (!state || paused || state.phase !== 'player') return;
  if (e.code === 'KeyE') {
    const sel = uiState.selectedUnitId && unitById(uiState.selectedUnitId);
    if (sel && !sel.acted && sel.abilities.length) pickAbility(sel, sel.abilities[0]);
    return;
  }
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    const idx = parseInt(e.code.slice(-1)) - 1;
    const sel = uiState.selectedUnitId && unitById(uiState.selectedUnitId);
    if (sel && sel.abilities[idx]) pickAbility(sel, sel.abilities[idx]);
  }
}

/* ============================== ABILITY BAR ============================== */
function pickAbility(u, ability) {
  if (u.acted) return;
  const needsTileTarget = ability === 'grenade';
  const needsUnitTarget = ['snipe', 'suppress', 'heal', 'shield'].includes(ability);
  if (ability === 'overwatch' || ability === 'aim') { useAbility(u, ability); return; }
  uiState.abilityPending = ability;
  clearHighlights();
  if (needsUnitTarget) {
    if (ability === 'heal' || ability === 'shield') {
      for (const p of playerUnitsAlive()) if (hexDist(u.q, u.r, p.q, p.r) <= u.range) addHighlight(p.q, p.r, 0x7dff9c);
    } else {
      for (const en of enemyUnitsAlive()) if (hexDist(u.q, u.r, en.q, en.r) <= u.range && hasLOS(u.q, u.r, en.q, en.r)) addHighlight(en.q, en.r, 0xff5b5b);
    }
  } else if (needsTileTarget) {
    for (const t of tilesInRange(u.q, u.r, 4)) addHighlight(t.q, t.r, 0xff9040, 0.04);
  }
}

/* ============================== ENEMY AI ============================== */
async function runEnemyTurn() {
  state.phase = 'enemy';
  renderHUD();
  for (const en of enemyUnitsAlive()) {
    if (!en.alive) continue;
    await enemyAct(en);
    await sleep(120);
  }
  for (const en of state.enemies) { en.acted = false; en.moved = false; }
  checkMissionEnd();
  if (state.phase === 'enemy') {
    state.phase = 'player'; state.turn++;
    for (const u of state.squad) if (u.alive) { u.acted = false; u.moved = false; u.aimBonus = 0; u.overwatching = false; }
    for (const en of state.enemies) if (en.alive) en.suppressed = Math.max(0, en.suppressed - 1);
    renderHUD();
  }
}
async function enemyAct(en) {
  const targets = playerUnitsAlive();
  if (!targets.length) return;
  let best = null, bestDist = Infinity;
  for (const t of targets) { const d = hexDist(en.q, en.r, t.q, t.r); if (d < bestDist) { bestDist = d; best = t; } }
  if (!best) return;
  if (bestDist <= en.range && hasLOS(en.q, en.r, best.q, best.r)) {
    resolveAttack(en, best, {});
    await sleep(300);
    return;
  }
  // move toward best target
  const { dist, prev } = reachableTiles(en);
  let bestKey = null, bestScore = Infinity;
  for (const key of dist.keys()) {
    const [q, r] = key.split(',').map(Number);
    const d = hexDist(q, r, best.q, best.r);
    if (d < bestScore) { bestScore = d; bestKey = key; }
  }
  if (bestKey) {
    const path = buildPath(prev, bestKey);
    await moveUnitTo(en, path);
    await sleep(150);
    if (hexDist(en.q, en.r, best.q, best.r) <= en.range && hasLOS(en.q, en.r, best.q, best.r)) {
      resolveAttack(en, best, {});
      await sleep(300);
    }
  }
}
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

/* ============================== TURN CONTROL ============================== */
function endPlayerTurn() {
  clearSelection();
  runEnemyTurn();
}

/* ============================== MISSION END ============================== */
function checkMissionEnd() {
  if (state.phase === 'ended') return;
  if (enemyUnitsAlive().length === 0) { state.phase = 'ended'; missionWin(); return; }
  if (playerUnitsAlive().length === 0) { state.phase = 'ended'; missionLose(); return; }
}
function missionWin() {
  SFX.win();
  state.meta.wins++;
  unlockAch('first-victory');
  if (state.missionKillsNoLoss) unlockAch('clean-sweep');
  if (state.wave >= 5) unlockAch('wave-5');
  if (state.difficulty === 'nightmare') unlockAch('nightmare-win');
  const lowHpSurvivor = playerUnitsAlive().some(u => u.hp / u.maxHp <= 0.2);
  if (lowHpSurvivor) unlockAch('clutch');
  if (state.isDaily) unlockAch('daily-challenge');
  for (const u of playerUnitsAlive()) grantXp(u, 25);
  saveProgress();
  showMissionEnd(true);
}
function missionLose() {
  SFX.lose();
  saveProgress();
  showMissionEnd(false);
}
function showMissionEnd(won) {
  document.getElementById('meTitle').textContent = won ? 'VICTORY' : 'SQUAD LOST';
  document.getElementById('meTitle').style.color = won ? '' : 'var(--bad)';
  document.getElementById('meSub').textContent = won
    ? `Wave ${state.wave} cleared. Squad advances to wave ${state.wave + 1}.`
    : `Your squad was wiped out on wave ${state.wave}.`;
  const survivors = playerUnitsAlive().length;
  document.getElementById('meStats').innerHTML =
    `<div>Survivors: ${survivors}/${state.squad.length}</div><div>Career kills: ${state.meta.kills}</div><div>Wins: ${state.meta.wins}</div>`;
  document.getElementById('btnMeContinue').classList.toggle('hidden', !won || state.isDaily);
  document.getElementById('btnMeRetry').classList.toggle('hidden', won);
  document.getElementById('missionEnd').classList.remove('hidden');
}

/* ============================== SAVE / LOAD ============================== */
function serializeState() {
  return {
    difficulty: state.difficulty, seed: state.seed, isDaily: state.isDaily,
    wave: state.wave, squad: state.squad.map(u => ({ ...u })), meta: state.meta,
  };
}
async function saveProgress() {
  if (state.isDaily) return;
  try {
    await empire.saveState('auto', serializeState(), { label: `Wave ${state.wave}`, playtimeSec: 0, progress: state.wave / 20, mode: 'campaign', difficulty: state.difficulty, seed: state.seed });
  } catch {}
}
async function tryLoadContinue() {
  try {
    const rec = await empire.loadState('auto');
    return rec ? rec.blob : null;
  } catch { return null; }
}

/* ============================== HUD RENDER ============================== */
function renderHUD() {
  document.getElementById('waveNum').textContent = state.wave;
  document.getElementById('turnNum').textContent = state.turn;
  document.getElementById('phaseLbl').textContent = state.phase === 'player' ? 'Your Turn' : (state.phase === 'enemy' ? 'Enemy Turn' : 'Mission Over');
  document.getElementById('diffLbl').textContent = DIFF[state.difficulty].label + (state.isDaily ? ' · Daily' : '');
  document.getElementById('enemiesLeft').textContent = 'Enemies: ' + enemyUnitsAlive().length;
  renderSquadBar();
}
function renderSquadBar() {
  const bar = ui.squadbar; bar.innerHTML = '';
  for (const u of state.squad) {
    const card = document.createElement('div');
    card.className = 'ucard' + (!u.alive ? ' dead' : '') + (u.id === uiState.selectedUnitId ? ' sel' : '') + (u.acted && u.alive ? ' acted' : '');
    card.innerHTML = `<div class="nm">${u.name}</div><div class="cls">Lv${u.level} ${CLASS_DEFS[u.classType].name}</div><div class="hpbar"><i style="width:${u.alive ? Math.max(0, u.hp / u.maxHp * 100) : 0}%"></i></div>`;
    if (u.alive) card.addEventListener('click', () => selectUnit(u.id));
    bar.appendChild(card);
  }
}
function renderUnitInfo(u) {
  const el = document.getElementById('unitinfo');
  el.classList.remove('hidden');
  el.innerHTML = `<div class="nm">${u.name}</div><div>${CLASS_DEFS[u.classType].name} · Lv${u.level}</div><div>HP ${u.hp}/${u.maxHp}${u.shieldHp ? ' (+' + u.shieldHp + ' shield)' : ''}</div><div>Move ${u.move} · Range ${u.range}</div><div>XP ${u.xp}/${xpForNext(u.level)}</div>`;
}
function renderAbilityBar(u) {
  const bar = ui.abilbar; bar.innerHTML = '';
  if (!u || u.team !== 'player' || !u.alive) return;
  const moveDone = u.moved;
  const attackBtn = document.createElement('button');
  attackBtn.className = 'abtn'; attackBtn.innerHTML = '<b>Attack</b><span>Click an enemy in range/LOS</span>';
  attackBtn.disabled = u.acted;
  attackBtn.onclick = () => { uiState.abilityPending = null; showAttackRange(u); };
  bar.appendChild(attackBtn);
  u.abilities.forEach((ab, i) => {
    const def = ABILITY_DEFS[ab];
    const btn = document.createElement('button');
    btn.className = 'abtn';
    btn.innerHTML = `<b>${def.name} (${i + 1})</b><span>${def.desc}</span>`;
    btn.disabled = u.acted;
    btn.onclick = () => pickAbility(u, ab);
    bar.appendChild(btn);
  });
  const endBtn = document.createElement('button');
  endBtn.className = 'abtn'; endBtn.innerHTML = '<b>Skip Unit</b><span>Mark acted without action</span>';
  endBtn.onclick = () => { u.acted = true; endUnitTurnUI(u); };
  bar.appendChild(endBtn);
}

/* ============================== ACHIEVEMENTS PANEL ============================== */
const ACH_LIST = [
  ['first-blood', 'First Blood', "Score your squad's first kill"],
  ['first-victory', 'Ground Secured', 'Win your first skirmish'],
  ['high-ground', 'High Ground', 'Kill an enemy while standing on elevated terrain'],
  ['sniper-elite', 'Sniper Elite', 'Snipe a kill at range 6+'],
  ['medic-touch', 'Combat Medic', 'Heal a squadmate mid-battle'],
  ['clean-sweep', 'Clean Sweep', 'Win without losing a unit'],
  ['overwatch-kill', "I've Got You Covered", 'Kill with an Overwatch reaction'],
  ['grenade-master', 'Fire in the Hole', 'Kill 2+ enemies with one grenade'],
  ['clutch', 'Clutch', 'Win with a unit at 20% HP or less'],
  ['veteran', 'Veteran', 'Get a unit to level 5'],
  ['wave-5', 'Deep Insertion', 'Reach wave 5 in one run'],
  ['nightmare-win', 'Nightmare Fuel', 'Win on Nightmare difficulty'],
  ['daily-challenge', 'Daily Grind', 'Complete a daily seeded challenge'],
  ['century', 'Century', '100 career kills'],
];
function renderAchPanel() {
  const list = document.getElementById('achList'); list.innerHTML = '';
  for (const [id, title, desc] of ACH_LIST) {
    const row = document.createElement('div'); row.className = 'achrow';
    row.innerHTML = `<div><div class="t">${title}</div><div class="d">${desc}</div></div>`;
    list.appendChild(row);
  }
}

/* ============================== MENU / FLOW ============================== */
let pickedDiff = 'normal';
function setupMenuHandlers() {
  document.getElementById('dailySeedLbl').textContent = String(dailySeed).slice(-6);
  document.querySelectorAll('#diffPick button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#diffPick button').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); pickedDiff = b.dataset.d; SFX.ui();
    });
  });
  document.getElementById('btnNewRun').onclick = () => { startAudioIfNeeded(); startNewRun(pickedDiff, hashStr('run-' + Date.now() + Math.random())); };
  document.getElementById('btnContinue').onclick = async () => {
    startAudioIfNeeded();
    const blob = await tryLoadContinue();
    if (blob) startFromSave(blob); else startNewRun(pickedDiff, hashStr('run-' + Date.now()));
  };
  document.getElementById('btnDaily').onclick = () => { startAudioIfNeeded(); startNewRun('normal', dailySeed, true); };
  document.getElementById('btnAch').onclick = () => { renderAchPanel(); document.getElementById('achPanel').classList.remove('hidden'); };
  document.getElementById('btnHelp').onclick = () => document.getElementById('help').classList.remove('hidden');
  document.getElementById('btnHelpClose').onclick = () => document.getElementById('help').classList.add('hidden');
  document.getElementById('btnAchClose').onclick = () => document.getElementById('achPanel').classList.add('hidden');
  document.getElementById('btnPauseHelp').onclick = () => document.getElementById('help').classList.remove('hidden');
  document.getElementById('btnPauseAch').onclick = () => { renderAchPanel(); document.getElementById('achPanel').classList.remove('hidden'); };
  document.getElementById('btnResume').onclick = () => togglePause();
  document.getElementById('btnQuit').onclick = () => { togglePause(); returnToMenu(); };
  document.getElementById('endturn').onclick = () => { if (!paused && state && state.phase === 'player') endPlayerTurn(); };
  document.getElementById('btnMeContinue').onclick = () => { document.getElementById('missionEnd').classList.add('hidden'); state.wave++; setupMission(); };
  document.getElementById('btnMeRetry').onclick = () => { document.getElementById('missionEnd').classList.add('hidden'); resetSquadHp(); setupMission(); };
  document.getElementById('btnMeMenu').onclick = () => { document.getElementById('missionEnd').classList.add('hidden'); returnToMenu(); };
  document.getElementById('volMusic').oninput = e => setVol('music', e.target.value / 100);
  document.getElementById('volSfx').oninput = e => setVol('sfx', e.target.value / 100);
}
function resetSquadHp() { for (const u of state.squad) { u.alive = true; u.hp = u.maxHp; } }
function startAudioIfNeeded() { if (!audioStarted) { audioStarted = true; initAudio(); startMusic(); } }
function startNewRun(diff, seed, isDaily) {
  state = newRunState(diff, seed, isDaily);
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  setupMission();
}
function startFromSave(blob) {
  state = newRunState(blob.difficulty, blob.seed, blob.isDaily);
  state.wave = blob.wave; state.meta = blob.meta || { kills: 0, wins: 0 };
  state.squad = blob.squad.map(u => ({ ...u, acted: false, moved: false }));
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  setupMission();
}
function returnToMenu() {
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  clearBoardMeshes();
  for (const mesh of scene3d.units.values()) scene.remove(mesh);
  scene3d.units.clear();
}
function togglePause() {
  if (!state || document.getElementById('menu').classList.contains('hidden') === false) return;
  paused = !paused;
  document.getElementById('pause').classList.toggle('hidden', !paused);
  if (paused && playtimeAccum > 0) {
    empire.reportPlaytime(Math.round(playtimeAccum)).catch(() => {});
    playtimeAccum = 0;
  }
}

/* ============================== PLAYTIME ============================== */
let playtimeAccum = 0;
setInterval(() => {
  const playing = state && document.getElementById('menu').classList.contains('hidden');
  if (!paused && playing) playtimeAccum += 1;
  if (playtimeAccum >= 30) { empire.reportPlaytime(30).catch(() => {}); playtimeAccum = 0; }
}, 1000);

/* ============================== RAGDOLL / PHYSICS STEP ============================== */
function stepRagdolls(dt) {
  world.step(1 / 60, dt, 3);
  for (let i = ragdolls.length - 1; i >= 0; i--) {
    const rd = ragdolls[i];
    rd.mesh.position.copy(rd.body.position);
    rd.mesh.quaternion.copy(rd.body.quaternion);
    rd.life -= dt;
    if (rd.life <= 0) { scene.remove(rd.mesh); world.removeBody(rd.body); ragdolls.splice(i, 1); }
  }
}

/* ============================== MAIN LOOP ============================== */
let lastT = performance.now();
let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!paused) {
    panCamera(dt);
    stepRagdolls(dt);
  }
  fpsFrames++; fpsTimer += dt;
  if (fpsTimer >= 0.5) { document.getElementById('fps').textContent = Math.round(fpsFrames / fpsTimer) + ' fps'; fpsFrames = 0; fpsTimer = 0; }
  renderer.render(scene, camera);
}

/* ============================== INIT ============================== */
async function init() {
  ui.squadbar = document.getElementById('squadbar');
  ui.abilbar = document.getElementById('abilbar');
  ui.msglog = document.getElementById('msglog');
  setupMenuHandlers();
  try { sdkInit = await empire.connect(); } catch { sdkInit = null; }
  await loadProfileCommanderAsset();
  document.getElementById('loading').classList.add('hidden');
  loop();
}
init();
