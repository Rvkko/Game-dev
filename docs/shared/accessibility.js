/**
 * EMPIRE accessibility.js — applies accessibility settings to a document:
 * text scale (CSS var), colorblind-safe palettes, reduced motion, high contrast.
 * Works in the hub and in any game page that imports it.
 */

// Colorblind-safe palettes (Okabe–Ito based). Games/hub reference these CSS vars
// for gameplay-critical colors: --acc-good, --acc-bad, --acc-warn, --acc-info, --acc-accent.
export const PALETTES = {
  none:         { good: '#38c172', bad: '#e3342f', warn: '#f6993f', info: '#3490dc', accent: '#9561e2' },
  protanopia:   { good: '#0072b2', bad: '#e69f00', warn: '#f0e442', info: '#56b4e9', accent: '#cc79a7' },
  deuteranopia: { good: '#0072b2', bad: '#e69f00', warn: '#f0e442', info: '#56b4e9', accent: '#cc79a7' },
  tritanopia:   { good: '#009e73', bad: '#d55e00', warn: '#e69f00', info: '#0072b2', accent: '#cc79a7' },
};

/** Apply accessibility settings object ({textScale, colorblindMode, reducedMotion, highContrast, screenShake}). */
export function applyAccessibility(acc, doc = document) {
  if (!acc) return;
  const root = doc.documentElement;
  const scale = Math.min(1.5, Math.max(0.85, acc.textScale || 1));
  root.style.setProperty('--text-scale', String(scale));
  const pal = PALETTES[acc.colorblindMode] || PALETTES.none;
  root.style.setProperty('--acc-good', pal.good);
  root.style.setProperty('--acc-bad', pal.bad);
  root.style.setProperty('--acc-warn', pal.warn);
  root.style.setProperty('--acc-info', pal.info);
  root.style.setProperty('--acc-accent', pal.accent);
  root.classList.toggle('reduced-motion', !!acc.reducedMotion);
  root.classList.toggle('high-contrast', !!acc.highContrast);
  root.dataset.colorblind = acc.colorblindMode || 'none';
}

/** True if animations should be skipped (setting OR OS-level preference). */
export function motionReduced(acc) {
  if (acc && acc.reducedMotion) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Screen-shake multiplier for games: 0 when disabled, else 1. */
export function shakeScale(acc) {
  return acc && acc.screenShake === false ? 0 : 1;
}

/** Base CSS every page can inject to honor reduced motion + text scale. */
export const BASE_CSS = `
:root { --text-scale: 1; }
html { font-size: calc(16px * var(--text-scale)); }
.reduced-motion *, .reduced-motion *::before, .reduced-motion *::after {
  animation-duration: 0.001s !important;
  transition-duration: 0.001s !important;
}
`;

export function injectBaseCSS(doc = document) {
  if (doc.getElementById('empire-a11y-css')) return;
  const style = doc.createElement('style');
  style.id = 'empire-a11y-css';
  style.textContent = BASE_CSS;
  doc.head.appendChild(style);
}
