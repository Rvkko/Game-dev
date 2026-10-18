/**
 * EMPIRE settings.js — singleton settings in IndexedDB store "settings", key "main".
 * Canonical schema (spec item 9). invertY defaults FALSE — never ship inverted.
 */
import { idbGet, idbPut } from './save.js';

const KEY = 'main';

export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'ControlLeft',
  interact: 'KeyE', inventory: 'KeyI', map: 'KeyM',
  reload: 'KeyR', use: 'KeyF', pause: 'Escape',
  primary: 'Mouse0', secondary: 'Mouse2',
};

export const DEFAULT_SETTINGS = {
  audio: { master: 0.8, music: 0.7, sfx: 0.9, ui: 0.8, muted: false },
  video: { theme: 'dark', quality: 'high', fpsCap: 60, fullscreenPreferred: false, vsync: true },
  controls: {
    invertY: false,               // NON-INVERTED default, opt-in only
    mouseSensitivity: 1.0,
    gamepadEnabled: true,
    gamepadSensitivity: 1.0,
    bindings: { ...DEFAULT_BINDINGS },
  },
  accessibility: {
    textScale: 1.0,               // 0.85–1.5
    colorblindMode: 'none',       // none|protanopia|deuteranopia|tritanopia
    reducedMotion: false,
    highContrast: false,
    screenShake: true,
  },
  units: 'imperial',
};

function heal(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (target[k] === undefined) target[k] = structuredClone(v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) heal(target[k], v);
  }
  return target;
}

export async function getSettings() {
  let s = await idbGet('settings', KEY);
  if (!s) {
    s = structuredClone(DEFAULT_SETTINGS);
    await idbPut('settings', KEY, s);
  }
  return heal(s, DEFAULT_SETTINGS);
}

export async function saveSettings(s) {
  await idbPut('settings', KEY, s);
  return s;
}

/** Deep-merge a patch, e.g. updateSettings({audio:{master:0.5}}). */
export async function updateSettings(patch) {
  const s = await getSettings();
  deepMerge(s, patch);
  return saveSettings(s);
}

function deepMerge(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') {
      deepMerge(dst[k], v);
    } else {
      dst[k] = v;
    }
  }
}

export async function resetSettings() {
  const s = structuredClone(DEFAULT_SETTINGS);
  await saveSettings(s);
  return s;
}

export async function resetBindings() {
  return updateSettings({ controls: { bindings: { ...DEFAULT_BINDINGS } } });
}
