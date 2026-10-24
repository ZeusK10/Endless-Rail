import * as THREE from "three";
import { biomeAt, FOLIAGE, hash, CHUNK_LENGTH, type Biome } from "../game/constants";
import { RailPath } from "../sim/rail";
import { Landscape } from "./landscape";

export interface SceneryChunk {
  group: THREE.Group;
  center: THREE.Vector3;
  instances: THREE.InstancedMesh[];
}

interface Context {
  chunk: SceneryChunk;
  rail: RailPath;
  landscape: Landscape;
}

const lambert = (hex: string) => new THREE.MeshLambertMaterial({
  color: hex, flatShading: true,
});
const wood = lambert("#765742");
const leaves = lambert("#ffffff");
const grassMaterial = lambert("#ffffff");
const stoneMaterial = lambert("#ffffff");

const trunkShape = new THREE.CylinderGeometry(0.21, 0.36, 3.2, 6);
const canopyShapes = [
  new THREE.DodecahedronGeometry(1.6, 0),
  new THREE.ConeGeometry(1.8, 3.2, 7),
  new THREE.IcosahedronGeometry(1.55, 0),
];
const shrubShape = new THREE.IcosahedronGeometry(0.75, 0);
const flowerShape = new THREE.ConeGeometry(0.19, 0.65, 4);
const rockShape = new THREE.DodecahedronGeometry(0.95, 0);

const walls = ["#efe0b5", "#eac8a6", "#f2e0cd", "#d6e4d9", "#dabaa5"].map(lambert);
const roofs = ["#995a4b", "#805e55", "#696c6a", "#ba7760", "#675b69"].map(lambert);
const trim = lambert("#f9eed5");
const timber = lambert("#745a46");
const windows = lambert("#718f91");
const doors = lambert("#5f5149");
const stones = lambert("#a4a599");
const paths = lambert("#c6b593");
const fence = lambert("#b2a084");

const reusableBox = new THREE.BoxGeometry(1, 1, 1);

function basePoint(ctx: Context, s: number, offset: number): THREE.Vector3 {
  const at = ctx.rail.point(s).addScaledVector(ctx.rail.side(s), offset);
  at.y = ctx.landscape.height(s, offset);
  return at.sub(ctx.chunk.center);
}

function setInstance(
  mesh: THREE.InstancedMesh, index: number, position: THREE.Vector3,
  scale: THREE.Vector3, angle: number, color?: string,
): void {
  const transform = new THREE.Matrix4().compose(position,
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), scale);
  mesh.setMatrixAt(index, transform);
  if (color) mesh.setColorAt(index, new THREE.Color(color));
}

function addInstances(ctx: Context, mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (count > 0) {
    // Instanced meshes with custom bounds should not disappear when the
    // moving world origin is rebased.
    mesh.computeBoundingSphere();
    ctx.chunk.group.add(mesh);
    ctx.chunk.instances.push(mesh);
  } else {
    mesh.dispose();
  }
}

function isVillageClearing(seed: number, index: number, s: number, offset: number): boolean {
  if (((index % 12) + 12) % 12 !== 7) return false;
  const mid = index * CHUNK_LENGTH + CHUNK_LENGTH / 2;
  const side = hash(seed, index, 99) > 0.5 ? 1 : -1;
  return Math.abs(s - mid) < 104 && Math.abs(offset - side * 58) < 47;
}

function isWater(ctx: Context, s: number, offset: number): boolean {
  const index = Math.floor(s / CHUNK_LENGTH);
  if (biomeAt(s) !== "lakeside" || ((index % 5) + 5) % 5 !== 1) return false;
  const lake = ctx.landscape.lake(index);
  return Math.hypot((s - lake.s) / 82, (offset - lake.offset) / 64) < 1.1;
}

