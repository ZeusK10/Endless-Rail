import * as THREE from "three";
import { hash } from "../game/constants";

export type RailFeature = "open" | "bridge" | "tunnel" | "cutting";

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Continuous deterministic centerline in distance space. Smooth seeded knot
 * interpolation produces long, nearly straight sections between sweeping
 * bends without looping or requiring earlier chunks to remain in memory.
 */
export class RailPath {
  private readonly phase: number;
  constructor(readonly seed: number) {
    this.phase = ((seed >>> 0) % 10000) / 10000 * Math.PI * 2;
  }

  private lateralKnot(index: number): number {
    return 36 * Math.sin(index * 0.71 + this.phase) +
      16 * Math.sin(index * 1.43 + this.phase * 0.35) +
      (hash(this.seed, index, 501) - 0.5) * 14;
  }

  point(distance: number): THREE.Vector3 {
    const segmentLength = 610;
    const index = Math.floor(distance / segmentLength);
    const t = (distance - index * segmentLength) / segmentLength;
    const p0 = this.lateralKnot(index - 1);
    const p1 = this.lateralKnot(index);
    const p2 = this.lateralKnot(index + 1);
    const p3 = this.lateralKnot(index + 2);
    // Catmull-Rom with a small tangent tension; C1 across chunk boundaries.
    const m1 = (p2 - p0) * 0.36;
    const m2 = (p3 - p1) * 0.36;
    const t2 = t * t, t3 = t2 * t;
    const x = (2*t3-3*t2+1)*p1 + (t3-2*t2+t)*m1 +
      (-2*t3+3*t2)*p2 + (t3-t2)*m2;
    const y = 4.8 + 3.6 * Math.sin(distance / 510 + this.phase * 0.3) +
      1.6 * Math.sin(distance / 205 + this.phase);
    return new THREE.Vector3(x, y, -distance);
  }

  /** A fixed-length scenic route feature, independent of chunk loading. */
  featureAt(distance: number): RailFeature {
    const sector = Math.floor(distance / 2100);
    const within = distance - sector * 2100;
    if (within < 580 || within > 1020) return "open";
    const value = hash(this.seed, sector, 702);
    return value < 0.31 ? "bridge" : value < 0.56 ? "tunnel" :
      value < 0.82 ? "cutting" : "open";
  }

  featureStrength(distance: number): number {
    if (this.featureAt(distance) === "open") return 0;
    const within = distance - Math.floor(distance / 2100) * 2100;
    return smooth(THREE.MathUtils.clamp((within - 580) / 55, 0, 1)) *
      smooth(THREE.MathUtils.clamp((1020 - within) / 55, 0, 1));
  }

  /** Track-aware limit for signposts, challenges and automatic driving. */
  speedLimitAt(distance: number): number {
    const curvature = Math.max(this.curvature(distance), 0.000015);
    const bendLimit = Math.sqrt(1.0 / curvature) * 3.6;
    const feature = this.featureAt(distance);
    const routeLimit = feature === "tunnel" ? 58 : feature === "bridge" ? 72 :
      feature === "cutting" ? 82 : 110;
    return Math.max(35, Math.min(routeLimit, bendLimit, 110));
  }

  tangent(distance: number): THREE.Vector3 {
    return this.point(distance + 1).sub(this.point(distance - 1)).normalize();
  }

  grade(distance: number): number {
    return Math.asin(THREE.MathUtils.clamp(this.tangent(distance).y, -1, 1));
  }

  curvature(distance: number): number {
    const left = this.tangent(distance - 3);
    const right = this.tangent(distance + 3);
    return left.angleTo(right) / 6;
  }

  side(distance: number): THREE.Vector3 {
    const direction = this.tangent(distance);
    return new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  }
}
