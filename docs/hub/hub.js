/**
 * EMPIRE hub — library, launcher, saves, achievements, profile, settings, news.
 * Serve repo root and open /hub/index.html.
 */
import { EmpireHost } from '../shared/empire-sdk.js';
import * as Save from '../shared/save.js';
import * as Profile from '../shared/profile.js';
import * as Ach from '../shared/achievements.js';
import * as Settings from '../shared/settings.js';
import { labelForCode, GAMEPAD } from '../shared/input.js';
import { applyAccessibility, injectBaseCSS } from '../shared/accessibility.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ---------------------------------------------------------------- state
const state = {
  games: [],            // enriched manifests: {..., available:bool}
  settings: null,
  profile: null,
  favorites: [],
  view: 'home',
  libCategory: 'all',
  libSearch: '',
  libFavOnly: false,
  libSort: 'featured',
  running: null,        // {game, iframe, startedAt, timerId, reported}
  news: [],
};

const THEMES = [
  { id: 'dark', label: 'Dark', locked: false },
  { id: 'light', label: 'Light', locked: false },
  { id: 'synthwave', label: 'Synthwave (unlock: 3 achievements)', unlock: 'ach3' },
  { id: 'terminal', label: 'Terminal (unlock: 1 hour played)', unlock: 'time1h' },
];

const CARD_EMOJI = {
  'dungeon-rpg': '⚔️', 'civ-god-sim': '🏛️', 'deep-ocean-survival': '🌊',
  'physics-destruction': '💥', 'spaceflight-explorer': '🚀',
};

Object.assign(CARD_EMOJI, {
  'alien-colony': '👽', 'asteroid-drift': '☄️', 'ecosystem-sandbox': '🌿',
  'gravity-lander': '🌙', 'hex-tactics': '⬡', 'ragdoll-toss': '🎯',
  'tower-siege': '🏰', 'tunnel-runner': '🏎️', 'soccer-penalty-pro': '⚽',
  'street-hoops': '🏀', 'gridiron-drive': '🏈', 'tennis-rally': '🎾',
  'home-run-derby': '⚾', 'ice-hockey-showdown': '🏒', 'championship-bowling': '🎳',
  'skatepark-legends': '🛹', 'world-cup-soccer': '🏆', 'mini-golf-tour': '⛳',
  'beach-volleyball': '🏐', 'ping-pong-champion': '🏓',
  'neon-breach-fps': '🔫', 'emberfall-story': '🔥', 'turbo-apex-racer': '🏁',
  'skybound-platformer': '☁️',
  'shadow-protocol': '👤', 'dead-signal': '📻', 'ironfront-arena': '💣',
  'frontier-odyssey': '🤠',
  'breachpoint-ops': '🎯', 'crypt-raiders': '🗝️', 'mech-arena': '🤖',
  'samurai-odyssey': '🗡️', 'orbital-command': '🛰️', 'kingdom-chess': '♟️',
  'circuit-forge': '⚡', 'metro-tycoon': '🚇', 'cafe-empire': '☕',
  'farmstead-seasons': '🌾', 'fishing-legends': '🎣', 'pet-rescue-clinic': '🐾',
  'rally-legends': '🏎️', 'superbike-circuit': '🏍️', 'ocean-regatta': '⛵',
  'sky-aces': '✈️', 'midnight-detective': '🔎', 'starship-echoes': '🌌',
  'pirate-chronicles': '🏴‍☠️', 'dragonbound-legacy': '🐉', 'beat-forge': '🎵',
  'deckbound-rogue': '🃏', 'neon-pinball': '🔮', 'blast-maze': '💣',
  'street-drift-underground': '🚘', 'motocross-mayhem': '🏍️', 'hover-league-zero': '🛸',
  'alpine-rush': '🏂', 'knockout-club': '🥊', 'pro-wrestling-empire': '🤼',
  'cricket-championship': '🏏', 'billiards-master': '🎱',
  'neon-shmup': '🚀', 'shadow-metroid': '🤖', 'rune-match-quest': '💎',
  'fortress-defense': '🏯', 'typing-overdrive': '⌨️', 'twin-stick-onslaught': '🎯',
  'rogue-mines': '⛏️', 'synth-rider': '🎶',
  'cyber-noir-2088': '🕵️', 'europa-survivor': '🧊', 'tombs-of-atlantis': '🔱',
  'silent-embassy': '🕶️', 'blackwood-manor': '🕯️', 'timekeepers-paradox': '⌛',
  'wildlands-expedition': '🧭', 'crown-and-dagger': '👑',
  'pilot-fuel-tanker-training': '🛢️', 'voxhaven': '🌌',
});

// ---------------------------------------------------------------- boot
async function boot() {
  injectBaseCSS();
  state.settings = await Settings.getSettings();
  state.profile = await Profile.getProfile();
  state.favorites = (await Save.idbGet('meta', 'favorites')) || [];
  applyTheme(state.settings.video.theme);
  applyAccessibility(state.settings.accessibility);

  await loadGames();
  await loadNews();
  await checkThemeUnlocks(false);

  bindNav();
  renderAll();
  const requestedView = new URLSearchParams(location.search).get('view');
  if (['home', 'library', 'achievements', 'profile', 'settings', 'news'].includes(requestedView)) showView(requestedView);
  setupHost();
  setupKeyboardNav();
  setupGamepadNav();
}

