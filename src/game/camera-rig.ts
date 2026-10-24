import * as THREE from "three";
import { RailPath } from "../sim/rail";

export interface TerrainQuery {
  terrainHeight(distance: number, offset: number): number;
}

/** Approximate track-space coordinates without a costly scene-wide raycast. */
export function trackSpace(
  position: THREE.Vector3, rail: RailPath,
): { s: number; offset: number } {
  const s = -position.z;
  const at = rail.point(s);
  const side = rail.side(s);
  return {
    s, offset: (position.x - at.x) * side.x + (position.z - at.z) * side.z,
  };
}

export function minimumCameraY(
  position: THREE.Vector3, rail: RailPath, terrain: TerrainQuery, clearance = 1.65,
): number {
  const { s, offset } = trackSpace(position, rail);
  return terrain.terrainHeight(s, offset) + clearance;
}

/**
 * Sweep a short camera ray from an unobstructed train anchor towards the
 * desired chase-camera position. Retract before a hillside or cutting wall.
 * This is independent of world chunks and works after origin rebasing.
 */
export function avoidTerrain(
  anchor: THREE.Vector3, wanted: THREE.Vector3, rail: RailPath,
  terrain: TerrainQuery, clearance = 1.75,
): THREE.Vector3 {
  const result = wanted.clone();
  const length = anchor.distanceTo(wanted);
  if (length > .01) {
    const steps = Math.max(8, Math.min(22, Math.ceil(length / 2)));
    const sample = new THREE.Vector3();
    for (let i = 1; i <= steps; i++) {
      sample.copy(anchor).lerp(wanted, i / steps);
      if (sample.y < minimumCameraY(sample, rail, terrain, clearance)) {
        result.copy(anchor).lerp(wanted, Math.max(0, (i - 1.5) / steps));
        break;
      }
    }
  }
  result.y = Math.max(result.y, minimumCameraY(result, rail, terrain, clearance));
  return result;
}
