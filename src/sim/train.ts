import { RailPath } from "./rail";

export type DrivingMode = "manual" | "cruise" | "autodrive";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * An intentionally lightweight one-dimensional locomotive model.
 * Signed speed and distance allow reverse running on the same track.
 */
export class TrainSimulation {
  distance = 0;
  speed = 0; // meters per second, signed
  throttle = 0;
  brake = 0;
  direction: 1 | -1 = 1;
  mode: DrivingMode = "manual";
  targetSpeed = 55 / 3.6;
  derailmentEnabled = false;
  derailed = false;
  traveled = 0;

  constructor(readonly rail: RailPath) {}

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  setDirection(direction: 1 | -1): boolean {
    if (Math.abs(this.speed) > 0.35 || this.derailed) return false;
    this.direction = direction;
    this.throttle = 0;
    this.brake = 0;
    return true;
  }

  setMode(mode: DrivingMode): void {
    if (this.derailed) return;
    this.mode = mode;
    this.brake = 0;
    if (mode === "manual") this.throttle = 0;
    if (mode === "cruise") {
      this.targetSpeed = clamp(Math.abs(this.speed), 20 / 3.6, 100 / 3.6);
    }
  }

  cycleMode(): void {
    const modes: DrivingMode[] = ["manual", "cruise", "autodrive"];
    this.setMode(modes[(modes.indexOf(this.mode) + 1) % modes.length]);
  }

  adjustThrottle(amount: number): void {
    if (this.derailed) return;
    if (this.mode === "manual") {
      this.throttle = clamp(this.throttle + amount, 0, 1);
    } else if (this.mode === "cruise") {
      this.targetSpeed = clamp(this.targetSpeed + amount * 18, 0, 110 / 3.6);
    }
  }

  applyBrake(value: number): void {
    if (this.derailed) return;
    if (value > 0.08 && this.mode !== "manual") this.setMode("manual");
    this.brake = clamp(value, 0, 1);
  }

  recover(): void {
    this.derailed = false;
    this.speed = 0;
    this.throttle = 0;
    this.brake = 1;
    this.mode = "manual";
  }

  update(dt: number): void {
    if (this.derailed || dt <= 0) return;
    const curvature = this.rail.curvature(this.distance);

    if (this.mode !== "manual") {
      const safeCurveSpeed = Math.sqrt(4.5 / Math.max(curvature, 0.0001));
      const requested = this.mode === "autodrive"
        ? Math.min(72 / 3.6, safeCurveSpeed)
        : Math.min(this.targetSpeed, safeCurveSpeed);
      const current = this.speed * this.direction;
      const error = requested - current;
      this.throttle = clamp(error * 0.18, 0, 1);
      this.brake = clamp(-error * 0.16, 0, 1);
    }

    const speed = this.speed;
    const traction = this.direction * 1.65 * this.throttle *
      clamp(1 - Math.abs(speed) / (125 / 3.6), 0, 1);
    const rolling = Math.abs(speed) > 0.05 ? 0.12 * Math.sign(speed) : 0;
    const drag = 0.0018 * speed * Math.abs(speed);
    const gradient = 9.81 * Math.sin(this.rail.grade(this.distance));
    const brakeForce = 3.5 * this.brake * Math.sign(speed || this.direction);
    const acceleration = traction - rolling - drag - gradient - brakeForce;
    const next = clamp(speed + acceleration * dt, -125 / 3.6, 125 / 3.6);

    // Never let service brakes propel the train backwards through zero.
    if (this.brake > 0 && (Math.abs(speed) < 0.03 ||
      (speed !== 0 && Math.sign(next) !== Math.sign(speed)))) {
      this.speed = 0;
    } else if (Math.abs(next) < 0.02 && Math.abs(acceleration) < 0.05) {
      this.speed = 0;
    } else {
      this.speed = next;
    }

    // Arcade-simulation stability check; full rigid-body derailment is omitted.
    if (this.derailmentEnabled &&
      this.speed * this.speed * curvature > 7.5) {
      this.derailed = true;
      this.speed = 0;
      this.throttle = 0;
      return;
    }

    const delta = this.speed * dt;
    this.distance += delta;
    this.traveled += Math.abs(delta);
  }
}