async function loadGames() {
  let registry;
  let assetManifest = { entries: [] };
  try {
    registry = await (await fetch('../games/registry.json')).json();
  } catch (e) {
    toast('Registry error', 'Could not load games/registry.json', 'err');
    return;
  }
  try {
    assetManifest = await (await fetch('../games/asset-manifest.json')).json();
  } catch (e) {
    console.warn('[hub] asset manifest unavailable; using game manifests only');
  }
  const assetById = new Map((assetManifest.entries || []).map(entry => [entry.id, entry]));
  const games = [];
  for (const id of registry.games || []) {
    try {
      const m = await (await fetch(`../games/${id}/manifest.json`)).json();
      if (!m || !m.id || !m.title || !m.entry) throw new Error('bad manifest');
      // Availability: does the entry file actually exist? Never fake-playable.
      let available = false;
      if (!m.locked) {
        try {
          const head = await fetch(`../${m.entry}`, { method: 'HEAD' });
          available = head.ok;
        } catch { available = false; }
      }
      games.push({ ...m, ...(assetById.get(id) || {}), available });
    } catch {
      // bad manifest: skipped, never a broken card
      console.warn(`[hub] skipped bad manifest for "${id}"`);
    }
  }
  state.games = games;
}

async function loadNews() {
  try {
    const data = await (await fetch('news.json')).json();
    state.news = data.items || [];
  } catch { state.news = []; }
}

// ---------------------------------------------------------------- theme
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (state.running) host.sendTheme(theme);
}

function themeUnlocked(t) {
  if (!t.unlock) return true;
  return state.profile.themeUnlocks.includes(t.id);
}

async function checkThemeUnlocks(announce = true) {
  const stats = await Ach.globalStats(state.games);
  const newly = [];
  if (stats.unlocked >= 3 && !state.profile.themeUnlocks.includes('synthwave')) {
    await Profile.unlockTheme('synthwave'); newly.push('Synthwave');
  }
  if (state.profile.totalPlaytimeSec >= 3600 && !state.profile.themeUnlocks.includes('terminal')) {
    await Profile.unlockTheme('terminal'); newly.push('Terminal');
  }
  if (newly.length) {
    state.profile = await Profile.getProfile();
    if (announce) newly.forEach(n => toast('Theme unlocked!', `${n} theme is now available in Settings → Video.`, 'ach'));
    if (state.view === 'settings') renderSettings();
  }
}

// ---------------------------------------------------------------- navigation
function bindNav() {
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  $('#miniProfile').addEventListener('click', () => showView('profile'));
  $('#miniProfile').tabIndex = 0;
  $('#miniProfile').addEventListener('keydown', e => { if (e.key === 'Enter') showView('profile'); });
}

function showView(view) {
  state.view = view;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  const render = {
    home: renderHome, library: renderLibrary, achievements: renderAchievements,
    profile: renderProfile, settings: renderSettings, news: renderNews,
  }[view];
  if (render) render();
}

function renderAll() {
  renderMiniProfile();
  renderHome();
  renderLibrary();
  renderAchievements();
  renderProfile();
  renderSettings();
  renderNews();
}

function renderMiniProfile() {
  $('#miniAvatar').textContent = state.profile.avatar;
  $('#miniName').textContent = state.profile.name;
  $('#miniPlaytime').textContent = `${Profile.formatPlaytime(state.profile.totalPlaytimeSec)} played`;
}

// ---------------------------------------------------------------- home
function renderHome() {
  const playable = state.games.filter((game) => game.available && !game.locked);
  const hero = playable.length ? playable[Math.floor(Date.now() / 86400000) % playable.length] : state.games[0];
  if (hero) {
    $('.hero-kicker').textContent = 'DAILY FEATURE';
    $('#heroTitle').textContent = hero.title;
    $('#heroDesc').textContent = hero.description || '';
    const playBtn = $('#heroPlay');
    playBtn.disabled = !hero.available;
    playBtn.textContent = hero.available ? '▶ Play' : '⏳ Installing — ships next';
    playBtn.onclick = () => hero.available && launchGame(hero);
    $('#heroDetails').onclick = () => openDetails(hero);
  }

  // Continue row
  const cRow = $('#continueRow');
  cRow.innerHTML = '';
  const cps = Object.entries(state.profile.continuePoints)
    .sort((a, b) => b[1].at - a[1].at).slice(0, 4);
  if (!cps.length) cRow.innerHTML = '<div class="empty-note">No games in progress yet — start one from the Library.</div>';
  for (const [gid, cp] of cps) {
    const g = state.games.find(x => x.id === gid);
    if (!g) continue;
    cRow.appendChild(gameCard(g, { subtitle: `▶ ${cp.label}`, onClick: () => launchGame(g, cp.slot) }));
  }

  // Recently played
  const rRow = $('#recentRow');
  rRow.innerHTML = '';
  const recent = Profile.recentlyPlayed(state.profile, 6);
  if (!recent.length) rRow.innerHTML = '<div class="empty-note">Nothing played yet.</div>';
  for (const gid of recent) {
    const g = state.games.find(x => x.id === gid);
    if (g) rRow.appendChild(gameCard(g));
  }

  // News (compact)
  const hn = $('#homeNews');
  hn.innerHTML = '';
  state.news.slice(0, 3).forEach(n => hn.appendChild(newsItem(n)));

  renderStatsInto($('#homeStats'));
}

async function renderStatsInto(el) {
  const stats = await Ach.globalStats(state.games);
  const gamesPlayed = Object.keys(state.profile.gamesPlayed).length;
  el.innerHTML = '';
  const boxes = [
    [Profile.formatPlaytime(state.profile.totalPlaytimeSec), 'Total playtime'],
    [String(gamesPlayed), 'Games played'],
    [`${stats.unlocked}/${stats.total}`, 'Achievements'],
    [String(state.games.filter(g => g.available).length), 'Playable now'],
  ];
  for (const [num, label] of boxes) {
    const d = document.createElement('div');
    d.className = 'stat-box';
    d.innerHTML = `<div class="stat-num">${num}</div><div class="stat-label">${label}</div>`;
    el.appendChild(d);
  }
}

