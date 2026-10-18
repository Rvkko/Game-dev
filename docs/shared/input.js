/**
 * EMPIRE input.js — keyboard + mouse + gamepad manager with remapping.
 * Americanized standard: WASD move, mouse-up looks UP (NON-inverted default),
 * Space jump, LShift sprint, LCtrl crouch, E interact, I/Tab inventory, Esc pause,
 * M map, LMB primary, RMB secondary, R reload, F use.
 * Gamepad (Xbox): left stick move, right stick look (non-inverted), A confirm/jump,
 * B cancel/back, X interact, RT primary, LT aim, Start pause.
 */
import { DEFAULT_BINDINGS } from './settings.js';

export const GAMEPAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

export class InputManager {
  /**
   * opts: {bindings, invertY:false, mouseSensitivity:1, gamepadEnabled:true,
   *        gamepadSensitivity:1, deadzone:0.18, target:window}
   */
  constructor(opts = {}) {
    this.bindings = { ...DEFAULT_BINDINGS, ...(opts.bindings || {}) };
    this.invertY = !!opts.invertY; // false by default — non-inverted
    this.mouseSensitivity = opts.mouseSensitivity ?? 1;
    this.gamepadEnabled = opts.gamepadEnabled !== false;
    this.gamepadSensitivity = opts.gamepadSensitivity ?? 1;
    this.deadzone = opts.deadzone ?? 0.18;
    this.target = opts.target || window;

    this.keys = new Set();        // physical codes currently down
    this.actionsDown = new Set(); // logical actions currently down
    this.mouseDelta = { x: 0, y: 0 };
    this.mouseButtons = new Set();
    this._listeners = { action: [], actionup: [], any: [] };
    this._prevPadButtons = [];
    this._padIndex = null;
    this._capturing = null; // action name being rebound, or null

    this._onKeyDown = (e) => this._keyEvent(e.code, true, e);
    this._onKeyUp = (e) => this._keyEvent(e.code, false, e);
    this._onMouseDown = (e) => this._keyEvent('Mouse' + e.button, true, e);
    this._onMouseUp = (e) => this._keyEvent('Mouse' + e.button, false, e);
    this._onMouseMove = (e) => {
      const dy = (e.movementY || 0) * this.mouseSensitivity;
      this.mouseDelta.x += (e.movementX || 0) * this.mouseSensitivity;
      // Non-inverted: mouse up (negative movementY) => look up. Games consume
      // lookDelta.y directly; invertY flips it only when the user opts in.
      this.mouseDelta.y += this.invertY ? -dy : dy;
    };
    this._attached = false;
  }

  attach() {
    if (this._attached) return this;
    const t = this.target;
    t.addEventListener('keydown', this._onKeyDown);
    t.addEventListener('keyup', this._onKeyUp);
    t.addEventListener('mousedown', this._onMouseDown);
    t.addEventListener('mouseup', this._onMouseUp);
    t.addEventListener('mousemove', this._onMouseMove);
    this._attached = true;
    return this;
  }

  detach() {
    if (!this._attached) return this;
    const t = this.target;
    t.removeEventListener('keydown', this._onKeyDown);
    t.removeEventListener('keyup', this._onKeyUp);
    t.removeEventListener('mousedown', this._onMouseDown);
    t.removeEventListener('mouseup', this._onMouseUp);
    t.removeEventListener('mousemove', this._onMouseMove);
    this._attached = false;
    return this;
  }

  applySettings(controls) {
    if (!controls) return;
    if (controls.bindings) this.bindings = { ...DEFAULT_BINDINGS, ...controls.bindings };
    if (controls.invertY !== undefined) this.invertY = !!controls.invertY;
    if (controls.mouseSensitivity !== undefined) this.mouseSensitivity = controls.mouseSensitivity;
    if (controls.gamepadEnabled !== undefined) this.gamepadEnabled = !!controls.gamepadEnabled;
    if (controls.gamepadSensitivity !== undefined) this.gamepadSensitivity = controls.gamepadSensitivity;
  }

  actionForCode(code) {
    for (const [action, bound] of Object.entries(this.bindings)) {
      if (bound === code) return action;
    }
    return null;
  }

