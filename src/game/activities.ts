import { hash } from "./constants";
import type { DrivingMode } from "../sim/train";

type ActivityKind = "speed" | "smooth" | "scenic";
interface ActiveActivity {
  index: number;
  kind: ActivityKind;
  startDistance: number;
  validDistance: number;
  violations: number;
}

const activityNames: Record<ActivityKind, string> = {
  speed: "Speed Keeper",
  smooth: "Smooth Journey",
  scenic: "Scenic Discovery",
};

export class ActivityManager {
  completed = 0;
  message = "";
  prompt = "";
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
    const kinds: ActivityKind[] = ["speed", "smooth", "scenic"];
    const kind = kinds[Math.floor(hash(this.seed, index, 60) * kinds.length)];
    return { index, kind };
  }

  activate(distance: number): void {
    if (this.active) return;
    const candidate = this.candidate(distance);
    if (!candidate) return;
    this.visited.add(candidate.index);
    if (candidate.kind === "scenic") {
      this.completed++;
      this.message = "Landmark discovered! +1";
      return;
    }
    this.active = {
      ...candidate,
      startDistance: distance,
      validDistance: 0,
      violations: 0,
    };
    this.message = activityNames[candidate.kind] + " started";
  }

  update(
    distance: number, speedKmh: number, brake: number,
    mode: DrivingMode,
  ): void {
    const distanceDelta = Math.abs(distance - this.lastPosition);
    this.lastPosition = distance;
    this.prompt = "";
    const active = this.active;
    if (!active) {
      const candidate = this.candidate(distance);
      if (candidate) {
        this.prompt = activityNames[candidate.kind] +
          " nearby — press E / X to join";
      }
      return;
    }
    // Autodrive does not score manual-driving activities.
    if (mode === "autodrive") {
      this.active = null;
      this.message = "Challenge cancelled in autodrive";
      return;
    }
    if (active.kind === "speed" && (speedKmh < 38 || speedKmh > 75)) {
      active.violations += distanceDelta;
    }
    if (active.kind === "smooth" &&
      (brake > 0.75 || speedKmh > 95)) {
      active.violations += distanceDelta;
    }
    active.validDistance += distanceDelta;
    const target = active.kind === "speed" ? 430 : 600;
    this.prompt = activityNames[active.kind] + " — " +
      Math.min(100, Math.floor(active.validDistance / target * 100)) + "%";
    if (active.validDistance >= target) {
      const allowed = active.kind === "speed" ? 90 : 35;
      const success = active.violations <= allowed;
      this.message = success ? "Challenge complete! +1" : "Challenge missed — keep exploring";
      if (success) this.completed++;
      this.active = null;
    }
  }
}
