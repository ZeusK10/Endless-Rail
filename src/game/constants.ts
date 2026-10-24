export const CHUNK_LENGTH = 240;
export const REGION_LENGTH = 2600;
export const TRANSITION_LENGTH = 430;
export const TRAIN_CAR_SPACING = 9.2;
export const TRAIN_CAR_COUNT = 3;

export type Biome = "highlands" | "cherry" | "lakeside";
export const BIOME_NAMES: Record<Biome, string> = {
  highlands: "Green Highlands",
  cherry: "Cherry Blossom Valley",
  lakeside: "Lakeside Valley",
};

export const FOLIAGE: Record<Biome, string[]> = {
  highlands: ["#5cae58", "#8fba65", "#dbb858", "#cc804c", "#a9503c", "#906340"],
  cherry: ["#eda1c2", "#ffd1da", "#f3e5e7", "#ad5362", "#76a96d", "#b17c55"],
  lakeside: ["#579b66", "#88b76c", "#bd5948", "#9d573f", "#c99750", "#e3b75e"],
};

export function hash(seed: number, a: number, b = 0): number {
  let n = (seed ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

econst BIOME_SEQUENCE: Biome[] = ["highlands", "cherry", "lakeside"];
const wrap = (n: number, count: number) => ((n % count) + count) % count;

// Shared region borders are stable at any world distance (including reverse
// travel) and vary between roughly 2.0 and 3.2 km without a mutable RNG.
export function biomeBoundary(index: number): number {
  if (index <= 0) return index * REGION_LENGTH;
  return index * REGION_LENGTH + (hash(0x62ab134, index, 317) - .5) * 560;
}
export function biomeRegion(distance: number): number {
  const s = Math.max(0, distance);
  let index = Math.max(0, Math.floor(s / REGION_LENGTH));
  if (s < biomeBoundary(index)) index--;
  else if (s >= biomeBoundary(index + 1)) index++;
  return Math.max(0, index);
}
export function biomeAt(distance: number): Biome {
  return BIOME_SEQUENCE[biomeRegion(distance) % BIOME_SEQUENCE.length];
}
export function biomeBlend(distance: number): { from: Biome; to: Biome; blend: number } {
  const region = biomeRegion(distance);
  const s = Math.max(0, distance);
  const end = biomeBoundary(region + 1);
  const t = Math.max(0, Math.min(1, (s - (end - TRANSITION_LENGTH)) / TRANSITION_LENGTH));
  return {
    from: BIOME_SEQUENCE[wrap(region, 3)],
    to: BIOME_SEQUENCE[wrap(region + 1, 3)],
    blend: t * t * (3 - 2 * t),
  };
}