// ---------------------------------------------------------------- game cards
function gameCard(g, opts = {}) {
  const card = document.createElement('div');
  const playable = g.available && !g.locked;
  card.className = 'game-card' + (playable ? '' : ' locked');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', g.title);
  const emoji = CARD_EMOJI[g.id] || '🎮';
  const thumb = thumbnailUrl(g);
  const artStyle = thumb ? ` style="background-image:url('${thumb}')"` : '';
  const statusBadge = g.locked
    ? '<span class="badge locked">🔒 Locked</span>'
    : (!g.available ? '<span class="badge locked">⏳ Installing</span>' : '');
  card.innerHTML = `
    <div class="card-art"${artStyle}>${thumb ? '' : emoji}</div>
    ${playable ? '' : '<div class="lock-overlay">' + (g.locked ? '🔒' : '⏳') + '</div>'}
    <div class="card-body">
      <div class="card-title">${esc(g.title)}</div>
      <div class="card-sub">
        <span class="badge ${g.category}">${g.category}</span>
        ${statusBadge}
        ${opts.subtitle ? `<span>${esc(opts.subtitle)}</span>` : ''}
      </div>
    </div>`;
  const fav = document.createElement('button');
  fav.className = 'card-fav' + (state.favorites.includes(g.id) ? ' on' : '');
  fav.textContent = state.favorites.includes(g.id) ? '♥' : '♡';
  fav.title = 'Favorite';
  fav.setAttribute('aria-label', `Favorite ${g.title}`);
  fav.addEventListener('click', async (e) => {
    e.stopPropagation();
    await toggleFavorite(g.id);
    fav.classList.toggle('on', state.favorites.includes(g.id));
    fav.textContent = state.favorites.includes(g.id) ? '♥' : '♡';
    if (state.libFavOnly) renderLibrary();
  });
  card.appendChild(fav);
  const activate = () => {
    if (opts.onClick) return opts.onClick();
    openDetails(g);
  };
  card.addEventListener('click', activate);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  return card;
}

function thumbnailUrl(game) {
  if (game.thumbnail && /^[a-z0-9_./-]+$/i.test(game.thumbnail) && !game.thumbnail.includes('..')) {
    return `../games/${encodeURIComponent(game.id)}/${game.thumbnail}`;
  }
  return `../assets/catalog-title-cards/${encodeURIComponent(game.id)}.svg`;
}

async function toggleFavorite(id) {
  const i = state.favorites.indexOf(id);
  if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(id);
  await Save.idbPut('meta', 'favorites', state.favorites);
}

// ---------------------------------------------------------------- library
function renderLibrary() {
  const catRow = $('#catFilters');
  if (!catRow.childElementCount) {
    const cats = ['all', ...new Set(state.games.map((game) => game.category).filter(Boolean))];
    for (const c of cats) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (c === state.libCategory ? ' active' : '');
      const count = c === 'all' ? state.games.length : state.games.filter((game) => game.category === c).length;
      chip.textContent = `${c === 'all' ? 'All' : c[0].toUpperCase() + c.slice(1)} ${count}`;
      chip.dataset.cat = c;
      chip.addEventListener('click', () => {
        state.libCategory = c;
        $$('#catFilters .chip').forEach(x => x.classList.toggle('active', x.dataset.cat === c));
        renderLibrary();
      });
      catRow.appendChild(chip);
    }
    $('#searchBox').addEventListener('input', e => { state.libSearch = e.target.value.toLowerCase(); renderLibrary(); });
    $('#favOnly').addEventListener('change', e => { state.libFavOnly = e.target.checked; renderLibrary(); });
    $('#sortGames').addEventListener('change', e => { state.libSort = e.target.value; renderLibrary(); });
    $('#randomPlay').addEventListener('click', () => {
      const choices = state.games.filter((game) => game.available && !game.locked);
      if (choices.length) launchGame(choices[Math.floor(Math.random() * choices.length)]);
    });
  }

  const grid = $('#libraryGrid');
  grid.innerHTML = '';
  const q = state.libSearch;
  const shown = state.games.filter(g => {
    if (state.libCategory !== 'all' && g.category !== state.libCategory) return false;
    if (state.libFavOnly && !state.favorites.includes(g.id)) return false;
    const searchable = [g.title, g.category, g.description, ...(g.tags || [])].join(' ').toLowerCase();
    if (q && !searchable.includes(q)) return false;
    return true;
  });
  const order = new Map(state.games.map((game, index) => [game.id, index]));
  shown.sort((a, b) => {
    const playableOrder = score(b) - score(a);
    if (playableOrder) return playableOrder;
    if (state.libSort === 'title') return a.title.localeCompare(b.title);
    if (state.libSort === 'genre') return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
    if (state.libSort === 'newest') return order.get(b.id) - order.get(a.id);
    return order.get(a.id) - order.get(b.id);
  });
  function score(g) { return g.available && !g.locked ? 2 : (!g.locked ? 1 : 0); }
  shown.forEach(g => grid.appendChild(gameCard(g)));
  $('#libraryEmpty').classList.toggle('hidden', shown.length > 0);
  const playable = state.games.filter((game) => game.available && !game.locked).length;
  const remaining = Math.max(0, 80 - state.games.length);
  $('#librarySummary').textContent = `${playable} playable · ${state.games.length} total · ${shown.length} shown${remaining ? ` · ${remaining} to the 80-game target` : ''}`;
}

