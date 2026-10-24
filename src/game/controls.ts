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
  activity: boolean;
  pause: boolean;
}

export class Controls {
  private readonly keys = new Set<string>();
  private readonly touch = new Set<string>();
  private readonly edges = new Map<string, boolean>();
  gamepadName = "";

  constructor() {
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
    });

    // Delegation covers buttons created after the controller initializes.
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
    const down = (key: string, touch: string) =>
      this.keys.has(key) || this.touch.has(touch);
    const pressed = (key: string, action: string, buttonIndex: number) =>
      this.edge(action, down(key, action) || button(buttonIndex) > 0.45);

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
      pause: pressed("Escape", "pause", 9),
    };
  }
}
