/**
 * EMPIRE SDK — postMessage RPC between hub (host) and game (client in iframe).
 *
 * Envelope: {__empire:1, type, id?, gameId, payload}
 * Replies:  {__empire:1, type:'reply', id, gameId, ok, data, error}
 *
 * Game -> Hub: ready, saveState, loadState, listSaves, unlockAchievement,
 *              getSettings, getProfile, reportPlaytime, screenshot, setContinuePoint
 * Hub -> Game: init, settingsChanged, profileChanged, themeChanged, loadSlot, pause, resume
 *
 * Client falls back to STANDALONE mode (localStorage) if no hub replies to
 * `ready` within 1500 ms — so a game page also runs when opened directly.
 */

const PROTOCOL = 1;

function envelope(type, gameId, payload, id) {
  const m = { __empire: PROTOCOL, type, gameId, payload };
  if (id !== undefined) m.id = id;
  return m;
}

// ============================== HOST (hub side) ==============================

export class EmpireHost {
  /**
   * handlers: async fns keyed by message type, each (gameId, payload) => data.
   * Required: saveState, loadState, listSaves, unlockAchievement, getSettings,
   * getProfile, reportPlaytime, screenshot, setContinuePoint.
   * Optional: onReady(gameId) called when the game announces itself.
   */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this._iframe = null;
    this._gameId = null;
    this._onMessage = (e) => this._handleMessage(e);
    window.addEventListener('message', this._onMessage);
  }

  /** Bind the host to a mounted game iframe. */
  attach(iframe, gameId) {
    this._iframe = iframe;
    this._gameId = gameId;
  }

  detach() {
    this._iframe = null;
    this._gameId = null;
  }

  destroy() {
    window.removeEventListener('message', this._onMessage);
    this.detach();
  }

  /** Hub -> game fire-and-forget message. */
  send(type, payload = {}) {
    if (!this._iframe || !this._iframe.contentWindow) return false;
    this._iframe.contentWindow.postMessage(envelope(type, this._gameId, payload), '*');
    return true;
  }

  pause() { return this.send('pause'); }
  resume() { return this.send('resume'); }
  sendSettings(settings) { return this.send('settingsChanged', { settings }); }
  sendProfile(profile) { return this.send('profileChanged', { profile }); }
  sendTheme(theme) { return this.send('themeChanged', { theme }); }
  sendLoadSlot(slot, record) { return this.send('loadSlot', { slot, record }); }

  async _handleMessage(e) {
    const m = e.data;
    if (!m || m.__empire !== PROTOCOL || m.type === 'reply') return;
    if (!this._iframe || e.source !== this._iframe.contentWindow) return;
    if (m.gameId !== this._gameId) return;

    const reply = (ok, data, error) => {
      if (m.id === undefined) return;
      e.source.postMessage(
        { __empire: PROTOCOL, type: 'reply', id: m.id, gameId: m.gameId, ok, data, error },
        '*'
      );
    };

    if (m.type === 'ready') {
      try {
        const initData = this.handlers.onReady
          ? await this.handlers.onReady(m.gameId, m.payload || {})
          : {};
        reply(true, initData);
      } catch (err) {
        reply(false, null, String(err && err.message || err));
      }
      return;
    }

    const h = this.handlers[m.type];
    if (!h) { reply(false, null, `unknown message type "${m.type}"`); return; }
    try {
      const data = await h(m.gameId, m.payload || {});
      reply(true, data);
    } catch (err) {
      reply(false, null, String(err && err.message || err));
    }
  }
}

// ============================= CLIENT (game side) ============================

const READY_TIMEOUT_MS = 1500;
const LS_PREFIX = 'empire.standalone.';

export class EmpireClient {
  /**
   * opts: {gameId (required), saveVersion:1,
   *        onInit, onSettings, onProfile, onTheme, onLoadSlot, onPause, onResume}
   */
  constructor(opts) {
    if (!opts || !opts.gameId) throw new Error('EmpireClient requires gameId');
    this.gameId = opts.gameId;
    this.saveVersion = opts.saveVersion ?? 1;
    this.standalone = false;
    this.connected = false;
    this._cb = opts;
    this._nextId = 1;
    this._pending = new Map(); // id -> {resolve, reject}
    this._onMessage = (e) => this._handleMessage(e);
    window.addEventListener('message', this._onMessage);
  }

  /**
   * Announce to the hub. Resolves with init data ({settings, profile, theme, ...})
   * from the hub, or with standalone defaults after the 1500 ms fallback.
   */
  async connect() {
    if (window.parent === window) {
      return this._enterStandalone();
    }
    try {
      const initData = await this._request('ready', { saveVersion: this.saveVersion }, READY_TIMEOUT_MS);
      this.connected = true;
      if (this._cb.onInit) this._cb.onInit(initData);
      return initData;
    } catch {
      return this._enterStandalone();
    }
  }

  _enterStandalone() {
    this.standalone = true;
    this.connected = false;
    const initData = {
      standalone: true,
      settings: this._lsGet('settings') || null,
      profile: this._lsGet('profile') || { name: 'Player One', avatar: '🎮', totalPlaytimeSec: 0 },
      theme: 'dark',
    };
    if (this._cb.onInit) this._cb.onInit(initData);
    return initData;
  }

