import { EmpireClient } from '../../shared/empire-sdk.js';

const THREE = window.THREE;
const loader = new THREE.GLTFLoader();
const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07152b);
scene.fog = new THREE.Fog(0x07152b, 16, 42);
const camera = new THREE.PerspectiveCamera(72, 1, .05, 80);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0x9ad9ff, 0x080914, 1.4));
const keyLight = new THREE.DirectionalLight(0x70dcff, 2.2);
keyLight.position.set(5, 10, 4); keyLight.castShadow = true; scene.add(keyLight);

const client = new EmpireClient({ gameId: 'neon-breach-fps', saveVersion: 2, onPause: () => pause(true), onResume: () => pause(false) });
const $ = (s) => document.querySelector(s);
const keys = new Set();
const state = { sector: 1, best: 0 };
let kit, physicsMeta, playerMesh, playerMixer, world, running = false, paused = false, ready = false;
let playerRadius = .45;
let yaw = 0, pitch = 0, last = performance.now(), lastShot = 0, playtime = 0;
let hp = 100, armor = 0, ammo = 24, reserve = 120, score = 0, shots = 0, hits = 0, tookDamage = false;
let enemies = [], pickups = [], walls = [], sectorTimer = null;

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function open(id) { ['menu', 'help', 'pause', 'result'].forEach((x) => $('#' + x).classList.toggle('hidden', x !== id)); }
function hud() { $('#hp').textContent = `HP ${Math.max(0, Math.ceil(hp))}`; $('#armor').textContent = `ARMOR ${Math.ceil(armor)}`; $('#ammo').textContent = `${ammo} / ${reserve}`; $('#score').textContent = `SCORE ${score}`; $('#objective').textContent = `SECTOR ${state.sector} · ${enemies.length} HOSTILES`; }
function mat(color, emissive = 0) { return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: .5, metalness: .25 }); }
function cloneNamed(name, fallbackColor) {
  const src = kit?.scene?.getObjectByName(name);
  if (src) return src.clone(true);
  return new THREE.Mesh(new THREE.BoxGeometry(.8, 1.4, .8), mat(fallbackColor, .4));
}
function buildWorld() {
  if (world) scene.remove(world);
  world = new THREE.Group(); scene.add(world); walls = []; enemies = []; pickups = [];
  const neon = mat(0x12365d, .4), wallMat = mat(0x101b37, .35);
  const addWall = (x, z, w, d) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), wallMat); o.position.set(x, 1.5, z); o.castShadow = true; o.receiveShadow = true; world.add(o); walls.push({ x, z, w, d }); };
  addWall(0, -10, 20, .5); addWall(0, 10, 20, .5); addWall(-10, 0, .5, 20); addWall(10, 0, .5, 20);
  for (let i = 0; i < state.sector + 2; i++) { const o = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 1.5), neon); o.position.set((i % 3) * 4 - 4, .9, -2 - Math.floor(i / 3) * 3); world.add(o); }
  const count = 3 + state.sector * 2;
  for (let i = 0; i < count; i++) {
    const enemy = new THREE.Group();
    const body = cloneNamed('OBSTACLE', 0xff2a68); body.scale.setScalar(state.sector === 5 && i === 0 ? 1.4 : .65); body.position.y = .9; enemy.add(body);
    enemy.position.set(-7 + (i % 4) * 4.5, 0, -6 + Math.floor(i / 4) * 3.5);
    const enemyBounds = new THREE.Box3().setFromObject(body);
    enemy.userData = { hp: state.sector === 5 && i === 0 ? 180 : 35 + state.sector * 5, boss: state.sector === 5 && i === 0, cooldown: Math.random(), dead: false, body, radius: Math.max(enemyBounds.max.x - enemyBounds.min.x, enemyBounds.max.z - enemyBounds.min.z) * .5 };
    world.add(enemy); enemies.push(enemy);
  }
  for (const [x, z, type] of [[-7, 7, 'med'], [7, 7, 'armor']]) {
    const item = new THREE.Mesh(new THREE.BoxGeometry(.55, .55, .55), mat(type === 'med' ? 0xff3860 : 0x35f6ff, 1));
    item.position.set(x, .5, z); item.userData.type = type; world.add(item); pickups.push(item);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, .08, 20), mat(0x08111f)); floor.position.y = -.04; world.add(floor);
}
function collides(x, z, radius = playerRadius, ignore = null) {
  if (walls.some((w) => Math.abs(x - w.x) < w.w / 2 + radius && Math.abs(z - w.z) < w.d / 2 + radius)) return true;
  return enemies.some((enemy) => !enemy.userData.dead && enemy !== ignore && Math.hypot(x - enemy.position.x, z - enemy.position.z) < radius + enemy.userData.radius);
}
function sweepMove(dx, dz) {
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / Math.max(.08, playerRadius * .35)));
  const stepX = dx / steps, stepZ = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (!collides(camera.position.x + stepX, camera.position.z, playerRadius)) camera.position.x += stepX;
    if (!collides(camera.position.x, camera.position.z + stepZ, playerRadius)) camera.position.z += stepZ;
  }
}
function fire() {
  if (!running || paused || performance.now() - lastShot < 115) return;
  lastShot = performance.now();
  if (ammo <= 0) return reload();
  ammo--; shots++; let best = null; let bestDist = Infinity;
  for (const enemy of enemies) {
    if (enemy.userData.dead) continue;
    const dx = enemy.position.x - camera.position.x, dz = enemy.position.z - camera.position.z;
    const dist = Math.hypot(dx, dz); const angle = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw)));
    if (angle < .1 && dist < bestDist) { best = enemy; bestDist = dist; }
  }
  if (best) { hits++; best.userData.hp -= best.userData.boss ? 16 : 25; best.userData.body.material?.emissive?.setHex(0xffffff); setTimeout(() => best.userData.body.material?.emissive?.setHex(0xff2a68), 70); if (window.RVKKOAudio) RVKKOAudio.cue('neon-breach-fps', 'impact'); if (best.userData.hp <= 0) { best.userData.dead = true; best.rotation.z = Math.PI / 2; score += best.userData.boss ? 1500 : 150; if (window.RVKKOAudio) RVKKOAudio.cue('neon-breach-fps', 'defeat'); } }
  if (window.RVKKOAudio) RVKKOAudio.cue('neon-breach-fps', 'weapon');
  hud();
  if (enemies.every((enemy) => enemy.userData.dead)) sectorTimer = setTimeout(winSector, 500);
}
function reload() { const amount = Math.min(24 - ammo, reserve); ammo += amount; reserve -= amount; if (window.RVKKOAudio) RVKKOAudio.cue('neon-breach-fps', 'reload'); hud(); }
function damage(amount) { tookDamage = true; const absorbed = Math.min(armor, amount); armor -= absorbed; hp -= amount - absorbed; if (window.RVKKOAudio) RVKKOAudio.cue('neon-breach-fps', 'impact'); if (hp <= 0) lose(); }
function update(dt) {
  playtime += dt; if (!playerMesh) return;
  const turn = (keys.has('q') ? -1 : 0) + (keys.has('e') ? 1 : 0); yaw += turn * dt * 2.2;
  const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const strafe = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const speed = dt * 3.2, dx = Math.cos(yaw) * forward * speed + Math.cos(yaw + Math.PI / 2) * strafe * speed, dz = Math.sin(yaw) * forward * speed + Math.sin(yaw + Math.PI / 2) * strafe * speed;
  sweepMove(dx, dz);
  playerMesh.position.set(camera.position.x, 0, camera.position.z);
  camera.rotation.set(pitch, yaw, 0);
  for (const enemy of enemies) {
    if (enemy.userData.dead) continue;
    const dx2 = camera.position.x - enemy.position.x, dz2 = camera.position.z - enemy.position.z, d = Math.hypot(dx2, dz2);
    enemy.userData.cooldown -= dt;
    if (d > 1.3) { const step = dt * .45; const nx = enemy.position.x + dx2 / d * step, nz = enemy.position.z + dz2 / d * step; if (!collides(nx, enemy.position.z, enemy.userData.radius, enemy)) enemy.position.x = nx; if (!collides(enemy.position.x, nz, enemy.userData.radius, enemy)) enemy.position.z = nz; }
    if (d < 3.8 && enemy.userData.cooldown <= 0) { enemy.userData.cooldown = enemy.userData.boss ? .45 : 1.05; damage(enemy.userData.boss ? 14 : 8); }
  }
  for (const item of [...pickups]) if (item.visible && item.position.distanceTo(camera.position) < 1) { if (item.userData.type === 'med') hp = Math.min(100, hp + 40); else armor = Math.min(100, armor + 50); item.visible = false; if (window.RVKKOAudio) RVKKOAudio.cue('neon-breach-fps', 'success'); }
  if (playerMixer) playerMixer.update(dt); hud();
}
function render() { renderer.render(scene, camera); }
function loop(now) { if (!running || paused) return; const dt = Math.min(.04, (now - last) / 1000); last = now; update(dt); render(); requestAnimationFrame(loop); }
function start(sector = state.sector) { if (!ready) return; clearTimeout(sectorTimer); state.sector = Math.max(1, Math.min(5, Number(sector) || 1)); hp = 100; armor = state.sector > 1 ? 25 : 0; ammo = 24; reserve = 120; score = shots = hits = 0; tookDamage = false; playtime = 0; camera.position.set(0, 1.6, 7); yaw = Math.PI; pitch = 0; buildWorld(); running = true; paused = false; $('#hud').classList.remove('hidden'); $('#touch').classList.toggle('hidden', !matchMedia('(pointer:coarse)').matches); open('none'); last = performance.now(); requestAnimationFrame(loop); if (window.RVKKOAudio) RVKKOAudio.speak('neon-breach-fps', `Sector ${state.sector} breach online`); }
function pause(on = true) { if (!running || paused === on) return; paused = on; open(on ? 'pause' : 'none'); if (!on) { last = performance.now(); requestAnimationFrame(loop); } }
async function winSector() { if (!running) return; running = false; state.best = Math.max(state.best, state.sector); const accuracy = shots ? hits / shots : 0; if (state.sector === 1) client.unlockAchievement('first-breach'); if (accuracy >= .7) client.unlockAchievement('deadeye'); if (!tookDamage) client.unlockAchievement('untouched'); if (state.sector === 5) client.unlockAchievement('overseer'); await save(); $('#hud').classList.add('hidden'); $('#resultTag').textContent = 'SECTOR SECURED'; $('#resultTitle').textContent = state.sector === 5 ? 'OVERSEER DESTROYED' : `BREACH ${state.sector} COMPLETE`; $('#resultText').textContent = `Score ${score} · Accuracy ${Math.round(accuracy * 100)}%`; $('#next').textContent = state.sector === 5 ? 'NEW CAMPAIGN' : 'NEXT SECTOR'; open('result'); if (window.RVKKOAudio) RVKKOAudio.speak('neon-breach-fps', 'Sector secured'); }
function lose() { if (!running) return; running = false; $('#hud').classList.add('hidden'); $('#resultTag').textContent = 'OPERATIVE DOWN'; $('#resultTitle').textContent = 'MISSION FAILED'; $('#resultText').textContent = `Score ${score}`; $('#next').textContent = 'RETRY'; open('result'); }
async function save() { await client.saveState('auto', { sector: Math.min(5, state.best + 1), best: state.best }, { label: `Sector ${Math.min(5, state.best + 1)}`, progress: state.best / 5, playtimeSec: Math.floor(playtime) }).catch(() => {}); client.setContinuePoint('auto', `Sector ${Math.min(5, state.best + 1)}`).catch(() => {}); client.reportPlaytime(Math.floor(playtime)).catch(() => {}); }
async function load() { const saved = await client.loadState('auto').catch(() => null); if (saved?.blob) Object.assign(state, saved.blob); $('#continue').classList.toggle('hidden', !saved); $('#best').textContent = `Campaign progress: ${state.best}/5 sectors`; }

