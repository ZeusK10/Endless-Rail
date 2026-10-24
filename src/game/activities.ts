import { hash } from "./constants";
import type { DrivingMode } from "../sim/train";

type ActivityKind = "speed" | "smooth" | "scenic" | "comfort" | "limit";
interface ActiveActivity {
  index: number;
  kind: ActivityKind;
  validDistance: number;
  violations: number;
}

const activityNames: Record<ActivityKind, string> = {
  speed: "Speed Keeper",
  smooth: "Smooth Journey",
  scenic: "Scenic Discovery",
  comfort: "Passenger Comfort",
  limit: "Speed Limit Challenge",
};

export class ActivityManager {
  completed = 0;
  message = "";
  prompt = "";
  bestSpeedKmh = 0;
  farthestKm = 0;
  comfortScore = 100;
  overspeedMeters = 0;
  milestones = 0;
  private readonly visited = new Set<number>();
  private active: ActiveActivity | null = null;
  private readonly spacing = 1550;
  private lastPosition = 0;

  constructor(private readonly seed: number) {}

  private candidate(distance: number): { index: number; kind: ActivityKind } | null {
    const s = Math.max(0, distance);
    const index = Math.floor(s / this.spacing);
    const offset = s - index * this.spacing;
    if (index === 0 || offset < 170 || offset > 420 ||
      this.visited.has(index)) return null;
    const kinds: ActivityKind[] = ["speed", "smooth", "scenic", "comfort", "limit"];
    const kind = kinds[Math.floor(hash(this.seed, index, 60) * kinds.length)];
    return { index, kind };
  }

  activate(distance: number): void {
    if (this.active) return;
    const candidate = this.candidate(distance);
    if (!candidate) return;
    this.visited.add(candidate.index);
    // Bound memory during extremely long sessions; revisits remain possible.
    if (this.visited.size > 128) {
      const oldest = this.visited.values().next().value;
      if (oldest !== undefined) this.visited.delete(oldest);
    }
    if (candidate.kind === "scenic") {
      this.completed++;
      this.message = "Scenic landmark discovered! +1";
      return;
    }
    this.active = { ...candidate, validDistance: 0, violations: 0 };
    this.message = activityNames[candidate.kind] + " started";
  }

  update(distance: number, speedKmh: number, brake: number, mode: DrivingMode,
    acceleration = 0, speedLimitKmh = 110): void {
    const distanceDelta = Math.abs(distance - this.lastPosition);
    this.lastPosition = distance;
    this.prompt = "";
    this.bestSpeedKmh = Math.max(this.bestSpeedKmh, speedKmh);
    this.farthestKm = Math.max(this.farthestKm, Math.max(0, distance) / 1000);
    if (speedKmh > speedLimitKmh + 3) this.overspeedMeters += distanceDelta;
    const jolt = Math.max(0, Math.abs(acceleration) - 1.35);
    this.comfortScore = Math.max(0, Math.min(100,
      this.comfortScore + distanceDelta * .004 -
      jolt * distanceDelta * .055 - (brake > .8 ? distanceDelta * .027 : 0)));
    const milestone = Math.floor(Math.max(0, distance) / 5000);
    if (milestone > this.milestones) {
      this.milestones = milestone;
      this.message = milestone * 5 + " km milestone reached!";
    }

    const active = this.active;
    if (!active) {
      const candidate = this.candidate(distance);
      if (candidate) {
        this.prompt = activityNames[candidate.kind] +
          " nearby — press E / X to join";
      }
      return;
    }
    if (mode === "autodrive") {
      this.active = null;
      this.message = "Challenge cancelled in autodrive";
      return;
    }
    if (active.kind === "speed" && (speedKmh < 38 || speedKmh > 75)) {
      active.violations += distanceDelta;
    }
    if (active.kind === "smooth" && (brake > .75 || speedKmh > 95)) {
      active.violations += distanceDelta;
    }
    if (active.kind === "comfort" && (Math.abs(acceleration) > 2 ||
      brake > .72)) active.violations += distanceDelta;
    if (active.kind === "limit" && speedKmh > speedLimitKmh + 2) {
      active.violations += distanceDelta;
    }
    active.validDistance += distanceDelta;
    const target = active.kind === "speed" ? 430 :
      active.kind === "smooth" ? 600 : 650;
    this.prompt = activityNames[active.kind] + " — " +
      Math.min(100, Math.floor(active.validDistance / target * 100)) + "%";
    if (active.validDistance >= target) {
      const allowed = active.kind === "speed" ? 90 :
        active.kind === "smooth" ? 35 : 45;
      const success = active.violations <= allowed;
      this.message = success ? "Challenge complete! +1" :
        "Challenge missed — keep exploring";
      if (success) this.completed++;
      this.active = null;
    }
  }
}
