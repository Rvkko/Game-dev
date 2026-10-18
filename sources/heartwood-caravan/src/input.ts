import type { Vec2 } from "./game/types";

export class InputController {
  private keys = new Set<string>();
  private joystickPointer: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private joystickVector: Vec2 = { x: 0, z: 0 };

  constructor(private readonly joystick: HTMLElement, private readonly knob: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    joystick.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  getMove(): Vec2 {
    let x = 0;
    let z = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) z -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) z += 1;
    x += this.joystickVector.x;
    z += this.joystickVector.z;
    const length = Math.hypot(x, z);
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.joystick.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
  }

  private onKeyDown = (event: KeyboardEvent) => this.keys.add(event.code);
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private onPointerDown = (event: PointerEvent) => {
    this.joystickPointer = event.pointerId;
    this.joystickOrigin = { x: event.clientX, y: event.clientY };
    this.joystick.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.joystickPointer) return;
    const dx = event.clientX - this.joystickOrigin.x;
    const dy = event.clientY - this.joystickOrigin.y;
    const length = Math.hypot(dx, dy);
    const limit = 42;
    const scale = length > limit ? limit / length : 1;
    const px = dx * scale;
    const py = dy * scale;
    this.joystickVector = { x: px / limit, z: py / limit };
    this.knob.style.transform = `translate(${px}px, ${py}px)`;
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.joystickPointer) return;
    this.joystickPointer = null;
    this.joystickVector = { x: 0, z: 0 };
    this.knob.style.transform = "translate(0, 0)";
  };
}