addEventListener('keydown', (event) => { keys.add(event.key.toLowerCase()); if (event.code === 'Space') fire(); if (event.code === 'KeyR') reload(); if ((event.code === 'Escape' || event.code === 'KeyP') && running) pause(!paused); });
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
addEventListener('mousemove', (event) => { if (document.pointerLockElement === canvas && running && !paused) { yaw += event.movementX * .0025; pitch = THREE.MathUtils.clamp(pitch + event.movementY * .002, -1.25, 1.25); } });
canvas.addEventListener('click', () => { fire(); canvas.requestPointerLock?.(); });
$('[data-open="help"]').onclick = () => open('help'); $('[data-close]').onclick = () => open('menu'); $('#play').onclick = () => start(1); $('#continue').onclick = () => start(state.sector); $('#resume').onclick = () => pause(false); $('#restart').onclick = () => start(state.sector); $('#quit').onclick = async () => { await save(); running = false; open('menu'); load(); }; $('#next').onclick = () => start(state.sector >= 5 || !state.best ? 1 : state.sector + 1); $('#resultMenu').onclick = () => { open('menu'); load(); };

Promise.all([
  fetch('../../assets/blender-kits/neon-breach-fps/physics.json').then((response) => response.ok ? response.json() : null).catch(() => null),
  new Promise((resolve, reject) => loader.load('../../assets/blender-kits/neon-breach-fps/neon-breach-fps-kit.glb', resolve, undefined, reject))
]).then(([physics, gltf]) => {
  physicsMeta = physics; kit = gltf; playerMesh = cloneNamed('PLAYER_BODY', 0xff5b6e); playerMesh.position.set(0, 0, 7); playerMesh.scale.setScalar(.8); scene.add(playerMesh);
  const playerBounds = new THREE.Box3().setFromObject(playerMesh);
  playerRadius = Math.max(.2, physicsMeta?.playerCollider?.radius || Math.max(playerBounds.max.x - playerBounds.min.x, playerBounds.max.z - playerBounds.min.z) * .5);
  if (gltf.animations.length) { playerMixer = new THREE.AnimationMixer(playerMesh); playerMixer.clipAction(gltf.animations[0]).play(); }
  ready = true; $('#play').disabled = false; $('#play').textContent = 'BEGIN 3D OPERATION'; client.connect().then(load, load); render();
}).catch(() => { $('#play').disabled = true; $('#best').textContent = '3D kit failed to load.'; });
