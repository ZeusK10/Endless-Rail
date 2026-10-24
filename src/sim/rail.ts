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
    const section = Math.floor(index / 5);
    const shape = hash(this.seed, section, 811);
    const intensity = shape < .28 ? .28 : shape < .68 ? 1 : 1.42;
    return intensity * (
      94 * Math.sin(index * .73 + this.phase) +
      43 * Math.sin(index * 1.57 + this.phase * .35) +
      (hash(this.seed, index, 501) - .5) * 56);
  }

  point(distance: number): THREE.Vector3 {
    const segmentLength = 390;
    const index = Math.floor(distance / segmentLength);
    const t = (distance - index * segmentLength) / segmentLength;
    const p0 = this.lateralKnot(index - 1);
    const p1 = this.lateralKnot(index);
    const p2 = this.lateralKnot(index + 1);
    const p3 = this.lateralKnot(index + 2);
    // Catmull-Rom with a small tangent tension; C1 across chunk boundaries.
    const m1 = (p2 - p0) * 0.43;
    const m2 = (p3 - p1) * 0.43;
    const t2 = t * t, t3 = t2 * t;
    const x = (2*t3-3*t2+1)*p1 + (t3-2*t2+t)*m1 +
      (-2*t3+3*t2)*p2 + (t3-t2)*m2;
    const y = 4.8 + 3.6 * Math.sin(distance / 510 + this.phase * 0.3) +
      1.6 * Math.sin(distance / 205 + this.phase);
    return new THREE.Vector3(x, y, -distance);
  }

  /** Three-feature scenic blocks guarantee a bridge, tunnel and cutting. */
  private featurePlan(distance: number): { type: RailFeature; strength: number } {
    const span = 1550;
    const sector = Math.floor(distance / span);
    const within = distance - sector * span;
    const start = 410 + hash(this.seed, sector, 711) * 135;
    const end = 935 + hash(this.seed, sector, 712) * 135;
    if (within < start || within > end) return { type: "open", strength: 0 };
    const block = Math.floor(sector / 3);
    const slot = ((sector % 3) + 3) % 3;
    const variant = Math.floor(hash(this.seed, block, 713) * 6);
    const orders: RailFeature[][] = [
      ["bridge", "tunnel", "cutting"], ["bridge", "cutting", "tunnel"],
      ["tunnel", "bridge", "cutting"], ["tunnel", "cutting", "bridge"],
      ["cutting", "bridge", "tunnel"], ["cutting", "tunnel", "bridge"],
    ];
    return {
      type: orders[variant][slot],
      strength: smooth(THREE.MathUtils.clamp((within - start) / 70, 0, 1)) *
        smooth(THREE.MathUtils.clamp((end - within) / 70, 0, 1)),
    };
  }

  featureAt(distance: number): RailFeature {
    return this.featurePlan(distance).type;
  }

  featureStrength(distance: number): number {
    return this.featurePlan(distance).strength;
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
