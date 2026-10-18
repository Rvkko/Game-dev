// dungeon.js — procedural floor generation. Grid: 0 = wall, 1 = floor.
import { makeRng, dist } from './util.js';

export const TILE = 48;

const THEMES = [
  { name: 'The Catacombs',    floor: '#2e2a38', floor2: '#332e3e', wall: '#1a1622', wallTop: '#3e3852', accent: '#7a6a9a', torch: '#ffb04a' },
  { name: 'The Flooded Cells',floor: '#243038', floor2: '#28353e', wall: '#141c22', wallTop: '#31454f', accent: '#5a9aaa', torch: '#6ad9d9' },
  { name: 'The Bone Pits',    floor: '#38322a', floor2: '#3e382e', wall: '#221e16', wallTop: '#52493a', accent: '#c8b89a', torch: '#ffcf6a' },
  { name: 'The Ember Depths', floor: '#38262a', floor2: '#3e2b2e', wall: '#221416', wallTop: '#52323a', accent: '#e87a4a', torch: '#ff6a3a' },
  { name: "The Warden's Maw", floor: '#2a2234', floor2: '#2f263a', wall: '#160f20', wallTop: '#453360', accent: '#b78ae8', torch: '#c86aff' },
];

export function themeForFloor(floor) {
  return THEMES[Math.min(THEMES.length - 1, Math.floor((floor - 1) / 2))];
}

export function isBossFloor(floor) { return floor === 5 || floor === 10; }

/**
 * Generate a floor. Returns:
 * { grid, w, h, rooms, spawn, stairs, torches, chests, fountain, goldPiles,
 *   potions, enemySpawns, bossSpawn, theme, name }
 * All positions in world px (tile centers).
 */
