import { EmpireClient } from './empire-sdk.js'

const $ = (id) => document.getElementById(id)
const canvas = $('game'), ctx = canvas.getContext('2d')
const gameId = document.body.dataset.game
const client = new EmpireClient({ gameId, saveVersion: 1, onPause: () => setPaused(true), onResume: () => setPaused(false) })
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rand = (a, b) => a + Math.random() * (b - a)
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
let W = 0, H = 0, mode = null, running = false, paused = false, last = performance.now(), playSeconds = 0

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1)
  W = innerWidth; H = innerHeight
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
addEventListener('resize', resize); resize()

function show(id) { $(id).classList.remove('hidden') }
function hide(id) { $(id).classList.add('hidden') }
function setPaused(value) {
  if (!running) return
  paused = value
  $('pause').textContent = paused ? 'Resume' : 'Pause'
  $('status').textContent = paused ? 'Paused' : mode.status()
}
function unlock(id, progress = 1) { client.unlockAchievement(id, progress).catch(() => {}) }
function setTools() {
  const root = $('tools'); root.innerHTML = ''
  for (const item of mode.tools()) {
    const button = document.createElement('button')
    button.textContent = item.label
    button.classList.toggle('active', !!item.active)
    button.disabled = !!item.disabled
    button.onclick = () => { item.run(); setTools() }
    root.appendChild(button)
  }
}
function startGame() {
  mode = createMode(gameId)
  mode.reset(); running = true; paused = false; playSeconds = 0
  hide('menu'); hide('result'); $('hud').hidden = false; $('pause').textContent = 'Pause'
  setTools(); canvas.focus()
}
function finish(won, title, text) {
  if (!running) return
  running = false; paused = false; $('hud').hidden = true
  $('resultTitle').textContent = title
  $('resultText').textContent = text
  show('result')
  const score = Math.round(mode.score())
  client.saveState('auto', { score, finishedAt: Date.now(), game: gameId }, { label: title, progress: score }).catch(() => {})
  if (won) unlock('victory')
}

$('play').onclick = startGame
$('again').onclick = startGame
$('home').onclick = () => { hide('result'); show('menu') }
$('how').onclick = () => { hide('menu'); show('help') }
document.querySelector('[data-close]').onclick = () => { hide('help'); show('menu') }
$('pause').onclick = () => setPaused(!paused)

function point(event) {
  const r = canvas.getBoundingClientRect()
  return { x: event.clientX - r.left, y: event.clientY - r.top }
}
canvas.addEventListener('pointerdown', (e) => { if (running && !paused) mode.pointer('down', point(e), e) })
canvas.addEventListener('pointermove', (e) => { if (running && !paused && e.buttons) mode.pointer('move', point(e), e) })
canvas.addEventListener('pointerup', (e) => { if (running && !paused) mode.pointer('up', point(e), e) })
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
  if (e.code === 'Escape') return setPaused(!paused)
  if (e.code === 'Space' && running && mode.spacePause) return setPaused(!paused)
  if (running && !paused) mode.key(e.code, true)
})
addEventListener('keyup', (e) => { if (running && !paused) mode.key(e.code, false) })

