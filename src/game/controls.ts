import * as THREE from "three";

export interface InputFrame {
  throttleUp: boolean;
  throttleDown: boolean;
  brake: number;
  mode: boolean;
  reverse: boolean;
  forward: boolean;
  horn: boolean;
  lights: boolean;
  camera: boolean;
  freeCamera: boolean;
  cameraX: number;
  cameraY: number;
  pointerX: number;
  pointerY: number;
  flyForward: number;
  flyStrafe: number;
  flyVertical: number;
  flyFast: boolean;
  activity: boolean;
  pause: boolean;
}

export class Controls {
  private readonly keys = new Set<string>();
  private readonly touch = new Set<string>();
  private readonly edges = new Map<string, boolean>();
  private dragging = false;
  private pointerX = 0;
  private pointerY = 0;
  private deltaX = 0;
  private deltaY = 0;
  gamepadName = "";

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.touch.clear();
      this.dragging = false;
    });

    canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      this.deltaX += event.clientX - this.pointerX;
      this.deltaY += event.clientY - this.pointerY;
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
    });
    canvas.addEventListener("pointerup", () => { this.dragging = false; });
    canvas.addEventListener("pointercancel", () => { this.dragging = false; });

    // Delegation covers on-screen buttons from the HTML overlay.
    document.addEventListener("pointerdown", (event) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>("[data-control]");
      if (!element) return;
      const action = element.dataset.control;
      if (action) {
        this.touch.add(action);
        element.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      }
    });
    const release = (event: PointerEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>("[data-control]");
      const action = element?.dataset.control;
      if (action) this.touch.delete(action);
    };
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
  }

  private edge(key: string, active: boolean): boolean {
    const previous = this.edges.get(key) ?? false;
    this.edges.set(key, active);
    return active && !previous;
  }

  read(): InputFrame {
    const gamepads = navigator.getGamepads?.();
    const gamepad = gamepads ? Array.from(gamepads).find(
      (candidate): candidate is Gamepad => Boolean(candidate?.connected)) : undefined;
    this.gamepadName = gamepad?.id ?? "";
    const button = (index: number) => gamepad?.buttons[index]?.value ?? 0;
    const axis = (index: number) => gamepad?.axes[index] ?? 0;
    const stick = (value: number) => Math.abs(value) < 0.13 ? 0 : value;
    const down = (key: string, touch: string) =>
      this.keys.has(key) || this.touch.has(touch);
    const pressed = (key: string, action: string, buttonIndex: number) =>
      this.edge(action, down(key, action) || button(buttonIndex) > 0.45);
    const cameraX = stick(axis(2));
    const cameraY = stick(axis(3));
    const pointerX = this.deltaX;
    const pointerY = this.deltaY;
    const flyForward = (down("KeyW", "flyForward") ? 1 : 0) -
      (down("KeyS", "flyBack") ? 1 : 0) - stick(axis(1));
    const flyStrafe = (down("KeyD", "flyRight") ? 1 : 0) -
      (down("KeyA", "flyLeft") ? 1 : 0) + stick(axis(0));
    const flyVertical = (down("Space", "flyUp") ? 1 : 0) -
      (down("ShiftLeft", "flyDown") || this.keys.has("ShiftRight") ? 1 : 0) +
      (button(5) > 0.45 ? 1 : 0) - (button(4) > 0.45 ? 1 : 0);
    this.deltaX = 0;
    this.deltaY = 0;

    return {
      throttleUp: down("KeyW", "throttle") || button(7) > 0.1 ||
        this.keys.has("ArrowUp"),
      throttleDown: down("KeyQ", "throttleDown") || button(4) > 0.4,
      brake: Math.max(
        down("KeyS", "brake") || this.keys.has("ArrowDown") ? 1 : 0,
        button(6),
      ),
      mode: pressed("KeyM", "mode", 5),
      reverse: pressed("KeyR", "reverse", 14),
      forward: pressed("KeyF", "forward", 15),
      horn: pressed("KeyH", "horn", 0),
      lights: pressed("KeyL", "lights", 1),
      activity: pressed("KeyE", "activity", 2),
      camera: pressed("KeyC", "camera", 3),
      freeCamera: pressed("KeyV", "freeCamera", 8),
      cameraX,
      cameraY,
      pointerX,
      pointerY,
      flyForward: THREE.MathUtils.clamp(flyForward, -1, 1),
      flyStrafe: THREE.MathUtils.clamp(flyStrafe, -1, 1),
      flyVertical: THREE.MathUtils.clamp(flyVertical, -1, 1),
      flyFast: this.keys.has("ControlLeft") || button(7) > 0.5,
      pause: pressed("Escape", "pause", 9),
    };
  }
}
