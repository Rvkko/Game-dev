/**
 * EMPIRE profile.js — singleton player profile in IndexedDB store "profile", key "main".
 */
import { idbGet, idbPut } from './save.js';

const KEY = 'main';

export const DEFAULT_PROFILE = {
  name: 'Player One',
  avatar: '🎮',
  createdAt: 0,
  totalPlaytimeSec: 0,
  gamesPlayed: {},      // gameId -> {playtimeSec, launches, lastPlayed}
  continuePoints: {},   // gameId -> {slot, label, at}
  themeUnlocks: [],     // unlocked theme ids beyond dark/light
};

export async function getProfile() {
  let p = await idbGet('profile', KEY);
  if (!p) {
    p = { ...structuredClone(DEFAULT_PROFILE), createdAt: Date.now() };
    await idbPut('profile', KEY, p);
  }
  // heal missing fields from older records
  for (const [k, v] of Object.entries(DEFAULT_PROFILE)) {
    if (p[k] === undefined) p[k] = structuredClone(v);
  }
  return p;
}

export async function saveProfile(p) {
  await idbPut('profile', KEY, p);
  return p;
}

export async function updateProfile(patch) {
  const p = await getProfile();
  Object.assign(p, patch);
  return saveProfile(p);
}

export async function recordLaunch(gameId) {
  const p = await getProfile();
  const g = p.gamesPlayed[gameId] || { playtimeSec: 0, launches: 0, lastPlayed: 0 };
  g.launches += 1;
  g.lastPlayed = Date.now();
  p.gamesPlayed[gameId] = g;
  return saveProfile(p);
}

export async function addPlaytime(gameId, seconds) {
  if (!(seconds > 0)) return getProfile();
  const p = await getProfile();
  const g = p.gamesPlayed[gameId] || { playtimeSec: 0, launches: 0, lastPlayed: 0 };
  g.playtimeSec += seconds;
  g.lastPlayed = Date.now();
  p.gamesPlayed[gameId] = g;
  p.totalPlaytimeSec += seconds;
  return saveProfile(p);
}

export async function setContinuePoint(gameId, slot, label) {
  const p = await getProfile();
  p.continuePoints[gameId] = { slot, label: label || 'Continue', at: Date.now() };
  return saveProfile(p);
}

export async function unlockTheme(themeId) {
  const p = await getProfile();
  if (!p.themeUnlocks.includes(themeId)) {
    p.themeUnlocks.push(themeId);
    await saveProfile(p);
  }
  return p;
}

/** Recently played gameIds, most recent first. */
export function recentlyPlayed(profile, limit = 8) {
  return Object.entries(profile.gamesPlayed)
    .filter(([, g]) => g.lastPlayed > 0)
    .sort((a, b) => b[1].lastPlayed - a[1].lastPlayed)
    .slice(0, limit)
    .map(([id]) => id);
}

export function formatPlaytime(sec) {
  sec = Math.floor(sec || 0);
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