// ---------------------------------------------------------------- details modal
async function openDetails(g) {
  const body = $('#modalBody');
  const emoji = CARD_EMOJI[g.id] || '🎮';
  const playable = g.available && !g.locked;
  const statusLine = g.locked
    ? '<p class="dim">🔒 This flagship is locked — in development. It will unlock automatically when it ships.</p>'
    : (!g.available ? '<p class="dim">⏳ Installing — this game is next on the build slate and its card goes live the moment its files land.</p>' : '');
  const thumb = thumbnailUrl(g);
  body.innerHTML = `
    <div class="modal-art"${thumb ? ` style="background-image:url('${thumb}')"` : ''}>${thumb ? '' : emoji}</div>
    <h1>${esc(g.title)}</h1>
    <div class="modal-tags">
      <span class="badge ${g.category}">${g.category}</span>
      ${(g.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
      <span class="tag">stack: ${esc(g.stack || '?')}</span>
    </div>
    <p class="dim">${esc(g.description || '')}</p>
    ${statusLine}
    <div class="row-gap" style="margin:16px 0">
      <button id="mPlay" class="btn primary" ${playable ? '' : 'disabled'}>▶ Play</button>
      <button id="m3d" class="btn">3D Kit Preview</button>
      <button id="mFav" class="btn">${state.favorites.includes(g.id) ? '♥ Unfavorite' : '♡ Favorite'}</button>
    </div>
    <h2>Save Slots</h2>
    <div id="mSlots"><span class="dim small">Loading…</span></div>
    ${(g.achievements || []).length ? `<h2>Achievements</h2><div id="mAch"></div>` : ''}
  `;
  $('#modalBackdrop').classList.remove('hidden');
  $('#mPlay').onclick = () => { closeModal(); launchGame(g); };
  $('#m3d').onclick = () => { window.open(`kit-preview.html?id=${encodeURIComponent(g.id)}`, '_blank', 'noopener'); };
  $('#mFav').onclick = async () => {
    await toggleFavorite(g.id);
    $('#mFav').textContent = state.favorites.includes(g.id) ? '♥ Unfavorite' : '♡ Favorite';
    renderLibrary();
  };

  // save slots
  const slotsEl = $('#mSlots');
  const saves = await Save.listSaves(g.id);
  slotsEl.innerHTML = '';
  if (!saves.length) slotsEl.innerHTML = '<span class="dim small">No saves yet.</span>';
  for (const s of saves.sort((a, b) => b.savedAt - a.savedAt)) {
    const row = document.createElement('div');
    row.className = 'save-slot-row';
    const thumb = s.meta.thumbnail
      ? `<img class="slot-thumb" src="${s.meta.thumbnail}" alt="">`
      : `<div class="slot-thumb ph">🎮</div>`;
    row.innerHTML = `
      ${thumb}
      <div class="slot-info">
        <div><b>${esc(s.meta.label)}</b> <span class="dim small">(${s.slot})</span></div>
        <div class="dim small">${new Date(s.savedAt).toLocaleString()} · ${Profile.formatPlaytime(s.meta.playtimeSec)}${s.meta.difficulty ? ' · ' + esc(String(s.meta.difficulty)) : ''}</div>
      </div>
      <div class="slot-actions">
        <button class="btn mini load" ${playable ? '' : 'disabled'}>Load</button>
        <button class="btn mini danger del">Delete</button>
      </div>`;
    row.querySelector('.load').onclick = () => { closeModal(); launchGame(g, s.slot); };
    row.querySelector('.del').onclick = async () => {
      await Save.deleteSave(g.id, s.slot);
      if (state.profile.continuePoints[g.id]?.slot === s.slot) {
        delete state.profile.continuePoints[g.id];
        await Profile.saveProfile(state.profile);
        renderHome();
      }
      row.remove();
      toast('Save deleted', `${g.title} — ${s.slot}`);
    };
    slotsEl.appendChild(row);
  }

  // achievements list
  if ((g.achievements || []).length) {
    const achEl = $('#mAch');
    const list = await Ach.achievementsForDisplay(g.id, g.achievements);
    achEl.innerHTML = '';
    list.forEach(a => achEl.appendChild(achRow(a)));
  }
}

function closeModal() { $('#modalBackdrop').classList.add('hidden'); }
$('#modalClose').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });

// ---------------------------------------------------------------- achievements view
function achRow(a) {
  const row = document.createElement('div');
  const hidden = a.hidden && !a.unlocked;
  row.className = 'ach-row' + (a.unlocked ? ' unlocked' : '');
  const pct = Math.round((a.progress || 0) * 100);
  row.innerHTML = `
    <div class="ach-icon">${a.unlocked ? '🏆' : (hidden ? '❓' : '🔒')}</div>
    <div class="ach-info">
      <div class="ach-title">${hidden ? '???' : esc(a.title)}</div>
      <div class="ach-desc">${hidden ? 'Hidden achievement — keep playing to reveal it.' : esc(a.desc)}</div>
      ${a.progressive && !a.unlocked && !hidden ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
    </div>
    <div class="ach-meta">
      <div class="rarity ${a.rarity}">${a.rarity}</div>
      ${a.unlocked ? `<div>${new Date(a.unlockedAt).toLocaleDateString()}</div>` : (a.progressive && !hidden ? `<div>${pct}%</div>` : '')}
    </div>`;
  return row;
}

async function renderAchievements() {
  const stats = await Ach.globalStats(state.games);
  $('#achSummary').textContent = `${stats.unlocked} of ${stats.total} unlocked`;
  const wrap = $('#achList');
  wrap.innerHTML = '';
  let any = false;
  for (const g of state.games) {
    if (!(g.achievements || []).length) continue;
    any = true;
    const sec = document.createElement('div');
    sec.className = 'ach-game';
    const list = await Ach.achievementsForDisplay(g.id, g.achievements);
    const got = list.filter(a => a.unlocked).length;
    sec.innerHTML = `<h2>${esc(g.title)} — ${got}/${list.length}</h2>`;
    list.forEach(a => sec.appendChild(achRow(a)));
    wrap.appendChild(sec);
  }
  if (!any) wrap.innerHTML = '<div class="empty">No achievements defined yet — they arrive with each game.</div>';
}

