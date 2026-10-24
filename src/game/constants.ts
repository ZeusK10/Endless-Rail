export const CHUNK_LENGTH = 240;
export const REGION_LENGTH = 7800;
export const TRANSITION_LENGTH = 1300;
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

export function biomeAt(distance: number): Biome {
  const region = Math.floor(Math.max(0, distance) / REGION_LENGTH);
  return (["highlands", "cherry", "lakeside"] as Biome[])[region % 3];
}

export function biomeBlend(distance: number): { from: Biome; to: Biome; blend: number } {
  const normalized = Math.max(0, distance);
  const region = Math.floor(normalized / REGION_LENGTH);
  const inRegion = normalized - region * REGION_LENGTH;
  const t = Math.max(0, Math.min(1,
    (inRegion - (REGION_LENGTH - TRANSITION_LENGTH)) / TRANSITION_LENGTH));
  const smooth = t * t * (3 - 2 * t);
  const biomes: Biome[] = ["highlands", "cherry", "lakeside"];
  return { from: biomes[region % 3], to: biomes[(region + 1) % 3], blend: smooth };
}
