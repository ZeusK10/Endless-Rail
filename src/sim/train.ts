import { RailPath } from "./rail";

export type DrivingMode = "manual" | "cruise" | "autodrive";
export type TrainType = "diesel" | "electric" | "steam";

const trainProfiles: Record<TrainType, { acceleration: number; topSpeed: number; rolling: number }> = {
  diesel: { acceleration: 1.65, topSpeed: 125, rolling: .12 },
  electric: { acceleration: 2.1, topSpeed: 145, rolling: .10 },
  steam: { acceleration: 1.18, topSpeed: 100, rolling: .16 },
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Independent, testable safety model shared by HUD and actual failure rolls. */
export function derailmentRatePerSecond(risk: number): number {
  const severity = clamp(risk, 0, 1);
  return .0002 * severity + .24 * Math.pow(severity, 2.2);
}

export function derailmentRiskLevel(
  speedKmh: number, limitKmh: number, curvature: number,
  brake: number, emergency = false,
): number {
  const overspeed = clamp((speedKmh - limitKmh - 2) /
    Math.max(18, limitKmh * .34), 0, 2);
  const curve = clamp(curvature / .00035, 0, 1.8);
  const brakeStress = clamp((brake - .62) / .38, 0, 1) *
    clamp((speedKmh - 55) / 55, 0, 1);
  const highSpeedBend = curve * clamp((speedKmh - 88) / 58, 0, 1);
  return clamp(overspeed * (.15 + .39 * curve) +
    .11 * highSpeedBend + .16 * brakeStress +
    (emergency ? .11 * clamp((speedKmh - 60) / 60, 0, 1) : 0), 0, 1);
}

/**
 * An intentionally lightweight one-dimensional locomotive model.
 * Signed speed and distance allow reverse running on the same track.
 */
export class TrainSimulation {
  distance = 0;
  speed = 0; // meters per second, signed
  throttle = 0;
  brake = 0;
  independentBrake = 0;
  emergency = false;
  acceleration = 0;
  trainType: TrainType = "diesel";
  direction: 1 | -1 = 1;
  mode: DrivingMode = "manual";
  targetSpeed = 55 / 3.6;
  derailmentEnabled = false;
  derailed = false;
  traveled = 0;
  /** Dimensionless warning level; actual failure is disabled by default. */
  derailmentRisk = 0;
  private randomState: number;

  constructor(readonly rail: RailPath) {
    this.randomState = rail.seed ^ 0x9e3779b9;
  }

  /** Probability of derailment if current conditions persist for ten seconds. */
  get derailmentChance10s(): number {
    const hazard = derailmentRatePerSecond(this.derailmentRisk);
    return 1 - Math.exp(-hazard * 10);
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  get speedLimitKmh(): number {
    return Math.round(this.rail.speedLimitAt(this.distance));
  }

  get brakingDistance(): number {
    return this.speed * this.speed / (2 * 2.2);
  }

  setTrainType(type: TrainType): boolean {
    if (Math.abs(this.speed) > .35 || this.derailed) return false;
    this.trainType = type;
    this.throttle = 0;
    this.brake = 0;
    this.emergency = false;
    return true;
  }

  emergencyStop(): void {
    if (this.derailed) return;
    this.mode = "manual";
    this.throttle = 0;
    this.brake = 1;
    this.emergency = true;
  }

  setIndependentBrake(value: number): void {
    if (!this.derailed) this.independentBrake = clamp(value, 0, 1);
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
    if (this.derailed || this.emergency) return;
    if (this.mode === "manual") {
      this.throttle = clamp(this.throttle + amount, 0, 1);
    } else if (this.mode === "cruise") {
      this.targetSpeed = clamp(this.targetSpeed + amount * 18, 0, 110 / 3.6);
    }
  }

  applyBrake(value: number): void {
    if (this.derailed) return;
    if (value > 0.08 && this.mode !== "manual") this.setMode("manual");
    this.brake = this.emergency ? 1 : clamp(value, 0, 1);
  }

  recover(): void {
    this.derailed = false;
    this.speed = 0;
    this.throttle = 0;
    this.brake = 1;
    this.mode = "manual";
    this.derailmentRisk = 0;
    this.emergency = false;
    this.independentBrake = 0;
    this.acceleration = 0;
  }

  update(dt: number): void {
    if (this.derailed || dt <= 0) return;
    const curvature = this.rail.curvature(this.distance);

    if (this.mode !== "manual") {
      // Plan braking *before* entering curves, bridges and tunnels. At every
      // preview sample, limit current speed by the reachable braking envelope.
      let previewLimit = Infinity;
      for (const ahead of [0, 45, 90, 150, 230, 330]) {
        const limit = this.rail.speedLimitAt(this.distance + ahead * this.direction) / 3.6;
        previewLimit = Math.min(previewLimit,
          Math.sqrt(limit * limit + 2 * 1.75 * Math.max(0, ahead - 18)));
      }
      const requested = this.mode === "autodrive"
        ? Math.min(72 / 3.6, previewLimit)
        : Math.min(this.targetSpeed, previewLimit);
      const current = this.speed * this.direction;
      const error = requested - current;
      this.throttle = clamp(error * 0.18, 0, 1);
      this.brake = clamp(-error * 0.16, 0, 1);
    }

    const speed = this.speed;
    const profile = trainProfiles[this.trainType];
    const traction = this.direction * profile.acceleration * this.throttle *
      clamp(1 - Math.abs(speed) / (profile.topSpeed / 3.6), 0, 1);
    const rolling = Math.abs(speed) > 0.05 ? profile.rolling * Math.sign(speed) : 0;
    const drag = 0.0018 * speed * Math.abs(speed);
    const gradient = 9.81 * Math.sin(this.rail.grade(this.distance));
    const brakeForce = (this.emergency ? 5.6 : 3.5 * this.brake +
      1.8 * this.independentBrake) * Math.sign(speed || this.direction);
    const acceleration = traction - rolling - drag - gradient - brakeForce;
    this.acceleration = acceleration;
    const topSpeed = profile.topSpeed / 3.6;
    const next = clamp(speed + acceleration * dt, -topSpeed, topSpeed);

    // Never let service brakes propel the train backwards through zero.
    if ((this.brake > 0 || this.emergency || this.independentBrake > 0) && (Math.abs(speed) < 0.03 ||
      (speed !== 0 && Math.sign(next) !== Math.sign(speed)))) {
      this.speed = 0;
    } else if (Math.abs(next) < 0.02 && Math.abs(acceleration) < 0.05) {
      this.speed = 0;
    } else {
      this.speed = next;
    }

    if (this.emergency && this.speed === 0) {
      this.emergency = false;
      this.brake = 1;
    }

    // The HUD's ten-second estimate uses this exact same instantaneous
    // hazard rate as the seeded per-frame failure check.
    this.derailmentRisk = derailmentRiskLevel(
      this.speedKmh, this.speedLimitKmh, curvature,
      Math.max(this.brake, this.independentBrake), this.emergency);
    const hazardPerSecond = derailmentRatePerSecond(this.derailmentRisk);
    if (this.derailmentEnabled && hazardPerSecond > 0 &&
      this.random() < 1 - Math.exp(-hazardPerSecond * dt)) {
      this.derailed = true;
      this.speed = 0;
      this.throttle = 0;
      this.derailmentRisk = 0;
      return;
    }

    const delta = this.speed * dt;
    this.distance += delta;
    this.traveled += Math.abs(delta);
  }
}