// ---------------------------------------------------------------- profile view
const AVATARS = ['🎮', '👾', '🕹️', '🐉', '🦊', '🐺', '🚀', '⚔️', '🛡️', '🧙', '🤖', '👑', '🔥', '🌊', '⭐', '💀'];

function renderProfile() {
  $('#avatarBtn').textContent = state.profile.avatar;
  $('#nameInput').value = state.profile.name;
  $('#joinedAt').textContent = state.profile.createdAt ? new Date(state.profile.createdAt).toLocaleDateString() : 'today';

  const picker = $('#avatarPicker');
  if (!picker.childElementCount) {
    for (const a of AVATARS) {
      const b = document.createElement('button');
      b.className = 'avatar-opt';
      b.textContent = a;
      b.addEventListener('click', async () => {
        state.profile = await Profile.updateProfile({ avatar: a });
        picker.classList.add('hidden');
        renderProfile(); renderMiniProfile();
      });
      picker.appendChild(b);
    }
    $('#avatarBtn').addEventListener('click', () => picker.classList.toggle('hidden'));
    $('#nameInput').addEventListener('change', async e => {
      const name = e.target.value.trim() || 'Player One';
      state.profile = await Profile.updateProfile({ name });
      renderMiniProfile();
      if (state.running) host.sendProfile(state.profile);
    });
    $('#backupBtn').addEventListener('click', exportBackup);
    $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
    $('#restoreFile').addEventListener('change', importBackup);
  }

  renderStatsInto($('#profileStats'));

  const pt = $('#playtimeList');
  pt.innerHTML = '';
  const entries = Object.entries(state.profile.gamesPlayed).sort((a, b) => b[1].playtimeSec - a[1].playtimeSec);
  if (!entries.length) pt.innerHTML = '<span class="dim small">No playtime recorded yet.</span>';
  for (const [gid, g] of entries) {
    const game = state.games.find(x => x.id === gid);
    const row = document.createElement('div');
    row.className = 'pt-row';
    row.innerHTML = `<span>${esc(game ? game.title : gid)}</span><span class="dim">${Profile.formatPlaytime(g.playtimeSec)} · ${g.launches} launch${g.launches === 1 ? '' : 'es'}</span>`;
    pt.appendChild(row);
  }
}