export function generateFloor(runSeed, floor) {
  const rng = makeRng(`${runSeed}:floor:${floor}`);
  const theme = themeForFloor(floor);
  const boss = isBossFloor(floor);

  const w = boss ? 34 : 40 + Math.min(10, floor);
  const h = boss ? 26 : 30 + Math.min(8, floor);
  const grid = new Uint8Array(w * h);
  const rooms = [];

  const carveRoom = (r) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) grid[y * w + x] = 1;
  };
  const carveCorridor = (x0, y0, x1, y1) => {
    // L-shaped, 2 tiles wide
    const horizFirst = rng.chance(0.5);
    const hline = (xa, xb, y) => {
      for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) {
        grid[y * w + x] = 1;
        if (y + 1 < h - 1) grid[(y + 1) * w + x] = 1;
      }
    };
    const vline = (ya, yb, x) => {
      for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) {
        grid[y * w + x] = 1;
        if (x + 1 < w - 1) grid[y * w + x + 1] = 1;
      }
    };
    if (horizFirst) { hline(x0, x1, y0); vline(y0, y1, x1); }
    else { vline(y0, y1, x0); hline(x0, x1, y1); }
  };

  if (boss) {
    // Entrance room + big arena
    const entry = { x: 3, y: Math.floor(h / 2) - 3, w: 7, h: 6, type: 'entrance' };
    const arena = { x: 13, y: 4, w: w - 17, h: h - 8, type: 'arena' };
    carveRoom(entry); carveRoom(arena);
    carveCorridor(entry.x + entry.w - 1, Math.floor(h / 2), arena.x + 1, Math.floor(h / 2));
    for (const r of [entry, arena]) { r.cx = r.x + r.w / 2; r.cy = r.y + r.h / 2; rooms.push(r); }
  } else {
    const roomCount = 7 + Math.min(4, Math.floor(floor / 2));
    let attempts = 0;
    while (rooms.length < roomCount && attempts++ < 220) {
      const rw = rng.int(5, 10), rh = rng.int(4, 8);
      const rx = rng.int(2, w - rw - 3), ry = rng.int(2, h - rh - 3);
      const r = { x: rx, y: ry, w: rw, h: rh };
      if (rooms.some(o => rx < o.x + o.w + 2 && rx + rw + 2 > o.x && ry < o.y + o.h + 2 && ry + rh + 2 > o.y)) continue;
      r.cx = rx + rw / 2; r.cy = ry + rh / 2;
      carveRoom(r);
      rooms.push(r);
    }
    // Connect: each room to the nearest already-connected room
    const connected = [rooms[0]];
    for (let i = 1; i < rooms.length; i++) {
      const r = rooms[i];
      let best = connected[0], bd = Infinity;
      for (const c of connected) {
        const d = dist(r.cx, r.cy, c.cx, c.cy);
        if (d < bd) { bd = d; best = c; }
      }
      carveCorridor(Math.floor(r.cx), Math.floor(r.cy), Math.floor(best.cx), Math.floor(best.cy));
      connected.push(r);
    }
    // One extra loop for interest
    if (rooms.length > 4) {
      const a = rng.pick(rooms), b = rng.pick(rooms);
      if (a !== b) carveCorridor(Math.floor(a.cx), Math.floor(a.cy), Math.floor(b.cx), Math.floor(b.cy));
    }
    // Entrance = first room; stairs in the farthest room
    rooms[0].type = 'entrance';
    let far = rooms[1], fd = 0;
    for (let i = 1; i < rooms.length; i++) {
      const d = dist(rooms[0].cx, rooms[0].cy, rooms[i].cx, rooms[i].cy);
      if (d > fd) { fd = d; far = rooms[i]; }
    }
    far.type = 'stairs';
  }

  const px = (tx) => tx * TILE + TILE / 2; // tile -> world center
  const entrance = rooms.find(r => r.type === 'entrance');
  const stairsRoom = boss ? rooms[1] : rooms.find(r => r.type === 'stairs');
  const spawn = { x: px(Math.floor(entrance.cx)), y: px(Math.floor(entrance.cy)) };
  const stairs = { x: px(Math.floor(stairsRoom.cx) + (boss ? Math.floor(stairsRoom.w / 2) - 2 : 0)), y: px(Math.floor(stairsRoom.cy)) };

  // Torches: floor tiles adjacent to a wall, spaced out
  const torches = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y * w + x] !== 1) continue;
      if (grid[(y - 1) * w + x] === 0 && rng.chance(0.09)) {
        if (!torches.some(t => dist(t.x, t.y, px(x), px(y)) < TILE * 4)) {
          torches.push({ x: px(x), y: px(y) - TILE * 0.42, flicker: rng.next() * 10 });
        }
      }
    }
  }

  // Interactables & pickups in non-entrance rooms
  const chests = [], goldPiles = [], potions = [], enemySpawns = [];
  let fountain = null;
  const midRooms = rooms.filter(r => r.type !== 'entrance' && r.type !== 'stairs' && r.type !== 'arena');
  const randPointIn = (r) => ({
    x: px(rng.int(r.x + 1, r.x + r.w - 2)),
    y: px(rng.int(r.y + 1, r.y + r.h - 2)),
  });

  if (!boss) {
    const chestRooms = rng.shuffle(midRooms).slice(0, rng.int(1, 2));
    for (const r of chestRooms) chests.push({ ...randPointIn(r), opened: false });
    if (floor >= 2 && rng.chance(0.75) && midRooms.length > 1) {
      fountain = { ...randPointIn(rng.pick(midRooms)), used: false };
    }
    for (const r of midRooms) {
      if (rng.chance(0.5)) goldPiles.push({ ...randPointIn(r), amount: rng.int(4, 10) + floor * 2 });
      if (rng.chance(0.25)) potions.push(randPointIn(r));
    }
    // Enemies: every room except entrance
    for (const r of rooms) {
      if (r.type === 'entrance') continue;
      const count = rng.int(2, 3) + Math.floor(floor / 3);
      for (let i = 0; i < count; i++) {
        const p = randPointIn(r);
        if (dist(p.x, p.y, spawn.x, spawn.y) < TILE * 6) continue;
        enemySpawns.push({ ...p, elite: rng.chance(0.05 + floor * 0.012) });
      }
    }
  }

  const bossSpawn = boss ? { x: px(Math.floor(rooms[1].cx)), y: px(Math.floor(rooms[1].cy)) } : null;

  // Decor: floor detail hashes are derived in the renderer from tile coords.
  return {
    grid, w, h, rooms, spawn, stairs, torches, chests, fountain,
    goldPiles, potions, enemySpawns, bossSpawn, theme,
    name: boss ? (floor === 5 ? 'Lair of the Bone Butcher' : 'Throne of the Warden') : theme.name,
    boss,
  };
}

/** Merge wall tiles that border floor into static rectangle specs (world px). */
export function wallRects(grid, w, h) {
  // Build a mask of wall tiles that touch floor (only these need bodies)
  const need = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== 0) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && grid[ny * w + nx] === 1) need[y * w + x] = 1;
      }
    }
  }
  // Greedy horizontal merge
  const rects = [];
  const used = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!need[y * w + x] || used[y * w + x]) continue;
      let x2 = x;
      while (x2 + 1 < w && need[y * w + x2 + 1] && !used[y * w + x2 + 1]) x2++;
      for (let i = x; i <= x2; i++) used[y * w + i] = 1;
      rects.push({
        x: (x + (x2 - x + 1) / 2) * TILE,
        y: y * TILE + TILE / 2,
        w: (x2 - x + 1) * TILE,
        h: TILE,
      });
    }
  }
  return rects;
}