function frame(now) {
  const dt = Math.min(.04, (now - last) / 1000); last = now
  if (running && !paused) {
    mode.update(dt); playSeconds += dt
    $('status').textContent = mode.status(); $('stats').textContent = mode.stats()
  }
  ctx.clearRect(0, 0, W, H)
  if (mode) mode.draw(ctx, W, H)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
setInterval(() => { if (running) client.reportPlaytime(60).catch(() => {}) }, 60000)
client.connect().catch(() => {})

function createMode(id) {
  if (id === 'alien-colony') return colonyMode()
  if (id === 'ecosystem-sandbox') return ecosystemMode()
  if (id === 'ragdoll-toss') return ragdollMode()
  return towerMode()
}

function colonyMode() {
  const defs = {
    farm: { label: 'Farm', cost: 12, color: '#55d67a' }, mine: { label: 'Mine', cost: 10, color: '#c7a76d' },
    solar: { label: 'Solar', cost: 8, color: '#55b8ff' }, habitat: { label: 'Habitat', cost: 18, color: '#d8d4ca' },
    turret: { label: 'Turret', cost: 15, color: '#ff7a7a' }
  }
  let g
  const api = {
    reset() {
      g = { cols: 12, rows: 8, selected: 'farm', buildings: [{ x: 5, y: 3, type: 'command' }], materials: 45, food: 30, pop: 4, wave: 0, raidIn: 18, growIn: 30, time: 0, message: 'Colony pod online' }
      unlock('touchdown'); setTools()
    },
    tools() {
      return Object.entries(defs).map(([id, d]) => ({ label: `${d.label} ${d.cost}`, active: g.selected === id, run: () => { g.selected = id } }))
    },
    pointer(_type, p) {
      if (_type !== 'down') return
      const top = 78, cw = W / g.cols, ch = Math.max(36, (H - top) / g.rows)
      const x = Math.floor(p.x / cw), y = Math.floor((p.y - top) / ch), d = defs[g.selected]
      if (y < 0 || y >= g.rows || g.buildings.some(b => b.x === x && b.y === y)) return
      if (g.materials < d.cost) { g.message = `Need ${d.cost - Math.floor(g.materials)} more materials`; return }
      g.materials -= d.cost; g.buildings.push({ x, y, type: g.selected }); g.message = `${d.label} constructed`
      unlock('first-build'); if (g.selected === 'solar') unlock('power-up'); if (g.selected === 'farm') unlock('green-thumb')
    },
    key() {},
    update(dt) {
      g.time += dt; g.raidIn -= dt; g.growIn -= dt
      const count = (type) => g.buildings.filter(b => b.type === type).length
      const power = 8 + count('solar') * 8 - count('farm') - count('mine') - count('turret') * 2 - count('habitat') * 2
      if (power >= 0) { g.food += count('farm') * .32 * dt; g.materials += count('mine') * .23 * dt }
      g.food -= g.pop * .025 * dt
      if (g.food <= 0) { g.food = 0; if (Math.random() < dt * .2) g.pop-- }
      if (g.growIn <= 0) {
        g.growIn = 28
        if (count('habitat') && g.food > g.pop * 3 && g.pop < 4 + count('habitat') * 4) { g.pop++; g.message = 'A new colonist joined'; if (g.pop >= 10) unlock('pop-ten') }
      }
      if (g.raidIn <= 0) {
        g.wave++; g.raidIn = Math.max(10, 19 - g.wave * .7)
        const attack = g.wave * 2.7, defense = count('turret') * 5 + g.pop * .35
        if (defense + Math.random() * 3 < attack) {
          const loss = Math.max(1, Math.ceil((attack - defense) / 5)); g.pop -= loss
          const candidates = g.buildings.filter(b => b.type !== 'command')
          if (candidates.length && Math.random() < .65) g.buildings.splice(g.buildings.indexOf(candidates[(Math.random() * candidates.length) | 0]), 1)
          g.message = `Raid ${g.wave}: ${loss} colonist${loss === 1 ? '' : 's'} lost`
        } else { g.materials += 6 + g.wave; g.message = `Raid ${g.wave} repelled`; unlock('repel-raid') }
        if (g.wave >= 10 && g.pop > 0) { unlock('liftoff'); finish(true, 'Colony Evacuated', `${g.pop} colonists survived all ten raids. Score ${Math.round(api.score())}.`) }
      }
      if (g.pop <= 0) finish(false, 'Colony Lost', `The frontier fell during raid ${g.wave}. Build farms, habitats, and turrets earlier.`)
    },
    draw(c, w, h) {
      const top = 78, cw = w / g.cols, ch = Math.max(36, (h - top) / g.rows)
      c.fillStyle = '#0b1724'; c.fillRect(0, top, w, h - top)
      for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
        c.strokeStyle = '#20334b'; c.strokeRect(x * cw, top + y * ch, cw, ch)
      }
      for (const b of g.buildings) {
        const d = defs[b.type] || { color: '#a28cff', label: 'Command' }
        c.fillStyle = d.color; c.fillRect(b.x * cw + 5, top + b.y * ch + 5, cw - 10, ch - 10)
        c.fillStyle = '#06101b'; c.font = '700 12px Segoe UI'; c.textAlign = 'center'; c.fillText(d.label, b.x * cw + cw / 2, top + b.y * ch + ch / 2 + 4)
      }
      c.fillStyle = '#dcecff'; for (let i = 0; i < Math.max(0, g.pop); i++) { const x = 16 + (i % 15) * 16, y = top + 16 + Math.floor(i / 15) * 16; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill() }
    },
    status: () => `${g.message} · Raid ${g.wave}/10 in ${Math.ceil(g.raidIn)}s`,
    stats: () => `Colonists ${Math.max(0, g.pop)} · Food ${Math.floor(g.food)} · Materials ${Math.floor(g.materials)}`,
    score: () => g.wave * 100 + Math.max(0, g.pop) * 40 + g.materials
  }
  return api
}