async function exportBackup() {
  const backup = await Save.exportAllSaves();
  backup.profile = state.profile;
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `empire-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Backup exported', 'All save slots written to a local JSON file.');
}

async function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const n = await Save.importAllSaves(backup);
    toast('Backup imported', `${n} save slot${n === 1 ? '' : 's'} restored.`);
  } catch (err) {
    toast('Import failed', String(err.message || err), 'err');
  }
  e.target.value = '';
}

// ---------------------------------------------------------------- settings view
let settingsTab = 'audio';

function renderSettings() {
  const tabs = $('#settingsTabs');
  if (!tabs.dataset.bound) {
    tabs.dataset.bound = '1';
    $$('#settingsTabs .tab').forEach(t => t.addEventListener('click', () => {
      settingsTab = t.dataset.tab;
      $$('#settingsTabs .tab').forEach(x => x.classList.toggle('active', x === t));
      renderSettingsPanel();
    }));
    $('#resetSettingsBtn').addEventListener('click', async () => {
      state.settings = await Settings.resetSettings();
      applyTheme(state.settings.video.theme);
      applyAccessibility(state.settings.accessibility);
      broadcastSettings();
      renderSettingsPanel();
      toast('Settings reset', 'All settings restored to defaults (non-inverted controls).');
    });
  }
  renderSettingsPanel();
}

async function setSetting(patch) {
  state.settings = await Settings.updateSettings(patch);
  applyAccessibility(state.settings.accessibility);
  broadcastSettings();
}

function broadcastSettings() {
  if (state.running) host.sendSettings(state.settings);
}

function renderSettingsPanel() {
  const el = $('#settingsPanels');
  el.innerHTML = '';
  const s = state.settings;
  const add = (node) => el.appendChild(node);

  if (settingsTab === 'audio') {
    add(rangeRow('Master Volume', s.audio.master, v => setSetting({ audio: { master: v } })));
    add(rangeRow('Music', s.audio.music, v => setSetting({ audio: { music: v } })));
    add(rangeRow('Sound Effects', s.audio.sfx, v => setSetting({ audio: { sfx: v } })));
    add(rangeRow('UI Sounds', s.audio.ui, v => setSetting({ audio: { ui: v } })));
    add(toggleRow('Mute All', s.audio.muted, v => setSetting({ audio: { muted: v } })));
  }

  if (settingsTab === 'video') {
    const themeSel = selectRow('Theme',
      THEMES.map(t => ({ value: t.id, label: t.label, disabled: !themeUnlocked(t) })),
      s.video.theme,
      async v => { await setSetting({ video: { theme: v } }); applyTheme(v); });
    add(themeSel);
    add(selectRow('Quality', [
      { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' },
    ], s.video.quality, v => setSetting({ video: { quality: v } })));
    add(selectRow('FPS Cap', [
      { value: '30', label: '30' }, { value: '60', label: '60' }, { value: '120', label: '120' }, { value: '0', label: 'Uncapped' },
    ], String(s.video.fpsCap), v => setSetting({ video: { fpsCap: +v } })));
    add(toggleRow('Prefer Fullscreen in games', s.video.fullscreenPreferred, v => setSetting({ video: { fullscreenPreferred: v } })));
  }

  if (settingsTab === 'controls') {
    add(toggleRow('Invert Y-Axis (mouse look)', s.controls.invertY,
      v => setSetting({ controls: { invertY: v } }),
      'OFF by default — moving the mouse up looks up. Turn on only if you prefer inverted.'));
    add(rangeRow('Mouse Sensitivity', s.controls.mouseSensitivity / 2, v => setSetting({ controls: { mouseSensitivity: v * 2 } })));
    add(toggleRow('Gamepad Enabled', s.controls.gamepadEnabled, v => setSetting({ controls: { gamepadEnabled: v } })));
    add(rangeRow('Gamepad Sensitivity', s.controls.gamepadSensitivity / 2, v => setSetting({ controls: { gamepadSensitivity: v * 2 } })));

    const head = document.createElement('h2');
    head.textContent = 'Key Bindings';
    add(head);
    const ACTIONS = [
      ['forward', 'Move Forward'], ['back', 'Move Back'], ['left', 'Move Left'], ['right', 'Move Right'],
      ['jump', 'Jump'], ['sprint', 'Sprint'], ['crouch', 'Crouch'], ['interact', 'Interact'],
      ['inventory', 'Inventory'], ['map', 'Map'], ['reload', 'Reload'], ['use', 'Use / Consume'],
      ['primary', 'Primary / Attack'], ['secondary', 'Aim / Secondary'], ['pause', 'Pause'],
    ];
    for (const [action, label] of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'setting-row';
      row.innerHTML = `<div class="setting-label">${label}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn bind-btn';
      btn.textContent = labelForCode(s.controls.bindings[action]);
      btn.addEventListener('click', () => startCapture(action, btn));
      const ctl = document.createElement('div');
      ctl.className = 'setting-ctl';
      ctl.appendChild(btn);
      row.appendChild(ctl);
      add(row);
    }
    const rb = document.createElement('button');
    rb.className = 'btn';
    rb.style.marginTop = '12px';
    rb.textContent = 'Reset Bindings to Default';
    rb.addEventListener('click', async () => {
      state.settings = await Settings.resetBindings();
      broadcastSettings();
      renderSettingsPanel();
      toast('Bindings reset', 'WASD / Space / Shift — the American standard.');
    });
    add(rb);
  }

  if (settingsTab === 'accessibility') {
    add(rangeRow('Text Scale', (s.accessibility.textScale - 0.85) / 0.65,
      v => setSetting({ accessibility: { textScale: Math.round((0.85 + v * 0.65) * 100) / 100 } }),
      x => `${Math.round((0.85 + x * 0.65) * 100)}%`));
    add(selectRow('Colorblind Mode', [
      { value: 'none', label: 'None' }, { value: 'protanopia', label: 'Protanopia' },
      { value: 'deuteranopia', label: 'Deuteranopia' }, { value: 'tritanopia', label: 'Tritanopia' },
    ], s.accessibility.colorblindMode, v => setSetting({ accessibility: { colorblindMode: v } })));
    add(toggleRow('Reduced Motion', s.accessibility.reducedMotion, v => setSetting({ accessibility: { reducedMotion: v } })));
    add(toggleRow('High Contrast', s.accessibility.highContrast, v => setSetting({ accessibility: { highContrast: v } })));
    add(toggleRow('Screen Shake', s.accessibility.screenShake, v => setSetting({ accessibility: { screenShake: v } }),
      'Games with camera shake respect this.'));
  }
}

let captureBtn = null;
function startCapture(action, btn) {
  if (captureBtn) captureBtn.classList.remove('capturing');
  captureBtn = btn;
  btn.classList.add('capturing');
  btn.textContent = 'Press a key…';
  const onKey = async (e) => {
    e.preventDefault(); e.stopPropagation();
    cleanup();
    if (e.code === 'Escape' && state.settings.controls.bindings[action] !== 'Escape' && action !== 'pause') {
      btn.textContent = labelForCode(state.settings.controls.bindings[action]);
      return; // Esc cancels capture (unless binding pause itself)
    }
    await applyBinding(action, e.code);
  };
  const onMouse = async (e) => {
    if (e.target === btn && e.type === 'mousedown' && performance.now() - started < 150) return;
    e.preventDefault(); e.stopPropagation();
    cleanup();
    await applyBinding(action, 'Mouse' + e.button);
  };
  const started = performance.now();
  function cleanup() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onMouse, true);
    btn.classList.remove('capturing');
    captureBtn = null;
  }
  setTimeout(() => {
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
  }, 100);
  async function applyBinding(act, code) {
    const bindings = { ...state.settings.controls.bindings };
    for (const [a, c] of Object.entries(bindings)) if (c === code && a !== act) bindings[a] = null;
    bindings[act] = code;
    await setSetting({ controls: { bindings } });
    renderSettingsPanel();
    toast('Key bound', `${act} → ${labelForCode(code)}`);
  }
}

// setting row builders
function rangeRow(label, value01, onChange, fmt) {
  const row = document.createElement('div');
  row.className = 'setting-row';
  const v = Math.max(0, Math.min(1, value01));
  row.innerHTML = `<div class="setting-label">${label}</div>`;
  const ctl = document.createElement('div');
  ctl.className = 'setting-ctl';
  const input = document.createElement('input');
  input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(Math.round(v * 100));
  const val = document.createElement('span');
  val.className = 'range-val';
  const show = x => fmt ? fmt(x) : `${Math.round(x * 100)}%`;
  val.textContent = show(v);
  input.addEventListener('input', () => {
    const x = +input.value / 100;
    val.textContent = show(x);
    onChange(x);
  });
  ctl.append(input, val);
  row.appendChild(ctl);
  return row;
}