  destroy() {
    window.removeEventListener('message', this._onMessage);
    for (const p of this._pending.values()) p.reject(new Error('client destroyed'));
    this._pending.clear();
  }

  // ---- Game -> Hub API ----

  /** blob: any structured-cloneable object. meta: {label, playtimeSec, thumbnail, progress, mode, difficulty, seed}. */
  async saveState(slot, blob, meta = {}) {
    if (this.standalone) {
      this._lsSet(`save.${slot}`, { blob, meta, saveVersion: this.saveVersion, savedAt: Date.now() });
      return { slot, standalone: true };
    }
    return this._request('saveState', { slot, blob, meta, saveVersion: this.saveVersion });
  }

  /**
   * Load a slot. Runs window.__empireMigrate(blob, fromVersion) when versions
   * differ; throws Error("version_mismatch") if migration is impossible/fails.
   * Resolves null when the slot is empty.
   */
  async loadState(slot) {
    let record;
    if (this.standalone) {
      record = this._lsGet(`save.${slot}`);
    } else {
      record = await this._request('loadState', { slot });
    }
    if (!record) return null;
    let { blob, saveVersion } = record;
    if (saveVersion !== this.saveVersion) {
      const migrate = window.__empireMigrate;
      if (typeof migrate !== 'function') throw new Error('version_mismatch');
      try {
        blob = await migrate(blob, saveVersion);
        if (blob == null) throw new Error('migrate returned null');
      } catch {
        throw new Error('version_mismatch');
      }
    }
    return { ...record, blob };
  }

  async listSaves() {
    if (this.standalone) {
      const out = [];
      for (const slot of ['auto', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5']) {
        const r = this._lsGet(`save.${slot}`);
        if (r) out.push({ gameId: this.gameId, slot, meta: r.meta, saveVersion: r.saveVersion, savedAt: r.savedAt });
      }
      return out;
    }
    return this._request('listSaves', {});
  }

  /** progress optional 0..1 (or absolute count for progressive achievements). */
  async unlockAchievement(id, progress = 1) {
    if (this.standalone) {
      const key = `ach.${id}`;
      const cur = this._lsGet(key) || { progress: 0, unlocked: false };
      if (!cur.unlocked) {
        cur.progress = Math.min(1, Math.max(cur.progress, progress));
        if (cur.progress >= 1) { cur.unlocked = true; cur.unlockedAt = Date.now(); }
        this._lsSet(key, cur);
      }
      return cur;
    }
    return this._request('unlockAchievement', { id, progress });
  }

  async getSettings() {
    if (this.standalone) return this._lsGet('settings');
    return this._request('getSettings', {});
  }

  async getProfile() {
    if (this.standalone) return this._lsGet('profile') || { name: 'Player One', avatar: '🎮' };
    return this._request('getProfile', {});
  }

  async reportPlaytime(seconds) {
    if (this.standalone) {
      const t = (this._lsGet('playtimeSec') || 0) + seconds;
      this._lsSet('playtimeSec', t);
      return { totalPlaytimeSec: t };
    }
    return this._request('reportPlaytime', { seconds });
  }

  /** Send a screenshot dataURL — hub uses the latest as fallback save thumbnail. */
  async screenshot(dataURL) {
    if (this.standalone) return { ok: true };
    return this._request('screenshot', { dataURL });
  }

  async setContinuePoint(slot, label) {
    if (this.standalone) { this._lsSet('continue', { slot, label, at: Date.now() }); return { slot }; }
    return this._request('setContinuePoint', { slot, label });
  }

  // ---- internals ----

  _request(type, payload, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`timeout waiting for "${type}" reply`));
      }, timeoutMs);
      this._pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      window.parent.postMessage(envelope(type, this.gameId, payload, id), '*');
    });
  }

  _handleMessage(e) {
    const m = e.data;
    if (!m || m.__empire !== PROTOCOL || m.gameId !== this.gameId) return;
    if (m.type === 'reply') {
      const p = this._pending.get(m.id);
      if (!p) return;
      this._pending.delete(m.id);
      if (m.ok) p.resolve(m.data);
      else p.reject(new Error(m.error || 'hub error'));
      return;
    }
    // Hub -> game notifications
    const pl = m.payload || {};
    switch (m.type) {
      case 'init': if (this._cb.onInit) this._cb.onInit(pl); break;
      case 'settingsChanged': if (this._cb.onSettings) this._cb.onSettings(pl.settings); break;
      case 'profileChanged': if (this._cb.onProfile) this._cb.onProfile(pl.profile); break;
      case 'themeChanged': if (this._cb.onTheme) this._cb.onTheme(pl.theme); break;
      case 'loadSlot': if (this._cb.onLoadSlot) this._cb.onLoadSlot(pl.slot, pl.record); break;
      case 'pause': if (this._cb.onPause) this._cb.onPause(); break;
      case 'resume': if (this._cb.onResume) this._cb.onResume(); break;
    }
  }

  _lsKey(k) { return `${LS_PREFIX}${this.gameId}.${k}`; }
  _lsGet(k) {
    try { const v = localStorage.getItem(this._lsKey(k)); return v ? JSON.parse(v) : null; }
    catch { return null; }
  }
  _lsSet(k, v) {
    try { localStorage.setItem(this._lsKey(k), JSON.stringify(v)); } catch { /* quota */ }
  }
}