  _keyEvent(code, down, e) {
    if (down && this._capturing) {
      // Rebind capture: assign this code to the pending action.
      const action = this._capturing;
      this._capturing = null;
      // Clear the code from any other action to avoid double-binds.
      for (const [a, c] of Object.entries(this.bindings)) {
        if (c === code && a !== action) this.bindings[a] = null;
      }
      this.bindings[action] = code;
      this._emit('any', { type: 'rebound', action, code });
      if (e && e.preventDefault) e.preventDefault();
      return;
    }
    if (down) { if (this.keys.has(code)) return; this.keys.add(code); }
    else this.keys.delete(code);
    if (code.startsWith('Mouse')) {
      const btn = +code.slice(5);
      if (down) this.mouseButtons.add(btn); else this.mouseButtons.delete(btn);
    }
    const action = this.actionForCode(code);
    if (action) {
      if (down) { this.actionsDown.add(action); this._emit('action', { action, code }); }
      else { this.actionsDown.delete(action); this._emit('actionup', { action, code }); }
    }
  }

  /** Begin capture: next key/mouse press becomes the binding for `action`. */
  startRebind(action) { this._capturing = action; }
  cancelRebind() { this._capturing = null; }
  get rebinding() { return this._capturing; }

  isDown(action) { return this.actionsDown.has(action) || this._padActionDown(action); }

  /** Consume accumulated mouse look delta (call once per frame). */
  consumeLookDelta() {
    const d = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0; this.mouseDelta.y = 0;
    const pad = this.getGamepad();
    if (pad) {
      const rx = this._dz(pad.axes[2] || 0), ry = this._dz(pad.axes[3] || 0);
      d.x += rx * 10 * this.gamepadSensitivity;
      const py = ry * 10 * this.gamepadSensitivity;
      d.y += this.invertY ? -py : py;
    }
    return d;
  }

  /** Movement vector from WASD + left stick: {x:-1..1, y:-1..1}, y=+1 forward. */
  moveVector() {
    let x = 0, y = 0;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    const pad = this.getGamepad();
    if (pad) {
      x += this._dz(pad.axes[0] || 0);
      y -= this._dz(pad.axes[1] || 0); // stick up = forward
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  _dz(v) { return Math.abs(v) < this.deadzone ? 0 : v; }

  getGamepad() {
    if (!this.gamepadEnabled || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this._padIndex != null && pads[this._padIndex]) return pads[this._padIndex];
    for (const p of pads) if (p && p.connected) { this._padIndex = p.index; return p; }
    return null;
  }

  _padActionDown(action) {
    const pad = this.getGamepad();
    if (!pad) return false;
    const map = {
      jump: GAMEPAD.A, interact: GAMEPAD.X, pause: GAMEPAD.START,
      primary: GAMEPAD.RT, secondary: GAMEPAD.LT, sprint: GAMEPAD.LS,
      crouch: GAMEPAD.B, inventory: GAMEPAD.Y, reload: GAMEPAD.X, use: GAMEPAD.RB,
    };
    const b = map[action];
    return b !== undefined && pad.buttons[b] && pad.buttons[b].pressed;
  }

  /**
   * Poll gamepad button edges (call once per frame).
   * Returns array of {button, pressed:true} for newly-pressed buttons.
   */
  pollGamepadEdges() {
    const pad = this.getGamepad();
    if (!pad) { this._prevPadButtons = []; return []; }
    const edges = [];
    pad.buttons.forEach((b, i) => {
      const was = !!this._prevPadButtons[i];
      if (b.pressed && !was) edges.push({ button: i, pressed: true });
      this._prevPadButtons[i] = b.pressed;
    });
    // stick-as-dpad edges for menu nav
    const ax = this._dz(pad.axes[0] || 0), ay = this._dz(pad.axes[1] || 0);
    const dir = ax < -0.5 ? 'left' : ax > 0.5 ? 'right' : ay < -0.5 ? 'up' : ay > 0.5 ? 'down' : null;
    if (dir && dir !== this._prevStickDir) edges.push({ stick: dir, pressed: true });
    this._prevStickDir = dir;
    return edges;
  }

  on(event, fn) { (this._listeners[event] || (this._listeners[event] = [])).push(fn); return this; }
  off(event, fn) {
    const l = this._listeners[event]; if (!l) return this;
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); return this;
  }
  _emit(event, data) { for (const fn of (this._listeners[event] || [])) fn(data); }
}

/** Human label for a key code, for the remap UI. */
export function labelForCode(code) {
  if (!code) return '—';
  if (code === 'Mouse0') return 'Left Mouse';
  if (code === 'Mouse1') return 'Middle Mouse';
  if (code === 'Mouse2') return 'Right Mouse';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const nice = {
    Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
    ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt',
    Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace',
  };
  return nice[code] || code;
}