function toggleRow(label, checked, onChange, hint) {
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.innerHTML = `<div class="setting-label">${label}${hint ? `<span class="dim">${hint}</span>` : ''}</div>`;
  const ctl = document.createElement('div');
  ctl.className = 'setting-ctl';
  const sw = document.createElement('label');
  sw.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox'; input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  const slider = document.createElement('span');
  slider.className = 'slider';
  sw.append(input, slider);
  ctl.appendChild(sw);
  row.appendChild(ctl);
  return row;
}

function selectRow(label, options, value, onChange) {
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.innerHTML = `<div class="setting-label">${label}</div>`;
  const ctl = document.createElement('div');
  ctl.className = 'setting-ctl';
  const sel = document.createElement('select');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value; opt.textContent = o.label;
    if (o.disabled) opt.disabled = true;
    if (o.value === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  ctl.appendChild(sel);
  row.appendChild(ctl);
  return row;
}

// ---------------------------------------------------------------- news
function newsItem(n) {
  const d = document.createElement('div');
  d.className = 'news-item';
  d.innerHTML = `<div class="news-date">${esc(n.date)}</div><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>`;
  return d;
}

function renderNews() {
  const el = $('#newsList');
  el.innerHTML = '';
  if (!state.news.length) el.innerHTML = '<div class="empty">No news yet.</div>';
  state.news.forEach(n => el.appendChild(newsItem(n)));
}

// ---------------------------------------------------------------- SDK host + launcher
const lastScreenshot = {}; // gameId -> dataURL

const host = new EmpireHost({
  onReady: async (gameId) => ({
    settings: state.settings,
    profile: state.profile,
    theme: state.settings.video.theme,
    resumeSlot: state.running?.resumeSlot || null,
  }),
  saveState: async (gameId, { slot, blob, meta, saveVersion }) => {
    const m = { ...(meta || {}) };
    if (!m.thumbnail && lastScreenshot[gameId]) {
      try { m.thumbnail = await Save.makeThumbnail(lastScreenshot[gameId]); } catch { /* ignore */ }
    } else if (m.thumbnail) {
      try { m.thumbnail = await Save.makeThumbnail(m.thumbnail); } catch { /* keep original */ }
    }
    const game = state.games.find(g => g.id === gameId);
    const rec = await Save.writeSave(gameId, slot, blob, m, saveVersion ?? game?.saveVersion ?? 1);
    return { slot, savedAt: rec.savedAt };
  },
  loadState: async (gameId, { slot }) => {
    const rec = await Save.readSave(gameId, slot);
    return rec || null;
  },
  listSaves: async (gameId) => {
    const saves = await Save.listSaves(gameId);
    return saves.map(s => ({ gameId: s.gameId, slot: s.slot, meta: s.meta, saveVersion: s.saveVersion, savedAt: s.savedAt }));
  },
  unlockAchievement: async (gameId, { id, progress }) => {
    const game = state.games.find(g => g.id === gameId);
    const def = (game?.achievements || []).find(a => a.id === id) || null;
    const { record, justUnlocked } = await Ach.unlockAchievement(gameId, id, progress ?? 1, def);
    if (justUnlocked) {
      const title = def && !def.hidden ? def.title : (def ? def.title : id);
      toast('🏆 Achievement Unlocked!', title, 'ach');
      await checkThemeUnlocks(true);
    }
    return record;
  },
  getSettings: async () => state.settings,
  getProfile: async () => state.profile,
  reportPlaytime: async (gameId, { seconds }) => {
    if (state.running && state.running.game.id === gameId) state.running.reported = true;
    state.profile = await Profile.addPlaytime(gameId, seconds || 0);
    renderMiniProfile();
    await checkThemeUnlocks(true);
    return { totalPlaytimeSec: state.profile.totalPlaytimeSec };
  },
  screenshot: async (gameId, { dataURL }) => {
    if (dataURL) lastScreenshot[gameId] = dataURL;
    return { ok: true };
  },
  setContinuePoint: async (gameId, { slot, label }) => {
    state.profile = await Profile.setContinuePoint(gameId, slot, label);
    return { ok: true };
  },
});

function setupHost() { /* host constructed above; nothing else needed */ }

async function launchGame(game, resumeSlot = null) {
  if (!game.available || game.locked) {
    toast(game.locked ? 'Locked' : 'Not installed yet', `${game.title} isn't playable yet.`);
    return;
  }
  if (state.running) exitGame(); // safety

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
  iframe.setAttribute('allow', 'gamepad; fullscreen');
  iframe.src = `../${game.entry}`;
  $('#gameFrameWrap').innerHTML = '';
  $('#gameFrameWrap').appendChild(iframe);
  $('#gameTitle').textContent = game.title;
  $('#gameOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  host.attach(iframe, game.id);
  state.running = {
    game, iframe, resumeSlot,
    startedAt: Date.now(),
    reported: false,
    paused: false,
    timerId: setInterval(updateSessionClock, 1000),
  };
  state.profile = await Profile.recordLaunch(game.id);
  renderMiniProfile();

  // If resuming a specific slot, push it once the game is ready — games also
  // receive resumeSlot in the ready-reply init data and can pull it themselves.
  if (resumeSlot) {
    const rec = await Save.readSave(game.id, resumeSlot);
    if (rec) setTimeout(() => host.sendLoadSlot(resumeSlot, rec), 800);
  }
  iframe.focus();
}

function updateSessionClock() {
  if (!state.running) return;
  const sec = Math.floor((Date.now() - state.running.startedAt) / 1000);
  const m = Math.floor(sec / 60), s = sec % 60;
  $('#sessionTime').textContent = `${m}:${String(s).padStart(2, '0')}`;
}

async function exitGame() {
  const r = state.running;
  if (!r) return;
  clearInterval(r.timerId);
  const sessionSec = Math.floor((Date.now() - r.startedAt) / 1000);
  // Only add wall-clock time if the game never self-reported (avoid double count).
  if (!r.reported && sessionSec > 0) {
    state.profile = await Profile.addPlaytime(r.game.id, sessionSec);
  }
  host.detach();
  state.running = null;
  $('#gameFrameWrap').innerHTML = '';
  $('#gameOverlay').classList.add('hidden');
  document.body.style.overflow = '';
  renderMiniProfile();
  renderHome();
  await checkThemeUnlocks(true);
}

$('#backToHub').addEventListener('click', exitGame);
$('#pauseGameBtn').addEventListener('click', () => {
  const r = state.running;
  if (!r) return;
  r.paused = !r.paused;
  if (r.paused) { host.pause(); $('#pauseGameBtn').textContent = '▶ Resume'; }
  else { host.resume(); $('#pauseGameBtn').textContent = '⏸ Pause'; r.iframe.focus(); }
});

// ---------------------------------------------------------------- keyboard nav
function setupKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    // '/' focuses search
    if (e.key === '/' && !isTyping(e.target) && !state.running) {
      e.preventDefault();
      showView('library');
      $('#searchBox').focus();
      return;
    }
    if (e.key === 'Escape') {
      if (!$('#modalBackdrop').classList.contains('hidden')) { closeModal(); return; }
      if (captureBtn) return; // capture handler deals with it
      if (state.running) return; // game handles Esc itself (pause)
      return;
    }
    if (state.running || isTyping(e.target)) return;

    // Arrow / WASD focus movement across interactive elements
    const dirMap = {
      ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
    };
    if (e.key in dirMap) {
      const inModal = !$('#modalBackdrop').classList.contains('hidden');
      const scope = inModal ? '#detailsModal' : '#app';
      const els = $$(
        `${scope} button:not(:disabled), ${scope} [tabindex="0"], ${scope} input, ${scope} select`
      ).filter(el => el.offsetParent !== null);
      if (!els.length) return;
      const cur = els.indexOf(document.activeElement);
      let next = cur + dirMap[e.key];
      if (cur === -1) next = 0;
      next = Math.max(0, Math.min(els.length - 1, next));
      els[next].focus();
      e.preventDefault();
    }
  });
}