export function populateLandscape(ctx: Context, index: number, start: number, end: number): void {
  const seed = ctx.rail.seed;
  const candidates = 340;
  const trunks = new THREE.InstancedMesh(trunkShape, wood, candidates);
  const crowns = canopyShapes.flatMap(shape => [
    new THREE.InstancedMesh(shape, leaves, candidates),
    new THREE.InstancedMesh(shape, leaves, candidates),
  ]);
  const crownCounts = [0, 0, 0];
  let trees = 0;

  for (let i = 0; i < candidates; i++) {
    const rand = (salt: number) => hash(seed + salt, index, i);
    const s = start + 4 + rand(11) * (end - start - 8);
    const flank = rand(13) > 0.5 ? 1 : -1;
    const offset = flank * (11 + Math.pow(rand(17), 0.76) * 175);
    const density = ctx.landscape.vegetationDensity(s, offset);
    if (rand(19) > 0.59 + density * 0.46) continue;
    if (isVillageClearing(seed, index, s, offset) || isWater(ctx, s, offset)) continue;

    const biome = biomeAt(s);
    const roll = rand(23);
    const species = biome === "cherry" && roll < 0.72 ? 2 :
      roll < (biome === "highlands" ? 0.36 : 0.25) ? 1 : 0;
    const size = (0.75 + rand(29) * 1.68) * (species === 1 ? 1.23 : 1);
    const base = basePoint(ctx, s, offset);
    const angle = rand(31) * Math.PI * 2;

    setInstance(trunks, trees++, base.clone().add(new THREE.Vector3(0, 1.65 * size, 0)),
      new THREE.Vector3(size, size, size), angle);
    const foliage = FOLIAGE[biome];
    const color = foliage[Math.floor(rand(37) * foliage.length)];
    const count = crownCounts[species]++;
    const crownBase = species === 1 ? 4.4 : 3.8;
    const crownSize = species === 1 ? 1.05 : 1.35;
    const first = crowns[species * 2];
    const second = crowns[species * 2 + 1];
    setInstance(first, count, base.clone().add(new THREE.Vector3(0, crownBase * size, 0)),
      new THREE.Vector3(crownSize * size, (species === 1 ? 1.25 : 0.86) * size,
        crownSize * size), angle, color);
    setInstance(second, count,
      base.clone().add(new THREE.Vector3(
        species === 2 ? 0.68 * size : 0,
        (crownBase + (species === 1 ? 1.45 : 0.85)) * size,
        species === 2 ? 0.42 * size : 0)),
      new THREE.Vector3(crownSize * 0.78 * size,
        (species === 1 ? 1.02 : 0.73) * size,
        crownSize * 0.78 * size), angle + 0.4, color);
  }
  addInstances(ctx, trunks, trees);
  for (let species = 0; species < 3; species++) {
    addInstances(ctx, crowns[species * 2], crownCounts[species]);
    addInstances(ctx, crowns[species * 2 + 1], crownCounts[species]);
  }

  // Low vegetation, flowers and scattered rocks fill the gaps between woods.
  const shrubs = new THREE.InstancedMesh(shrubShape, grassMaterial, 230);
  const flowers = new THREE.InstancedMesh(flowerShape, grassMaterial, 250);
  const rocks = new THREE.InstancedMesh(rockShape, stoneMaterial, 75);
  let shrubsCount = 0;
  let flowerCount = 0;
  let rockCount = 0;
  for (let i = 0; i < 430; i++) {
    const rand = (salt: number) => hash(seed + salt, index, i);
    const s = start + 2 + rand(101) * (end - start - 4);
    const offset = (rand(102) > 0.5 ? 1 : -1) * (6 + rand(103) * 184);
    if (isVillageClearing(seed, index, s, offset) || isWater(ctx, s, offset)) continue;
    const pos = basePoint(ctx, s, offset);
    const scale = 0.4 + rand(104) * 1.2;
    const angle = rand(105) * Math.PI * 2;
    if (rand(106) < 0.58 && shrubsCount < 230) {
      const biome = biomeAt(s);
      const palette = FOLIAGE[biome];
      setInstance(shrubs, shrubsCount++, pos.clone().add(new THREE.Vector3(0, 0.45 * scale, 0)),
        new THREE.Vector3(scale, scale * 0.75, scale),
        angle, palette[Math.floor(rand(107) * palette.length)]);
    } else if (rand(106) < 0.9 && flowerCount < 250) {
      setInstance(flowers, flowerCount++, pos.clone().add(new THREE.Vector3(0, 0.35 * scale, 0)),
        new THREE.Vector3(scale, scale, scale), angle,
        ["#f3d783", "#f6eac2", "#ffffff", "#efa8bb", "#c4abeb"][Math.floor(rand(109) * 5)]);
    } else if (rockCount < 75) {
      const rockSize = 0.55 + rand(108) * 1.85;
      setInstance(rocks, rockCount++, pos.clone().add(new THREE.Vector3(0, rockSize * 0.26, 0)),
        new THREE.Vector3(rockSize, rockSize * 0.6, rockSize * 0.9), angle,
        ["#9ca395", "#b0aa97", "#858e86"][Math.floor(rand(111) * 3)]);
    }
  }
  addInstances(ctx, shrubs, shrubsCount);
  addInstances(ctx, flowers, flowerCount);
  addInstances(ctx, rocks, rockCount);
}