function ecosystemMode() {
  let g
  function agent(kind, x = rand(20, W - 20), y = rand(90, H - 20)) { return { kind, x, y, vx: rand(-1, 1), vy: rand(-1, 1), energy: kind === 'prey' ? 75 : 95 } }
  function nearest(a, list) { let best = null, bd = Infinity; for (const b of list) { const d = dist(a, b); if (d < bd) { bd = d; best = b } } return best }
  const api = {
    reset() {
      g = { plants: [], prey: [], carn: [], selected: 'plant', time: 0, stable: 0, season: 0, spawn: 0 }
      for (let i = 0; i < 90; i++) g.plants.push(agent('plant'))
      for (let i = 0; i < 16; i++) g.prey.push(agent('prey'))
      for (let i = 0; i < 4; i++) g.carn.push(agent('carn'))
      unlock('first-life'); setTools()
    },
    tools: () => ['plant', 'prey', 'carn', 'erase'].map(id => ({ label: ({ plant: 'Plant', prey: 'Prey', carn: 'Predator', erase: 'Erase' })[id], active: g.selected === id, run: () => { g.selected = id } })),
    pointer(type, p) {
      if (!['down', 'move'].includes(type) || p.y < 70) return
      if (g.selected === 'plant') for (let i = 0; i < 6; i++) g.plants.push(agent('plant', p.x + rand(-14, 14), p.y + rand(-14, 14)))
      else if (g.selected === 'prey') g.prey.push(agent('prey', p.x, p.y))
      else if (g.selected === 'carn') g.carn.push(agent('carn', p.x, p.y))
      else {
        for (const key of ['plants', 'prey', 'carn']) g[key] = g[key].filter(a => Math.hypot(a.x - p.x, a.y - p.y) > 28)
      }
    },
    key() {}, spacePause: true,
    update(dt) {
      g.time += dt; g.season = Math.floor(g.time / 30) % 4; g.spawn -= dt
      const growth = [1.5, 1.1, .45, .8][g.season]
      if (g.spawn <= 0 && g.plants.length < 320) { g.spawn = .22 / growth; g.plants.push(agent('plant')) }
      for (const p of [...g.prey]) {
        const target = nearest(p, g.plants); moveAgent(p, target, 33, dt); p.energy -= 4.2 * dt
        if (target && dist(p, target) < 8) { g.plants.splice(g.plants.indexOf(target), 1); p.energy += 32 }
        if (p.energy > 120 && g.prey.length < 140) { p.energy *= .55; g.prey.push(agent('prey', p.x + 5, p.y + 5)) }
      }
      for (const p of [...g.carn]) {
        const target = nearest(p, g.prey); moveAgent(p, target, 42, dt); p.energy -= 5.4 * dt
        if (target && dist(p, target) < 10) { g.prey.splice(g.prey.indexOf(target), 1); p.energy += 58 }
        if (p.energy > 150 && g.carn.length < 45) { p.energy *= .6; g.carn.push(agent('carn', p.x + 8, p.y)) }
      }
      g.prey = g.prey.filter(a => a.energy > 0); g.carn = g.carn.filter(a => a.energy > 0)
      const balanced = g.plants.length >= 25 && g.prey.length >= 6 && g.carn.length >= 2
      g.stable = balanced ? g.stable + dt : Math.max(0, g.stable - dt * .5)
      if (g.plants.length >= 300) unlock('gardener'); if (g.prey.length >= 100) unlock('swarm', g.prey.length / 250)
      if (g.stable >= 180) { unlock('eternal'); finish(true, 'Ecosystem Stable', `Your food web survived every season with ${g.plants.length} plants, ${g.prey.length} prey, and ${g.carn.length} predators.`) }
    },
    draw(c, w, h) {
      c.fillStyle = ['#12351f', '#3c3a18', '#3b2319', '#17303b'][g.season]; c.fillRect(0, 70, w, h - 70)
      for (const p of g.plants) dot(c, p, 3, '#64db78')
      for (const p of g.prey) { dot(c, p, 5, '#cde8ff'); line(c, p, p.vx, p.vy, '#7bb8e8') }
      for (const p of g.carn) { dot(c, p, 7, '#ff8a67'); line(c, p, p.vx, p.vy, '#9e3e31') }
    },
    status: () => `${['Spring', 'Summer', 'Autumn', 'Winter'][g.season]} · stable ${Math.floor(g.stable)}/180s`,
    stats: () => `Plants ${g.plants.length} · Prey ${g.prey.length} · Predators ${g.carn.length}`,
    score: () => g.stable * 10 + g.plants.length + g.prey.length * 4 + g.carn.length * 10
  }
  function moveAgent(a, target, speed, dt) {
    if (target) { const d = Math.max(1, dist(a, target)); a.vx += (target.x - a.x) / d * dt * 2; a.vy += (target.y - a.y) / d * dt * 2 }
    const m = Math.max(1, Math.hypot(a.vx, a.vy)); a.vx /= m; a.vy /= m; a.x += a.vx * speed * dt; a.y += a.vy * speed * dt
    if (a.x < 5 || a.x > W - 5) a.vx *= -1; if (a.y < 75 || a.y > H - 5) a.vy *= -1; a.x = clamp(a.x, 5, W - 5); a.y = clamp(a.y, 75, H - 5)
  }
  return api
}