function isTyping(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

// ---------------------------------------------------------------- gamepad nav
function setupGamepadNav() {
  let prevButtons = [];
  let prevStick = null;
  let lastMove = 0;

  window.addEventListener('gamepadconnected', updatePadStatus);
  window.addEventListener('gamepaddisconnected', updatePadStatus);
  updatePadStatus();

  function updatePadStatus() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const el = $('#padStatus');
    if (pads.length) { el.textContent = `🎮 ${pads[0].id.slice(0, 22)}`; el.classList.add('on'); }
    else { el.textContent = '🎮 no gamepad'; el.classList.remove('on'); }
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!state.settings?.controls?.gamepadEnabled) return;
    if (state.running) return; // game consumes the pad while running
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) { prevButtons = []; return; }

    const pressed = (i) => pad.buttons[i] && pad.buttons[i].pressed;
    const edge = (i) => pressed(i) && !prevButtons[i];

    // dpad + left stick -> focus movement
    const now = performance.now();
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    let dir = null;
    if (edge(GAMEPAD.LEFT) || ax < -0.6) dir = -1;
    else if (edge(GAMEPAD.RIGHT) || ax > 0.6) dir = 1;
    else if (edge(GAMEPAD.UP) || ay < -0.6) dir = -1;
    else if (edge(GAMEPAD.DOWN) || ay > 0.6) dir = 1;
    const stickHeld = Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6;
    const isEdgeMove = edge(GAMEPAD.LEFT) || edge(GAMEPAD.RIGHT) || edge(GAMEPAD.UP) || edge(GAMEPAD.DOWN) ||
      (stickHeld && prevStick === null);
    if (dir !== null && (isEdgeMove || (stickHeld && now - lastMove > 220))) {
      moveFocus(dir);
      lastMove = now;
    }
    prevStick = stickHeld ? dir : null;

    if (edge(GAMEPAD.A)) {
      const el = document.activeElement;
      if (el && el !== document.body) el.click();
    }
    if (edge(GAMEPAD.B)) {
      if (!$('#modalBackdrop').classList.contains('hidden')) closeModal();
      else showView('home');
    }
    // LB/RB cycle views
    const views = ['home', 'library', 'achievements', 'profile', 'settings', 'news'];
    if (edge(GAMEPAD.LB)) showView(views[(views.indexOf(state.view) + views.length - 1) % views.length]);
    if (edge(GAMEPAD.RB)) showView(views[(views.indexOf(state.view) + 1) % views.length]);

    prevButtons = pad.buttons.map(b => b.pressed);
  }

  function moveFocus(dir) {
    const inModal = !$('#modalBackdrop').classList.contains('hidden');
    const scope = inModal ? '#detailsModal' : '#app';
    const els = $$(
      `${scope} button:not(:disabled), ${scope} [tabindex="0"], ${scope} input, ${scope} select`
    ).filter(el => el.offsetParent !== null);
    if (!els.length) return;
    const cur = els.indexOf(document.activeElement);
    let next = cur === -1 ? 0 : Math.max(0, Math.min(els.length - 1, cur + dir));
    els[next].focus();
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- toasts
function toast(title, body, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<h4>${esc(title)}</h4><p>${esc(body)}</p>`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// go
boot().catch(err => {
  console.error('[hub] boot failed', err);
  toast('Hub failed to start', String(err.message || err), 'err');
});
