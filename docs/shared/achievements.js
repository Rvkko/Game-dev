/**
 * EMPIRE achievements.js — global + per-game achievements.
 * Store "achievements", key "<gameId>:<achId>":
 *   {gameId, achId, progress (0..1), unlocked, unlockedNum (0/1 for index), unlockedAt}
 * Definitions (title, desc, rarity, hidden, progressive, target) come from each
 * game's manifest.achievements[].
 */
import { idbGet, idbPut, idbGetAll } from './save.js';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function key(gameId, achId) { return `${gameId}:${achId}`; }

export async function getAchievement(gameId, achId) {
  return idbGet('achievements', key(gameId, achId));
}

export async function listGameAchievements(gameId) {
  return idbGetAll('achievements', 'gameId', gameId);
}

export async function listAllAchievements() {
  return idbGetAll('achievements');
}

/**
 * Report progress / unlock. progress: 0..1 (or absolute count if def.target set —
 * pass raw count and it is normalized). Returns {record, justUnlocked}.
 */
export async function unlockAchievement(gameId, achId, progress = 1, def = null) {
  let rec = await idbGet('achievements', key(gameId, achId));
  if (!rec) {
    rec = { gameId, achId, progress: 0, unlocked: false, unlockedNum: 0, unlockedAt: null };
  }
  if (rec.unlocked) return { record: rec, justUnlocked: false };

  let p = progress;
  if (def && def.progressive && def.target > 1 && progress > 1) {
    p = progress / def.target; // absolute count -> fraction
  }
  p = Math.max(rec.progress, Math.min(1, p));
  rec.progress = p;
  let justUnlocked = false;
  if (p >= 1) {
    rec.unlocked = true;
    rec.unlockedNum = 1;
    rec.unlockedAt = Date.now();
    justUnlocked = true;
  }
  await idbPut('achievements', key(gameId, achId), rec);
  return { record: rec, justUnlocked };
}

/** Merge manifest definitions with stored state for display. */
export async function achievementsForDisplay(gameId, defs) {
  const stored = await listGameAchievements(gameId);
  const byId = Object.fromEntries(stored.map(r => [r.achId, r]));
  return (defs || []).map(def => {
    const r = byId[def.id];
    return {
      ...def,
      rarity: RARITIES.includes(def.rarity) ? def.rarity : 'common',
      progress: r ? r.progress : 0,
      unlocked: r ? r.unlocked : false,
      unlockedAt: r ? r.unlockedAt : null,
    };
  });
}

/** Global stats: {unlocked, total, byRarity} across a set of manifests. */
export async function globalStats(manifests) {
  const all = await listAllAchievements();
  const unlockedKeys = new Set(all.filter(a => a.unlocked).map(a => `${a.gameId}:${a.achId}`));
  let total = 0, unlocked = 0;
  const byRarity = {};
  for (const m of manifests) {
    for (const def of (m.achievements || [])) {
      total++;
      if (unlockedKeys.has(`${m.id}:${def.id}`)) {
        unlocked++;
        const r = def.rarity || 'common';
        byRarity[r] = (byRarity[r] || 0) + 1;
      }
    }
  }
  return { unlocked, total, byRarity };
}