function ragdollMode() {
  let g
  const launch = () => {
    if (g.phase !== 'aim') return
    if (!g.charging) { g.charging = true; return }
    g.phase = 'flight'; g.charging = false; g.vx = 220 + g.charge * 340; g.vy = -210 - g.charge * 250; g.message = 'Airborne!'; unlock('first-launch')
  }
  const boost = () => { if (g.phase === 'flight' && g.boosts > 0) { g.boosts--; g.vx += 90; g.vy -= 85; unlock('boost') } }
  const api = {
    reset() { g = { phase: 'aim', charging: false, charge: 0, x: 0, y: 0, vx: 0, vy: 0, boosts: 3, coins: 0, bounces: 0, message: 'Charge the cannon' }; setTools() },
    tools: () => [
      { label: g.phase === 'aim' ? (g.charging ? 'Launch!' : 'Charge') : 'Reload', active: g.charging, run: () => g.phase === 'aim' ? launch() : api.reset() },
      { label: `Boost ${g.boosts}`, disabled: g.phase !== 'flight' || !g.boosts, run: boost }
    ],
    pointer(type) { if (type === 'down' && g.phase === 'aim') { g.charging = true } if (type === 'up' && g.phase === 'aim' && g.charging) launch() },
    key(code, down) {
      if (code === 'Space') { if (down && g.phase === 'aim') g.charging = true; else if (!down && g.phase === 'aim' && g.charging) launch(); else if (down) boost() }
      if (!down || g.phase !== 'flight') return
      if (code === 'KeyW' || code === 'ArrowUp') g.vy -= 30; if (code === 'KeyS' || code === 'ArrowDown') g.vy += 30
      if (code === 'KeyA' || code === 'ArrowLeft') g.vx -= 25; if (code === 'KeyD' || code === 'ArrowRight') g.vx += 25
      if (code === 'KeyR') api.reset()
    },
    update(dt) {
      if (g.charging) g.charge = Math.min(1, g.charge + dt * .55)
      if (g.phase !== 'flight') return
      g.vy += 175 * dt; g.x += g.vx * dt; g.y += g.vy * dt
      for (let mark = 100; mark < 1000; mark += 100) if (g.x >= mark && g.x - g.vx * dt < mark) { g.coins++; unlock('coin-collector', Math.min(1, g.coins / 10)) }
      if (g.x >= 1000) { unlock('moon-gate'); finish(true, 'Moon Gate Reached', `Distance ${Math.floor(g.x)}m · ${g.coins} coins · ${g.bounces} bounces.`); return }
      const ground = 0
      if (g.y > ground) {
        g.y = ground
        if (Math.abs(g.vy) > 55 && g.bounces < 8) { g.vy *= -.48; g.vx *= .84; g.bounces++; g.message = `Bounce ${g.bounces}` }
        else { g.phase = 'landed'; unlock('first-throw'); finish(false, 'Throw Banked', `Distance ${Math.floor(g.x)}m · ${g.coins} coins. Keep upgrading your timing.`) }
      }
      if (g.x >= 900) g.message = 'Moon Gate ahead!'
      setTools()
    },
    draw(c, w, h) {
      const groundY = h * .78, scale = .82, cam = Math.max(0, g.x * scale - w * .25)
      const sx = (x) => x * scale - cam
      c.fillStyle = '#0d1b30'; c.fillRect(0, 0, w, groundY); c.fillStyle = '#243149'; c.fillRect(0, groundY, w, h - groundY)
      for (let x = 100; x <= 1000; x += 100) { const px = sx(x); if (px < -30 || px > w + 30) continue; c.fillStyle = x === 1000 ? '#ffc857' : '#3dd6ff'; c.fillRect(px - 4, groundY - (x === 1000 ? 120 : 35), 8, x === 1000 ? 120 : 35); c.fillText(`${x}m`, px - 14, groundY - 42) }
      const px = sx(g.x || 8), py = groundY + g.y * .55 - 16
      c.strokeStyle = '#e8f2ff'; c.lineWidth = 5; c.beginPath(); c.moveTo(px, py); c.lineTo(px - 14, py + 22); c.moveTo(px, py + 8); c.lineTo(px + 15, py + 25); c.stroke(); c.fillStyle = '#ffb86b'; c.beginPath(); c.arc(px, py - 8, 9, 0, 7); c.fill()
      if (g.phase === 'aim') { c.fillStyle = '#1f2a40'; c.fillRect(15, groundY - 45, 70, 45); c.fillStyle = '#62e6ff'; c.fillRect(15, groundY + 15, 180 * g.charge, 12); c.strokeStyle = '#557'; c.strokeRect(15, groundY + 15, 180, 12) }
    },
    status: () => g.message,
    stats: () => `Distance ${Math.floor(g.x)}m · Speed ${Math.floor(g.vx)} · Coins ${g.coins}`,
    score: () => g.x + g.coins * 25
  }
  return api
}

