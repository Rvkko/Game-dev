/**
 * EMPIRE save.js — IndexedDB core + save-slot API.
 * db "empire" v1, stores: saves, profile, achievements, settings, meta.
 * Slots per game: "auto" + "slot1".."slot5".
 */

const DB_NAME = 'empire';
const DB_VERSION = 1;
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('saves')) {
        const s = db.createObjectStore('saves'); // key "<gameId>:<slot>"
        s.createIndex('gameId', 'gameId', { unique: false });
      }
      if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile'); // "main"
      if (!db.objectStoreNames.contains('achievements')) {
        const a = db.createObjectStore('achievements'); // key "<gameId>:<achId>"
        a.createIndex('gameId', 'gameId', { unique: false });
        a.createIndex('unlocked', 'unlockedNum', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings'); // "main"
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

export async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readonly').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function idbPut(store, key, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readwrite').put(value, key);
    r.onsuccess = () => res(true);
    r.onerror = () => rej(r.error);
  });
}

export async function idbDelete(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readwrite').delete(key);
    r.onsuccess = () => res(true);
    r.onerror = () => rej(r.error);
  });
}

export async function idbGetAll(store, indexName = null, query = null) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const os = tx(db, store, 'readonly');
    const src = indexName ? os.index(indexName) : os;
    const r = query != null ? src.getAll(query) : src.getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

export async function idbGetAllKeys(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, store, 'readonly').getAllKeys();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

// ---------- Save-slot API ----------

function saveKey(gameId, slot) { return `${gameId}:${slot}`; }

export function validSlot(slot) { return SLOTS.includes(slot); }

/**
 * Write a save. meta: {label, playtimeSec, thumbnail (JPEG dataURL <=512px),
 * progress, mode, difficulty, seed}. saveVersion from the game's manifest.
 */
export async function writeSave(gameId, slot, blob, meta = {}, saveVersion = 1) {
  if (!validSlot(slot)) throw new Error(`invalid slot "${slot}"`);
  const record = {
    gameId, slot, blob,
    meta: {
      label: meta.label || (slot === 'auto' ? 'Autosave' : `Save ${slot.replace('slot', '')}`),
      playtimeSec: meta.playtimeSec || 0,
      thumbnail: meta.thumbnail || null,
      progress: meta.progress ?? null,
      mode: meta.mode ?? null,
      difficulty: meta.difficulty ?? null,
      seed: meta.seed ?? null,
    },
    saveVersion,
    savedAt: Date.now(),
  };
  await idbPut('saves', saveKey(gameId, slot), record);
  return record;
}

/** Read a save record (or undefined). */
export async function readSave(gameId, slot) {
  if (!validSlot(slot)) throw new Error(`invalid slot "${slot}"`);
  return idbGet('saves', saveKey(gameId, slot));
}

/** List all save records for a game (meta only, blob included). */
export async function listSaves(gameId) {
  return idbGetAll('saves', 'gameId', gameId);
}

export async function deleteSave(gameId, slot) {
  return idbDelete('saves', saveKey(gameId, slot));
}

/** Export every save for backup (JSON-serializable). */
export async function exportAllSaves() {
  const keys = await idbGetAllKeys('saves');
  const out = {};
  for (const k of keys) out[k] = await idbGet('saves', k);
  return { exportedAt: Date.now(), dbVersion: DB_VERSION, saves: out };
}

/** A consistent backup of every store, including profile and achievements. */
export async function exportDatabase() {
  const db = await openDB();
  const names = Array.from(db.objectStoreNames);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, 'readonly');
    const stores = {};
    for (const name of names) {
      const store = transaction.objectStore(name);
      const keys = store.getAllKeys(), values = store.getAll();
      const collect = () => {
        if (keys.readyState === 'done' && values.readyState === 'done') {
          stores[name] = keys.result.map((key, i) => [key, values.result[i]]);
        }
      };
      keys.onsuccess = collect;
      values.onsuccess = collect;
    }
    transaction.oncomplete = () => resolve({ dbVersion: DB_VERSION, stores });
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Gaming backup failed'));
  });
}

export async function importDatabase(backup) {
  const db = await openDB();
  const stores = backup && backup.stores;
  if (!stores || typeof stores !== 'object' || Array.isArray(stores)) throw new Error('Invalid gaming backup');
  const names = Object.keys(stores);
  if (!names.length || names.some(name => !db.objectStoreNames.contains(name) || !Array.isArray(stores[name]) || stores[name].some(row => !Array.isArray(row) || row.length !== 2))) {
    throw new Error('Invalid gaming backup stores');
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, 'readwrite');
    let count = 0;
    transaction.oncomplete = () => resolve(count);
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Gaming restore failed'));
    try {
      for (const name of names) for (const [key, value] of stores[name]) {
        transaction.objectStore(name).put(value, key);
        count++;
      }
    } catch (error) { transaction.abort(); reject(error); }
  });
}

/** Import a backup produced by exportAllSaves. Returns count imported. */
export async function importAllSaves(backup) {
  if (backup && backup.format === 'rvkko-gaming-backup-v1') {
    const origin = backup.origins && backup.origins[location.origin];
    if (!origin) throw new Error('This backup has no progress for this gaming address');
    return importDatabase(origin);
  }
  if (!backup || !backup.saves) throw new Error('invalid backup');
  let n = 0;
  for (const [k, v] of Object.entries(backup.saves)) {
    if (v && v.gameId && v.slot) { await idbPut('saves', k, v); n++; }
  }
  return n;
}

/**
 * Migration check. If stored saveVersion !== expected, the caller (game client)
 * must run window.__empireMigrate(blob, fromVersion). This helper just flags it.
 */
export function needsMigration(record, expectedVersion) {
  return record && record.saveVersion !== expectedVersion;
}

/** Downscale a dataURL/canvas to a JPEG thumbnail <=512px on the long edge. */
export async function makeThumbnail(source, maxDim = 512, quality = 0.7) {
  const img = await new Promise((res, rej) => {
    if (source instanceof HTMLCanvasElement) { res(source); return; }
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = source;
  });
  const w = img.width, h = img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
