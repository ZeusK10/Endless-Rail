import * as THREE from "three";
import { RailPath } from "../sim/rail";
import { CHUNK_LENGTH, biomeAt, biomeBlend, hash } from "../game/constants";

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
    const brokenRock = (this.noise(s / 37 + 14, offset / 33 - 5, 83) - 0.5) * 7;
    const sharpRidges = Math.pow(this.noise(s / 105, offset / 80, 91), 4) * 12;
    const biome = biomeAt(s);
    const distantMountains = Math.pow(Math.max(0, (away - 130) / 510), 1.28) *
      (28 + this.noise(s / 710, offset / 420, 144) * 77);
    const transition = biomeBlend(s);
    const lakesideWeight = (transition.from === "lakeside" ? 1 - transition.blend : 0) +
      (transition.to === "lakeside" ? transition.blend : 0);
    const lakesideValley = -4.5 * lakesideWeight;
    let height = track + corridor * (
      rolling + secondary + ridges + gullies + brokenRock +
      sharpRidges + distantMountains + lakesideValley);

    // Bridges cross actual depressions; tunnel and cutting sections reshape
    // the surrounding hills while preserving a safe excavated rail corridor.
    const feature = this.rail.featureAt(s);
    const strength = this.rail.featureStrength(s);
    if (feature === "bridge") {
      height -= 17 * strength * (1 - smooth(16, 62, away));
    } else if (feature === "tunnel") {
      const bank = smooth(5, 15, away) * (1 - smooth(95, 175, away));
      height += 29 * strength * bank;
    } else if (feature === "cutting") {
      const bank = smooth(8, 27, away) * (1 - smooth(59, 96, away));
      height += 12 * strength * bank;
    }

    // A real water channel cuts across each guaranteed bridge corridor.
    // The meandering path is sampled in rail coordinates on BOTH sides of a
    // chunk boundary; water is always below the bridge deck.
    const river = this.river(s, offset);
    if (river) {
      const carve = 1 - smooth(22, 72, Math.abs(s - river.centerS));
      height = THREE.MathUtils.lerp(height,
        Math.min(height, river.waterY - 1.5), carve);
    }
    const lake = this.nearestLake(s);
    if (lake) {
      const normalized = Math.hypot((s - lake.s) / lake.lengthRadius,
        (offset - lake.offset) / lake.widthRadius);
      const carve = 1 - smooth(.96, 1.28, normalized);
      height = THREE.MathUtils.lerp(height,
        Math.min(height, lake.waterY - 1.7), carve);
    }
    const reservoir = this.underwaterLake(s);
    if (reservoir) {
      const normalized = Math.hypot((s - reservoir.s) / reservoir.lengthRadius,
        (offset - reservoir.offset) / reservoir.widthRadius);
      const carve = 1 - smooth(.92, 1.23, normalized);
      height = THREE.MathUtils.lerp(height,
        Math.min(height, reservoir.waterY - 1.3), carve);
    }
    return height;
  }

  /** Stable river path that crosses the railway at a planned bridge. */
  river(s: number, offset: number): { centerS: number; waterY: number; halfWidth: number } | null {
    const sector = Math.round((s - 750) / 1550);
    const origin = sector * 1550 + 750;
    if (this.rail.featureAt(origin) !== "bridge") return null;
    const centerS = origin +
      Math.sin(offset / 106 + hash(this.rail.seed, sector, 881) * 6.28) * 42 +
      Math.sin(offset / 46 + sector) * 10;
    if (Math.abs(s - centerS) > 80) return null;
    return {
      centerS,
      waterY: this.rail.point(origin).y - 5.0,
      halfWidth: 20 + hash(this.rail.seed, sector, 882) * 7,
    };
  }

  // Larger water bodies appear in every biome, with wider shorelines in the
  // lakeside valley. Their centers are independent of streamed chunks.
  lake(index: number): {
    s: number; offset: number; waterY: number; lengthRadius: number; widthRadius: number;
  } {
    const s = index * 3650 + 1100;
    const biome = biomeAt(s);
    const size = biome === "lakeside" ? 1.18 : biome === "cherry" ? .78 : 1;
    const offset = (hash(this.rail.seed, index, 991) > .5 ? 1 : -1) *
      (95 + hash(this.rail.seed, index, 992) * 28);
    return {
      s, offset, waterY: this.rail.point(s).y - 5.1,
      lengthRadius: (190 + hash(this.rail.seed, index, 993) * 48) * size,
      widthRadius: (112 + hash(this.rail.seed, index, 994) * 30) * size,
    };
  }

  /** Occasional small reservoirs above tunnel roofs, away from both portals. */
  underwaterLake(s: number): ReturnType<Landscape["lake"]> | null {
    const sector = Math.round((s - 750) / 1550);
    const centerS = sector * 1550 + 750;
    if (Math.abs(s - centerS) > 180 ||
        this.rail.featureAt(centerS) !== "tunnel" ||
        hash(this.rail.seed, sector, 925) >= .38) return null;
    return {
      s: centerS, offset: 0,
      waterY: this.rail.point(centerS).y + 9.15,
      lengthRadius: 142, widthRadius: 72,
    };
  }

  nearestLake(s: number): ReturnType<Landscape["lake"]> | null {
    const index = Math.round((s - 1100) / 3650);
    if (index < 0) return null;
    const lake = this.lake(index);
    return Math.abs(s - lake.s) < lake.lengthRadius * 1.26 ? lake : null;
  }

  isWater(s: number, offset: number): boolean {
    const river = this.river(s, offset);
    if (river && Math.abs(s - river.centerS) < river.halfWidth) return true;
    const lake = this.nearestLake(s);
    if (lake && Math.hypot((s - lake.s) / lake.lengthRadius,
      (offset - lake.offset) / lake.widthRadius) < 1) return true;
    const reservoir = this.underwaterLake(s);
    return reservoir !== null && Math.hypot((s - reservoir.s) / reservoir.lengthRadius,
      offset / reservoir.widthRadius) < 1;
  }

  /** Tiny-scale noise for meadow color, rock outcrops and forest clusters. */
  vegetationDensity(s: number, offset: number): number {
    return this.noise(s / 150 + 19, offset / 100 - 7, 61);
  }

  tint(s: number, offset: number): number {
    return this.noise(s / 68, offset / 48, 71);
  }
}