function towerMode() {
  const defs = { blaster: { label: 'Blaster', cost: 35, range: 125, damage: 8, rate: .35, color: '#62e6ff' }, frost: { label: 'Frost', cost: 45, range: 105, damage: 4, rate: .5, color: '#8aa4ff', slow: .55 }, cannon: { label: 'Cannon', cost: 65, range: 155, damage: 25, rate: 1.05, color: '#ffc857' } }
  let g
  const roadY = (x) => H * .53 + Math.sin(x * .012) * 50
  function beginWave() { if (g.inWave || g.wave >= 10) return; g.wave++; g.inWave = true; g.spawn = 4 + g.wave * 3; g.spawnIn = 0; g.message = `Wave ${g.wave} incoming`; setTools() }
  const api = {
    reset() { g = { gold: 120, lives: 20, wave: 0, inWave: false, spawn: 0, spawnIn: 0, enemies: [], towers: [], selected: 'blaster', message: 'Build your defense' }; setTools() },
    tools: () => [...Object.entries(defs).map(([id, d]) => ({ label: `${d.label} ${d.cost}`, active: g.selected === id, run: () => { g.selected = id } })), { label: g.inWave ? `Wave ${g.wave}` : 'Start Wave', disabled: g.inWave, run: beginWave }],
    pointer(type, p) {
      if (type !== 'down' || p.y < 70) return
      const d = defs[g.selected]
      if (Math.abs(p.y - roadY(p.x)) < 60 || g.towers.some(t => dist(t, p) < 36)) { g.message = 'Build away from the road'; return }
      if (g.gold < d.cost) { g.message = 'Not enough gold'; return }
      g.gold -= d.cost; g.towers.push({ x: p.x, y: p.y, type: g.selected, cool: 0, shots: 0 }); g.message = `${d.label} online`; unlock('first-tower')
    },
    key(code, down) { if (!down) return; if (code === 'Space') beginWave(); if (code === 'Digit1') g.selected = 'blaster'; if (code === 'Digit2') g.selected = 'frost'; if (code === 'Digit3') g.selected = 'cannon'; setTools() },
    update(dt) {
      if (g.inWave && g.spawn > 0) {
        g.spawnIn -= dt
        if (g.spawnIn <= 0) { g.spawnIn = Math.max(.32, .8 - g.wave * .03); g.spawn--; g.enemies.push({ x: -25, y: roadY(0), hp: 24 + g.wave * 13, max: 24 + g.wave * 13, speed: 32 + g.wave * 2.2, slow: 1 }) }
      }
      for (const e of g.enemies) { e.slow += (1 - e.slow) * dt; e.x += e.speed * e.slow * dt; e.y = roadY(e.x); if (e.x > W + 25) { e.dead = true; g.lives--; g.message = 'An enemy breached the gate' } }
      for (const t of g.towers) {
        const d = defs[t.type]; t.cool -= dt
        const target = g.enemies.filter(e => !e.dead && dist(t, e) <= d.range).sort((a, b) => b.x - a.x)[0]
        if (target && t.cool <= 0) { t.cool = d.rate; target.hp -= d.damage; target.slow = Math.min(target.slow, d.slow || 1); t.target = target; t.flash = .08; t.shots++; if (target.hp <= 0) { target.dead = true; g.gold += 8 + g.wave; unlock('first-kill') } }
        t.flash = Math.max(0, (t.flash || 0) - dt)
      }
      g.enemies = g.enemies.filter(e => !e.dead)
      if (g.lives <= 0) finish(false, 'Gate Breached', `You reached wave ${g.wave}. Mix tower types and build earlier.`)
      if (g.inWave && !g.spawn && !g.enemies.length) {
        g.inWave = false; g.gold += 25 + g.wave * 4; g.message = `Wave ${g.wave} cleared`; unlock('wave-five', Math.min(1, g.wave / 5))
        if (g.wave >= 10) { unlock('siege-master'); finish(true, 'Siege Broken', `${g.lives} lives remained after ten waves. Score ${Math.round(api.score())}.`) }
        setTools()
      }
    },
    draw(c, w, h) {
      c.fillStyle = '#102030'; c.fillRect(0, 70, w, h - 70)
      c.strokeStyle = '#526078'; c.lineWidth = 58; c.beginPath(); for (let x = -20; x <= w + 20; x += 10) { const y = roadY(x); if (x === -20) c.moveTo(x, y); else c.lineTo(x, y) } c.stroke()
      c.strokeStyle = '#8994a8'; c.lineWidth = 3; c.stroke()
      for (const t of g.towers) { const d = defs[t.type]; c.fillStyle = d.color; c.beginPath(); c.arc(t.x, t.y, 15, 0, 7); c.fill(); if (t.flash && t.target) { c.strokeStyle = d.color; c.lineWidth = 3; c.beginPath(); c.moveTo(t.x, t.y); c.lineTo(t.target.x, t.target.y); c.stroke() } }
      for (const e of g.enemies) { c.fillStyle = '#ff6679'; c.beginPath(); c.arc(e.x, e.y, 12, 0, 7); c.fill(); c.fillStyle = '#09111d'; c.fillRect(e.x - 14, e.y - 20, 28, 4); c.fillStyle = '#66e18c'; c.fillRect(e.x - 14, e.y - 20, 28 * clamp(e.hp / e.max, 0, 1), 4) }
    },
    status: () => `${g.message} · Wave ${g.wave}/10`,
    stats: () => `Gold ${Math.floor(g.gold)} · Lives ${g.lives} · Enemies ${g.enemies.length + g.spawn}`,
    score: () => g.wave * 150 + g.lives * 20 + g.gold
  }
  return api
}

function dot(c, p, r, color) { c.fillStyle = color; c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill() }
function line(c, p, vx, vy, color) { c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + vx * 8, p.y + vy * 8); c.stroke() }