function block(
  root: THREE.Group, material: THREE.Material,
  x: number, y: number, z: number, w: number, h: number, d: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(reusableBox, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  root.add(mesh);
  return mesh;
}

function makeHouse(biome: Biome, variant: number, scale: number): THREE.Group {
  const house = new THREE.Group();
  const wide = biome === "cherry" ? 6.2 : 4.9 + (variant % 3) * 0.6;
  const depth = biome === "lakeside" ? 7.3 : 5.8;
  const h = biome === "highlands" ? 4.0 : 3.5;
  const rise = biome === "cherry" ? 1.45 : 2.05;
  const wall = walls[(variant + (biome === "cherry" ? 2 : 0)) % walls.length];
  const roof = roofs[(variant + (biome === "lakeside" ? 1 : 0)) % roofs.length];
  block(house, stones, 0, 0.32, 0, wide + 0.65, 0.64, depth + 0.7);
  block(house, wall, 0, h / 2 + 0.64, 0, wide, h, depth);
  block(house, timber, 0, 0.76, 0, wide + 0.12, 0.23, depth + 0.12);

  const roofLength = Math.hypot(wide / 2 + 0.52, rise) + 0.2;
  const roofAngle = Math.atan2(rise, wide / 2 + 0.52);
  for (const side of [-1, 1]) {
    const slope = block(house, roof, side * wide / 4, h + 0.65 + rise / 2,
      0, roofLength, 0.28, depth + (biome === "cherry" ? 1.9 : 0.95));
    slope.rotation.z = -side * roofAngle;
  }
  // Doors and framed windows make the houses legible from a moving train.
  block(house, doors, 0, 1.67, -depth / 2 - 0.09, 1.25, 2.05, 0.14);
  block(house, trim, 0, 2.76, -depth / 2 - 0.14, 1.5, 0.16, 0.16);
  for (const x of [-wide * 0.32, wide * 0.32]) {
    block(house, trim, x, 2.55, -depth / 2 - 0.1, 1.18, 1.5, 0.15);
    block(house, windows, x, 2.55, -depth / 2 - 0.2, 0.87, 1.13, 0.1);
    block(house, trim, x, 2.55, -depth / 2 - 0.27, 0.085, 1.15, 0.09);
    block(house, trim, x, 2.55, -depth / 2 - 0.27, 0.9, 0.09, 0.09);
  }
  for (const side of [-1, 1]) {
    block(house, trim, side * (wide / 2 + 0.05), 2.55, 0.65,
      0.12, 1.44, 1.25);
    block(house, windows, side * (wide / 2 + 0.14), 2.55, 0.65,
      0.1, 1.1, 1.03);
  }

  if (biome === "highlands") {
    block(house, stones, wide * 0.26, h + 1.15, depth * 0.14, 0.76, 2.7, 0.9);
    for (const x of [-wide / 2 + 0.25, wide / 2 - 0.25]) {
      block(house, timber, x, 2.55, -depth / 2 - 0.13, 0.22, 3.55, 0.22);
    }
  } else if (biome === "cherry") {
    // Deep overhanging roof and veranda evoke a blossom-valley hamlet.
    block(house, paths, 0, 0.55, -depth / 2 - 1.1, wide + 1.1, 0.28, 2.3);
    for (const x of [-wide / 2, wide / 2]) {
      block(house, timber, x, 1.9, -depth / 2 - 1.8, 0.2, 2.6, 0.2);
    }
  } else {
    block(house, timber, 0, 0.78, -depth / 2 - 1.45, wide + 1.5, 0.26, 2.9);
    for (const x of [-wide / 2 - 0.45, 0, wide / 2 + 0.45]) {
      block(house, trim, x, 1.55, -depth / 2 - 2.6, 0.14, 1.35, 0.14);
    }
    block(house, trim, 0, 2.12, -depth / 2 - 2.6, wide + 1.1, 0.15, 0.16);
  }

  house.scale.setScalar(scale);
  return house;
}

export function populateVillage(ctx: Context, index: number, mid: number): void {
  const seed = ctx.rail.seed;
  const biome = biomeAt(mid);
  const side = hash(seed, index, 99) > 0.5 ? 1 : -1;
  const count = 7 + Math.floor(hash(seed, index, 3) * 5);
  for (let i = 0; i < count; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    const s = mid - 79 + col * 29 + (hash(seed + 4, index, i) - 0.5) * 9;
    const offset = side * (34 + row * 38 + hash(seed + 5, index, i) * 12);
    const house = makeHouse(biome, i, 0.68 + hash(seed + 6, index, i) * 0.45);
    house.position.copy(basePoint(ctx, s, offset));
    house.rotation.y = Math.atan2(-ctx.rail.tangent(s).x, -ctx.rail.tangent(s).z) +
      (side < 0 ? Math.PI : 0);
    ctx.chunk.group.add(house);
    // Short garden paths run from each doorway towards the village lane.
    const path = new THREE.Mesh(reusableBox, paths);
    path.scale.set(2.1, 0.12, 5);
    path.position.copy(basePoint(ctx, s, offset - side * 6));
    path.position.y += 0.1;
    path.rotation.y = house.rotation.y;
    ctx.chunk.group.add(path);
  }

  // A shared unpaved lane and small fences tie individual houses together.
  for (let j = 0; j < 7; j++) {
    const s = mid - 85 + j * 28;
    const pos = basePoint(ctx, s, side * 53);
    const lane = new THREE.Mesh(reusableBox, paths);
    lane.scale.set(5.6, 0.16, 30);
    lane.position.copy(pos);
    lane.position.y += 0.04;
    lane.rotation.y = Math.atan2(-ctx.rail.tangent(s).x, -ctx.rail.tangent(s).z);
    ctx.chunk.group.add(lane);
    if (j % 2 === 0) {
      for (const edge of [side * 30, side * 86]) {
        const post = basePoint(ctx, s, edge);
        block(ctx.chunk.group, fence,
          post.x, post.y + 0.7, post.z, 0.18, 1.4, 0.18);
      }
    }
  }
}
