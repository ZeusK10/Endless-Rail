import * as THREE from "three";

/**
 * A distance-addressable railway: every position depends only on a seed and
 * track distance. Chunks can be recreated in either travel direction.
 * The monotonic Z axis prevents self-intersecting loops in the first release.
 */
export class RailPath {
  private readonly phase: number;
  constructor(readonly seed: number) {
    this.phase = ((seed >>> 0) % 10000) / 10000 * Math.PI * 2;
  }

  point(distance: number): THREE.Vector3 {
    const s = distance;
    const x = 30 * Math.sin(s / 430 + this.phase) +
      12 * Math.sin(s / 177 + this.phase * 0.42);
    const y = 2.8 + 2.4 * Math.sin(s / 310 + this.phase * 0.3) +
      1.2 * Math.sin(s / 115 + this.phase);
    return new THREE.Vector3(x, y, -s);
  }

  tangent(distance: number): THREE.Vector3 {
    return this.point(distance + 1).sub(this.point(distance - 1)).normalize();
  }

  /** Grade (radians) in the increasing-distance direction. */
  grade(distance: number): number {
    const tangent = this.tangent(distance);
    return Math.asin(THREE.MathUtils.clamp(tangent.y, -1, 1));
  }

  /** Approximate curvature in inverse meters. */
  curvature(distance: number): number {
    const left = this.tangent(distance - 3);
    const right = this.tangent(distance + 3);
    return left.angleTo(right) / 6;
  }

  /** Unit vector pointing sideways from the railway. */
  side(distance: number): THREE.Vector3 {
    const direction = this.tangent(distance);
    return new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  }
}
