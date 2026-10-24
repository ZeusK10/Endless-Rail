import * as THREE from "three";
import { RailPath } from "../sim/rail";
import { CHUNK_LENGTH, biomeAt, hash } from "../game/constants";

/**
 * Continuous height field, addressable by track distance and lateral offset.
 * Heights stay identical when a chunk is unloaded and regenerated in reverse.
 */
const smooth = (a: number, b: number, n: number): number => {
  const t = THREE.MathUtils.clamp((n - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Landscape {
  constructor(private readonly rail: RailPath) {}

  private noise(x: number, y: number, salt = 0): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const tx = fx * fx * (3 - 2 * fx);
    const ty = fy * fy * (3 - 2 * fy);
    const a = THREE.MathUtils.lerp(
      hash(this.rail.seed + salt, ix, iy),
      hash(this.rail.seed + salt, ix + 1, iy), tx);
    const b = THREE.MathUtils.lerp(
      hash(this.rail.seed + salt, ix, iy + 1),
      hash(this.rail.seed + salt, ix + 1, iy + 1), tx);
    return THREE.MathUtils.lerp(a, b, ty);
  }

  /** Large hills, cuts and embankments with a safe smooth railway corridor. */
  height(s: number, offset: number): number {
    const track = this.rail.point(s).y - 0.62;
    const away = Math.abs(offset);
    const corridor = smooth(7, 44, away);
    const rolling = (this.noise(s / 275, offset / 150, 11) - 0.48) * 51;
    const secondary = (this.noise(s / 95, offset / 73, 23) - 0.5) * 19;
    const ridges = Math.pow(Math.max(0, (away - 20) / 160), 1.22) *
      (11 + this.noise(s / 490, offset / 265, 37) * 30);
    const gullies = -13 * this.noise(s / 125 + 17, offset / 88 - 15, 47);
    const biome = biomeAt(s);
    const lakesideValley = biome === "lakeside" ? -4.5 : 0;
    let height = track + corridor * (
      rolling + secondary + ridges + gullies + lakesideValley);

    // Shorelines carve into the same height field, so water never floats
    // over ordinary hills. Lakes always regenerate at the same coordinates.
    const index = Math.floor(s / CHUNK_LENGTH);
    if (biome === "lakeside" && ((index % 5) + 5) % 5 === 1) {
      const lake = this.lake(index);
      const radius = Math.hypot(
        (s - lake.s) / 78, (offset - lake.offset) / 60);
      const carve = 1 - smooth(0.75, 1.28, radius);
      height = THREE.MathUtils.lerp(
        height, Math.min(height, lake.waterY - 1.6), carve);
    }
    return height;
  }

  lake(index: number): { s: number; offset: number; waterY: number } {
    const s = index * CHUNK_LENGTH + CHUNK_LENGTH * 0.5;
    const offset = (hash(this.rail.seed + 51, index) > 0.5 ? 1 : -1) * 98;
    return { s, offset, waterY: this.rail.point(s).y - 3.2 };
  }

  /** Tiny-scale noise for meadow color, rock outcrops and forest clusters. */
  vegetationDensity(s: number, offset: number): number {
    return this.noise(s / 150 + 19, offset / 100 - 7, 61);
  }

  tint(s: number, offset: number): number {
    return this.noise(s / 68, offset / 48, 71);
  }
}
