import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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
const fallenShape = new THREE.CylinderGeometry(0.28, 0.42, 5.7, 6);
fallenShape.rotateZ(Math.PI / 2);
const soil = lambert("#a38160");
const field = lambert("#8da65a");

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

export function villageRegion(seed: number, index: number): { center: number; side: number } | null {
  // One settlement spans three neighboring chunks. Its seed is independent
  // of streaming order, so a reverse journey recreates the same village.
  const region = Math.round((index - 7) / 15);
  const center = region * 15 + 7;
  if (Math.abs(index - center) > 1) return null;
  return { center, side: hash(seed, center, 99) > .5 ? 1 : -1 };
}

function isVillageClearing(seed: number, index: number, s: number, offset: number): boolean {
  const region = villageRegion(seed, index);
  if (!region) return false;
  const mid = index * CHUNK_LENGTH + CHUNK_LENGTH / 2;
  return Math.abs(s - mid) < 113 && Math.abs(offset - region.side * 84) < 79;
}

function isWater(ctx: Context, s: number, offset: number): boolean {
  return ctx.landscape.isWater(s, offset);
}

export function populateLandscape(
  ctx: Context, index: number, start: number, end: number, densityScale = 1,
): void {
  const seed = ctx.rail.seed;
  const candidates = Math.round(340 * densityScale);
  const trunks = new THREE.InstancedMesh(trunkShape, wood, candidates);
  const crowns = canopyShapes.flatMap(shape =>
    [0, 1, 2].map(() => new THREE.InstancedMesh(shape, leaves, candidates)));
  const crownCounts = [0, 0, 0];
  let trees = 0;

  for (let i = 0; i < candidates; i++) {
    // Salt a separate mixed seed for each coordinate. Adding small salts to the
    // seed correlated longitudinal and lateral samples into visible diagonals.
    const rand = (salt: number) => hash(seed ^ Math.imul(salt, 0x9e3779b1), index, i);
    const s = start + 4 + rand(11) * (end - start - 8);
    const flank = rand(13) > 0.5 ? 1 : -1;
    const offset = flank * (11 + Math.pow(rand(17), 0.76) * 175);
    const density = ctx.landscape.vegetationDensity(s, offset);
    // Coherent vegetation noise forms natural groves and meadow clearings.
    if (rand(19) > 0.28 + Math.pow(density, 1.5) * 0.72) continue;
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
    // Three offset foliage masses per tree add asymmetry to broadleaf and
    // cherry crowns; pines use overlapping tapered tiers.
    for (let layer = 0; layer < 3; layer++) {
      let dx = 0;
      let dz = 0;
      let height = 0;
      let radius = 1;
      let stretch = 1;
      if (species === 1) {
        height = (3.55 + layer * 1.22) * size;
        radius = (1.24 - layer * 0.29) * size;
        stretch = 1.36;
      } else {
        dx = (layer === 1 ? -0.93 : layer === 2 ? 0.92 : 0) * size;
        dz = (layer === 1 ? 0.36 : layer === 2 ? -0.47 : 0) * size;
        height = (layer === 0 ? 4.3 : 3.65) * size;
        radius = (layer === 0 ? 1.38 : 1.03) * size;
        stretch = 0.78 + rand(41 + layer) * 0.2;
      }
      const crown = crowns[species * 3 + layer];
      const tint = layer === 1 && foliage.length > 2
        ? foliage[(Math.floor(rand(37) * foliage.length) + 1) % foliage.length]
        : color;
      setInstance(crown, count, base.clone().add(new THREE.Vector3(dx, height, dz)),
        new THREE.Vector3(radius, radius * stretch, radius),
        angle + layer * 0.27, tint);
    }
  }
  addInstances(ctx, trunks, trees);
  for (let species = 0; species < 3; species++) {
    for (let layer = 0; layer < 3; layer++) {
      addInstances(ctx, crowns[species * 3 + layer], crownCounts[species]);
    }
  }

  // Low vegetation, flowers and scattered rocks fill the gaps between woods.
  const shrubMax = Math.round(230 * densityScale);
  const flowerMax = Math.round(250 * densityScale);
  const rockMax = Math.round(75 * densityScale);
  const shrubs = new THREE.InstancedMesh(shrubShape, grassMaterial, shrubMax);
  const flowers = new THREE.InstancedMesh(flowerShape, grassMaterial, flowerMax);
  const rocks = new THREE.InstancedMesh(rockShape, stoneMaterial, rockMax);
  let shrubsCount = 0;
  let flowerCount = 0;
  let rockCount = 0;
  for (let i = 0; i < Math.round(430 * densityScale); i++) {
    const rand = (salt: number) => hash(seed ^ Math.imul(salt, 0x9e3779b1), index, i);
    const s = start + 2 + rand(101) * (end - start - 4);
    const offset = (rand(102) > 0.5 ? 1 : -1) * (6 + rand(103) * 184);
    if (isVillageClearing(seed, index, s, offset) || isWater(ctx, s, offset)) continue;
    const pos = basePoint(ctx, s, offset);
    const scale = 0.4 + rand(104) * 1.2;
    const angle = rand(105) * Math.PI * 2;
    if (rand(106) < 0.58 && shrubsCount < shrubMax) {
      const biome = biomeAt(s);
      const palette = FOLIAGE[biome];
      setInstance(shrubs, shrubsCount++, pos.clone().add(new THREE.Vector3(0, 0.45 * scale, 0)),
        new THREE.Vector3(scale, scale * 0.75, scale),
        angle, palette[Math.floor(rand(107) * palette.length)]);
    } else if (rand(106) < 0.9 && flowerCount < flowerMax) {
      setInstance(flowers, flowerCount++, pos.clone().add(new THREE.Vector3(0, 0.35 * scale, 0)),
        new THREE.Vector3(scale, scale, scale), angle,
        ["#f3d783", "#f6eac2", "#ffffff", "#efa8bb", "#c4abeb"][Math.floor(rand(109) * 5)]);
    } else if (rockCount < rockMax) {
      const rockSize = 0.55 + rand(108) * 1.85;
      setInstance(rocks, rockCount++, pos.clone().add(new THREE.Vector3(0, rockSize * 0.26, 0)),
        new THREE.Vector3(rockSize, rockSize * 0.6, rockSize * 0.9), angle,
        ["#9ca395", "#b0aa97", "#858e86"][Math.floor(rand(111) * 3)]);
    }
  }
  addInstances(ctx, shrubs, shrubsCount);
  addInstances(ctx, flowers, flowerCount);
  addInstances(ctx, rocks, rockCount);

  // Fallen trunks, young roadside growth and larger rock outcrops provide
  // forest ages and readable foreground detail without adding draw calls.
  const extraCount = Math.max(2, Math.round(26 * densityScale));
  const logs = new THREE.InstancedMesh(fallenShape, wood, extraCount);
  const boulders = new THREE.InstancedMesh(rockShape, stoneMaterial, extraCount);
  const saplings = new THREE.InstancedMesh(shrubShape, grassMaterial, extraCount * 2);
  let logCount = 0, boulderCount = 0, saplingCount = 0;
  for (let i = 0; i < extraCount; i++) {
    const rand = (salt: number) => hash(seed ^ Math.imul(salt, 0x9e3779b1), index, i);
    const s = start + rand(202) * (end - start);
    const offset = (rand(203) < 0.5 ? -1 : 1) * (12 + rand(204) * 155);
    if (isWater(ctx, s, offset) || isVillageClearing(seed, index, s, offset)) continue;
    const base = basePoint(ctx, s, offset);
    const size = 0.7 + rand(205) * 1.35;
    if (rand(206) > 0.47) {
      setInstance(logs, logCount++, base.clone().add(new THREE.Vector3(0, .36, 0)),
        new THREE.Vector3(size, size, size), rand(207) * Math.PI * 2);
    } else {
      const rockSize = 1.5 + rand(208) * 3.3;
      setInstance(boulders, boulderCount++,
        base.clone().add(new THREE.Vector3(0, rockSize * 0.25, 0)),
        new THREE.Vector3(rockSize, rockSize * .55, rockSize * .8),
        rand(209) * Math.PI * 2, ["#878f84","#aaa292","#9b9a86"][Math.floor(rand(210)*3)]);
    }
    // Near-track bushes follow individual random positions, not parallel rows.
    for (let j = 0; j < 2; j++) {
      const roadS = start + hash(seed ^ 0x6546abc, index, i * 3 + j) * (end - start);
      const roadOffset = (rand(213 + j) < .5 ? -1 : 1) * (8 + rand(216 + j) * 9);
      if (isWater(ctx, roadS, roadOffset)) continue;
      const point = basePoint(ctx, roadS, roadOffset);
      const scale = 0.3 + rand(220 + j) * 0.7;
      const palette = FOLIAGE[biomeAt(roadS)];
      setInstance(saplings, saplingCount++,
        point.add(new THREE.Vector3(0, scale * .3, 0)),
        new THREE.Vector3(scale, scale, scale),
        rand(224 + j) * 6.28, palette[Math.floor(rand(228 + j) * palette.length)]);
    }
  }
  addInstances(ctx, logs, logCount);
  addInstances(ctx, boulders, boulderCount);
  addInstances(ctx, saplings, saplingCount);
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

// House geometry is authored in simple low-poly pieces, then merged once per
// biome/variant. A full village stays detailed without a draw call for every
// pane, tile, beam or chimney stone, even after chunks are streamed repeatedly.
const roofRidge = lambert("#ddd4bd");
const shutter = lambert("#5e7168");
const roofEdge = lambert("#4d5156");
const windowGlow = lambert("#efce92");
const gardenGreen = lambert("#63894e");
const flowerPink = lambert("#d78999");
const flowerGold = lambert("#e2b95a");
const houseCache = new Map<string, THREE.Group>();

function houseDetailPrototype(biome: Biome, variant: number): THREE.Group {
  const house = new THREE.Group();
  const wide = biome === "cherry" ? 6.2 : 4.9 + (variant % 3) * 0.6;
  const depth = biome === "lakeside" ? 7.3 : 5.8;
  const h = biome === "highlands" ? 4.0 : 3.5;
  const rise = biome === "cherry" ? 1.45 : 2.05;
  const wall = walls[(variant + (biome === "cherry" ? 2 : 0)) % walls.length];
  const roof = roofs[(variant + (biome === "lakeside" ? 1 : 0)) % roofs.length];
  const glazing = variant % 4 === 0 ? windowGlow : windows;
  const foundation = 0.64;
  const front = -depth / 2;
  const wallTop = h + foundation;

  block(house, stones, 0, 0.32, 0, wide + 0.65, 0.64, depth + 0.7);
  block(house, wall, 0, h / 2 + foundation, 0, wide, h, depth);
  block(house, timber, 0, 0.76, 0, wide + 0.12, 0.23, depth + 0.12);
  // Stone corner quoins and irregular foundation blocks give the walls depth.
  for (const x of [-wide / 2 + 0.23, wide / 2 - 0.23]) {
    for (const z of [front + 0.15, -front - 0.15]) {
      for (let j = 0; j < 4; j++) {
        block(house, j % 2 ? stones : trim, x, 1.07 + j * 0.93, z,
          0.44, 0.24, 0.48);
      }
    }
  }

  // A triangular gable closes the facade under the pitched roof.
  const gableOutline = new THREE.Shape();
  gableOutline.moveTo(-wide / 2, wallTop - 0.04);
  gableOutline.lineTo(0, wallTop + rise - 0.14);
  gableOutline.lineTo(wide / 2, wallTop - 0.04);
  gableOutline.closePath();
  const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(gableOutline, {
    depth: 0.18, bevelEnabled: false, steps: 1, curveSegments: 1,
  }), wall);
  gable.position.z = front + 0.02;
  house.add(gable);

  const roofLength = Math.hypot(wide / 2 + 0.6, rise) + 0.3;
  const roofAngle = Math.atan2(rise, wide / 2 + 0.6);
  const roofDepth = depth + (biome === "cherry" ? 2.0 : 1.2);
  for (const side of [-1, 1]) {
    const section = new THREE.Group();
    section.position.set(side * wide / 4, wallTop + rise / 2, 0);
    section.rotation.z = -side * roofAngle;
    house.add(section);
    block(section, roof, 0, 0, 0, roofLength, 0.26, roofDepth);
    block(section, roofEdge, 0, -0.13, front - (roofDepth - depth) / 2,
      roofLength + 0.1, 0.09, 0.12);
    // Slim horizontal tile courses catch light as the train passes.
    for (let j = 0; j < 5; j++) {
      const tileZ = -roofDepth / 2 + 0.5 + j * ((roofDepth - 1) / 4);
      block(section, roofRidge, 0, 0.16, tileZ, roofLength + 0.02, 0.035, 0.045);
    }
  }
  block(house, roofEdge, 0, wallTop + rise + 0.025, 0, 0.19, 0.2, roofDepth + 0.12);
  // Little attic vent in the gable, outlined by exterior joinery.
  block(house, trim, 0, wallTop + rise * 0.38, front - 0.13, 0.73, 0.66, 0.08);
  block(house, glazing, 0, wallTop + rise * 0.38, front - 0.20, 0.51, 0.44, 0.07);
  block(house, timber, 0, wallTop + rise * 0.38, front - 0.27, 0.08, 0.48, 0.045);

  // Front entrance: a recessed frame, divided door, handle, threshold, steps.
  block(house, trim, 0, 1.68, front - 0.085, 1.48, 2.19, 0.2);
  block(house, doors, 0, 1.67, front - 0.21, 1.23, 2.02, 0.12);
  for (const x of [-0.34, 0.34]) {
    block(house, timber, x, 1.81, front - 0.29, 0.37, 1.01, 0.06);
    block(house, trim, x, 2.32, front - 0.31, 0.39, 0.05, 0.05);
  }
  block(house, roofRidge, 0.42, 1.62, front - 0.34, 0.09, 0.1, 0.12);
  for (let i = 0; i < 2; i++) {
    block(house, stones, 0, 0.28 - i * 0.11, front - 0.8 - i * 0.5,
      1.95 + i * 0.55, 0.22, 0.52);
  }

  const windowAt = (x: number, y: number, z: number, sizeX: number, sizeY: number) => {
    block(house, trim, x, y, z, sizeX + 0.22, sizeY + 0.22, 0.18);
    block(house, glazing, x, y, z - 0.115, sizeX, sizeY, 0.1);
    block(house, timber, x, y, z - 0.19, 0.07, sizeY + 0.04, 0.07);
    block(house, timber, x, y, z - 0.195, sizeX + 0.03, 0.08, 0.08);
    block(house, stones, x, y - sizeY / 2 - 0.11, z - 0.16,
      sizeX + 0.33, 0.15, 0.38);
    // Shutters are folded open, framing rather than hiding the glass.
    for (const flank of [-1, 1]) {
      block(house, shutter, x + flank * (sizeX / 2 + 0.20), y, z - 0.1,
        0.29, sizeY + 0.16, 0.09);
    }
  };
  for (const x of [-wide * 0.32, wide * 0.32]) {
    windowAt(x, 2.55, front - 0.07, 0.95, 1.24);
    // Flower box with broad leaves and contrasting blossoms under each window.
    const boxZ = front - 0.43;
    block(house, timber, x, 1.81, boxZ, 1.33, 0.26, 0.34);
    for (let p = -1; p <= 1; p++) {
      block(house, gardenGreen, x + p * 0.33, 2.03, boxZ, 0.24, 0.31, 0.19);
      block(house, (p + variant) % 2 ? flowerPink : flowerGold,
        x + p * 0.33, 2.22, boxZ - 0.02, 0.15, 0.16, 0.15);
    }
  }

  // Side facades get real glazing, mullions and wooden sill details.
  for (const side of [-1, 1]) {
    const x = side * (wide / 2 + 0.11);
    for (const z of [-depth * 0.22, depth * 0.25]) {
      block(house, trim, x, 2.62, z, 0.20, 1.42, 1.29);
      block(house, glazing, x + side * 0.09, 2.62, z, 0.09, 1.14, 1.03);
      block(house, timber, x + side * 0.15, 2.62, z, 0.08, 1.18, 0.07);
      block(house, timber, x + side * 0.16, 2.62, z, 0.08, 0.07, 1.05);
      block(house, stones, x, 1.88, z, 0.39, 0.13, 1.36);
    }
    // Rain gutter and downpipe also make the silhouette less box-like.
    block(house, roofEdge, side * (wide / 2 + 0.34), wallTop + 0.08, 0,
      0.16, 0.13, roofDepth - 0.25);
    block(house, roofEdge, side * (wide / 2 + 0.22), 2.6, depth / 2 - 0.18,
      0.12, 3.9, 0.13);
  }

  if (biome === "highlands") {
    // Stone chimney with lip, farmhouse beams and small protective porch.
    const chimneyX = wide * 0.28;
    block(house, stones, chimneyX, wallTop + 0.88, depth * 0.16, 0.96, 2.76, 0.91);
    block(house, roofEdge, chimneyX, wallTop + 2.33, depth * 0.16, 1.16, 0.25, 1.10);
    block(house, darkChimney, chimneyX, wallTop + 2.47, depth * 0.16, 0.63, 0.06, 0.58);
    for (const x of [-wide / 2 + 0.24, wide / 2 - 0.24]) {
      block(house, timber, x, 2.53, front - 0.14, 0.22, 3.5, 0.22);
    }
    block(house, timber, 0, wallTop - 0.20, front - 0.16, wide - 0.44, 0.21, 0.18);
    block(house, roof, 0, 3.13, front - 1.02, 2.40, 0.17, 1.9);
    for (const x of [-1.05, 1.05]) {
      block(house, timber, x, 1.84, front - 1.78, 0.13, 2.45, 0.13);
    }
  } else if (biome === "cherry") {
    // Veranda, lanterns, lattice screens and curved-looking layered eaves.
    block(house, paths, 0, 0.56, front - 1.2, wide + 1.15, 0.26, 2.7);
    for (const x of [-wide / 2 + 0.05, 0, wide / 2 - 0.05]) {
      block(house, timber, x, 1.89, front - 2.34, 0.19, 2.54, 0.19);
    }
    block(house, timber, 0, 3.15, front - 2.34, wide + 0.35, 0.16, 0.18);
    for (const x of [-2.22, 2.22]) {
      block(house, windowGlow, x, 2.65, front - 2.39, 0.27, 0.43, 0.27);
      block(house, roofEdge, x, 2.93, front - 2.39, 0.37, 0.12, 0.36);
    }
    for (const x of [-wide * 0.35, wide * 0.35]) {
      for (let slat = 0; slat < 3; slat++) {
        block(house, timber, x - 0.32 + slat * 0.32, 1.16,
          front - 2.36, 0.055, 0.78, 0.08);
      }
    }
  } else {
    // Lakeside homes sit above wet ground on a deck with porch rails.
    block(house, timber, 0, 0.8, front - 1.55, wide + 1.65, 0.26, 3.15);
    for (const x of [-wide / 2 - 0.55, 0, wide / 2 + 0.55]) {
      block(house, trim, x, 1.55, front - 2.94, 0.14, 1.42, 0.15);
    }
    block(house, trim, 0, 2.13, front - 2.94, wide + 1.35, 0.13, 0.17);
    for (const x of [-wide / 2 + 0.2, wide / 2 - 0.2]) {
      block(house, timber, x, 2.25, front - 2.10, 0.19, 2.85, 0.19);
    }
    block(house, roof, 0, 3.74, front - 1.69, wide + 0.95, 0.17, 3.3);
    for (const z of [-1.1, 1.0]) {
      block(house, roofEdge, wide / 2 + 0.3, 2.16, z, 0.16, 0.3, 0.2);
    }
  }

  house.updateMatrixWorld(true);
  const geometries = new Map<THREE.Material, THREE.BufferGeometry[]>();
  house.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    const original = object.geometry as THREE.BufferGeometry;
    // Extruded gables are non-indexed; normalize boxes before combining.
    const geometry = original.index ? original.toNonIndexed() : original.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const list = geometries.get(material) ?? [];
    list.push(geometry);
    geometries.set(material, list);
  });
  const mergedHouse = new THREE.Group();
  for (const [material, parts] of geometries) {
    const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (!geometry) throw new Error("Unable to merge village house geometry");
    mergedHouse.add(new THREE.Mesh(geometry, material));
    if (parts.length > 1) parts.forEach(part => part.dispose());
  }
  return mergedHouse;
}

const darkChimney = lambert("#31383b");

function makeHouse(biome: Biome, variant: number, scale: number): THREE.Group {
  const key = biome + ":" + variant;
  let prototype = houseCache.get(key);
  if (!prototype) {
    prototype = houseDetailPrototype(biome, variant);
    houseCache.set(key, prototype);
  }
  const house = prototype.clone();
  house.scale.setScalar(scale);
  return house;
}

// Outbuildings have distinct footprints, roof silhouettes and facades, with
// cached shared detail so settlements never fall back to a generic cube.
const outbuildingCache = new Map<string, THREE.Group>();
function makeOutbuilding(biome: Biome, kind: "barn" | "shop" | "workshop"): THREE.Group {
  const cacheKey = biome + ":" + kind;
  const cached = outbuildingCache.get(cacheKey);
  if (cached) return cached.clone();
  const group = new THREE.Group();
  const width = kind === "barn" ? 10.8 : kind === "workshop" ? 8.4 : 7.7;
  const depth = kind === "barn" ? 12 : 8.2;
  const height = kind === "barn" ? 6.3 : 4.2;
  const main = kind === "barn" ? timber : walls[kind === "shop" ? 3 : 1];
  block(group, stones, 0, .28, 0, width + .7, .56, depth + .7);
  block(group, main, 0, height / 2 + .56, 0, width, height, depth);
  for (const flank of [-1, 1]) {
    const roof = block(group, kind === "barn" ? roofs[3] : roofs[2],
      flank * width / 4, height + 1.13, 0,
      width * .57, .28, depth + 1.35);
    roof.rotation.z = -flank * .39;
    block(group, trim, flank * width * .32, 2.8, -depth / 2 - .14,
      1.45, 1.6, .21);
    block(group, windows, flank * width * .32, 2.8, -depth / 2 - .29,
      1.24, 1.35, .08);
  }
  block(group, doors, 0, 2.15, -depth / 2 - .16,
    kind === "barn" ? 3.9 : 2.1, 3.9, .2);
  if (kind === "shop") {
    block(group, roofs[4], 0, 3.72, -depth / 2 - 1.2, width * .78, .16, 2.6);
    block(group, trim, 0, 4.4, -depth / 2 - .21, width * .7, .76, .17);
  } else if (kind === "workshop") {
    block(group, stones, 2.8, height + 2.15, 1.5, .85, 3.9, .9);
    block(group, roofs[0], 2.8, height + 4.15, 1.5, 1.05, .3, 1.1);
  } else {
    for (let plank = -2; plank <= 2; plank++) {
      block(group, trim, plank * .68, 2.15, -depth / 2 - .31,
        .075, 3.45, .08);
    }
  }
  outbuildingCache.set(cacheKey, group);
  return group.clone();
}

export function populateVillage(ctx: Context, index: number, mid: number): void {
  const region = villageRegion(ctx.rail.seed, index);
  if (!region) return;
  const seed = ctx.rail.seed, side = region.side;
  const villageSeed = region.center;
  const numberOfBuildings = 6 + Math.floor(hash(seed, villageSeed, index + 33) * 3);
  const placed: Array<{ s: number; offset: number }> = [];
  const roadOffset = (s: number): number =>
    side * (53 + Math.sin(s / 78 + hash(seed, villageSeed, 404) * 6) * 9);

  // A connected, curved rural road follows the settlement through all three
  // chunks. Paths and yards connect each home to this shared artery.
  for (let roadS = mid - CHUNK_LENGTH / 2 + 5; roadS < mid + CHUNK_LENGTH / 2; roadS += 13) {
    const where = roadOffset(roadS);
    if (isWater(ctx, roadS, where)) continue;
    const pos = basePoint(ctx, roadS, where);
    const road = new THREE.Mesh(reusableBox, paths);
    road.position.copy(pos);
    road.position.y += .1;
    road.scale.set(6.7, .18, 13.9);
    road.rotation.y = Math.atan2(-ctx.rail.tangent(roadS).x,
      -ctx.rail.tangent(roadS).z);
    ctx.chunk.group.add(road);
  }

  for (let i = 0; i < numberOfBuildings; i++) {
    let s = mid, offset = side * 90;
    let found = false;
    for (let attempt = 0; attempt < 14; attempt++) {
      const key = i * 29 + attempt;
      s = mid - 103 + hash(seed ^ 0x3b15e, index, key) * 206;
      offset = side * (41 + hash(seed ^ 0x941e5, index, key) * 111);
      if (isWater(ctx, s, offset)) continue;
      const slope = Math.abs(ctx.landscape.height(s, offset + 4) -
        ctx.landscape.height(s, offset - 4));
      if (slope > 5.4) continue;
      if (placed.some(p => Math.hypot(s - p.s, offset - p.offset) < 15)) continue;
      found = true;
      break;
    }
    if (!found) continue;
    placed.push({ s, offset });
    const style = i === 0 ? "barn" : i === 3 ? "shop" :
      i === 5 && index === region.center ? "workshop" : null;
    const building = style
      ? makeOutbuilding(biomeAt(s), style)
      : makeHouse(biomeAt(s), ((i + index * 3) % 12 + 12) % 12,
        .73 + hash(seed + 6, index, i) * .39);
    building.position.copy(basePoint(ctx, s, offset));
    building.rotation.y = Math.atan2(-ctx.rail.tangent(s).x, -ctx.rail.tangent(s).z) +
      (side < 0 ? Math.PI : 0) + (hash(seed ^ 0x861aa, index, i) - .5) * .52;
    ctx.chunk.group.add(building);

    const street = roadOffset(s);
    const length = Math.abs(offset - street);
    if (length > 9) {
      for (let j = 0; j < Math.floor(length / 7); j++) {
        const spot = street + side * (j + .5) * length / Math.floor(length / 7);
        if (isWater(ctx, s, spot)) continue;
        const at = basePoint(ctx, s, spot);
        const path = new THREE.Mesh(reusableBox, paths);
        path.position.copy(at);
        path.position.y += .08;
        path.scale.set(2.1, .12, length / Math.floor(length / 7) + .1);
        path.rotation.y = Math.atan2(-ctx.rail.tangent(s).x,
          -ctx.rail.tangent(s).z) + Math.PI / 2;
        ctx.chunk.group.add(path);
      }
    }
    if (i % 3 === 0) {
      const gardenS = Math.min(mid + 111, s + 11);
      const gardenOffset = offset + side * 8;
      if (!isWater(ctx, gardenS, gardenOffset)) {
        const plot = basePoint(ctx, gardenS, gardenOffset);
        block(ctx.chunk.group, soil, plot.x, plot.y + .08, plot.z, 7.0, .16, 9.2);
        for (let bed = -1; bed <= 1; bed++) {
          block(ctx.chunk.group, field, plot.x + bed * 1.75,
            plot.y + .19, plot.z, .9, .16, 7.8);
        }
      }
    }
    if (i % 2 === 0) {
      for (const x of [-3.4, 3.4]) {
        const at = basePoint(ctx, s + 6, offset + x);
        block(ctx.chunk.group, fence, at.x, at.y + .6, at.z, .16, 1.2, .16);
      }
    }
  }
}

const animalMaterials: Record<string, THREE.MeshLambertMaterial> = {
  deer: lambert("#a77551"), sheep: lambert("#e1ddcb"),
  horse: lambert("#805e43"), bird: lambert("#647984"),
  hoof: lambert("#544739"), pale: lambert("#d9bb90"),
};
const faunaCache = new Map<string, THREE.Group>();

function wildlifePrototype(kind: "deer" | "sheep" | "horse" | "bird"): THREE.Group {
  const cached = faunaCache.get(kind);
  if (cached) return cached;
  const root = new THREE.Group();
  const fur = animalMaterials[kind], hoof = animalMaterials.hoof;
  const put = (material: THREE.Material, x: number, y: number, z: number,
    sx: number, sy: number, sz: number): void => {
    block(root, material, x, y, z, sx, sy, sz);
  };
  if (kind === "bird") {
    put(fur, 0, 0, 0, .55, .38, 1.1);
    put(fur, -.8, .03, .1, 1.6, .10, .62);
    put(fur, .8, .03, .1, 1.6, .10, .62);
    put(hoof, 0, .02, -.68, .24, .12, .36);
  } else {
    const size = kind === "horse" ? 1.36 : kind === "deer" ? 1.05 : .87;
    const bodyLength = kind === "sheep" ? 2.3 : 2.75;
    put(fur, 0, 1.93 * size, 0, 1.12 * size, 1.38 * size, bodyLength * size);
    for (const x of [-.41, .41]) {
      for (const z of [-.92, .92]) {
        put(fur, x * size, .89 * size, z * size, .27 * size, 1.68 * size, .32 * size);
        put(hoof, x * size, .12 * size, z * size,
          .35 * size, .24 * size, .38 * size);
      }
    }
    put(fur, 0, 2.69 * size, -1.04 * size, .72 * size, 1.42 * size, .72 * size);
    put(fur, 0, 3.43 * size, -1.42 * size, .77 * size, .64 * size, 1.15 * size);
    put(animalMaterials.pale, 0, 3.23 * size, -1.91 * size,
      .62 * size, .35 * size, .5 * size);
    for (const x of [-.23, .23]) {
      put(fur, x * size, 3.93 * size, -1.53 * size,
        .22 * size, .4 * size, .18 * size);
    }
    if (kind === "deer") {
      for (const x of [-.24, .24]) {
        put(animalMaterials.pale, x * size, 4.29 * size, -1.48 * size,
          .12 * size, .95 * size, .12 * size);
        put(animalMaterials.pale, x * 1.9 * size, 4.55 * size, -1.48 * size,
          .51 * size, .10 * size, .12 * size);
      }
    } else if (kind === "sheep") {
      for (const x of [-.33, 0, .33]) for (const z of [-.55, 0, .55]) {
        const wool = new THREE.Mesh(new THREE.IcosahedronGeometry(.51, 0), fur);
        wool.position.set(x * size, 2.39 * size, z * size);
        root.add(wool);
      }
    } else {
      put(hoof, 0, 2.9 * size, 1.48 * size, .3 * size, .27 * size, .85 * size);
    }
  }
  // Merge geometry by material once; individual animated creatures take only
  // a handful of draw calls regardless of component count.
  root.updateMatrixWorld(true);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const group = parts.get(material) ?? [];
    group.push(geometry);
    parts.set(material, group);
  });
  const merged = new THREE.Group();
  for (const [material, pieces] of parts) {
    const geometry = pieces.length > 1 ? mergeGeometries(pieces, false) : pieces[0];
    if (!geometry) throw new Error("Unable to combine wildlife geometry");
    merged.add(new THREE.Mesh(geometry, material));
    if (pieces.length > 1) pieces.forEach(piece => piece.dispose());
  }
  faunaCache.set(kind, merged);
  return merged;
}

/** Chunk-seeded lightweight fauna, far enough from rails, houses and water. */
export function populateWildlife(
  ctx: Context, index: number, start: number, end: number, densityScale = 1,
): THREE.Object3D[] {
  const animals: THREE.Object3D[] = [];
  const candidates = Math.max(1, Math.round((4 + hash(ctx.rail.seed, index, 804) * 4) * densityScale));
  const palette: Array<"deer" | "sheep" | "horse" | "bird"> =
    biomeAt((start + end) / 2) === "highlands"
      ? ["deer", "sheep", "horse", "bird"]
      : biomeAt((start + end) / 2) === "cherry"
        ? ["deer", "deer", "bird", "sheep"]
        : ["sheep", "horse", "bird", "bird"];
  for (let i = 0; i < candidates; i++) {
    const rand = (salt: number) =>
      hash(ctx.rail.seed ^ Math.imul(salt, 0x45d9f3b), index, i);
    const s = start + 12 + rand(808) * (end - start - 24);
    const offset = (rand(810) > .5 ? 1 : -1) * (32 + rand(811) * 139);
    if (isWater(ctx, s, offset) ||
        isVillageClearing(ctx.rail.seed, index, s, offset)) continue;
    const grade = Math.abs(ctx.landscape.height(s, offset + 3) -
      ctx.landscape.height(s, offset - 3));
    if (grade > 6) continue;
    const kind = palette[Math.floor(rand(812) * palette.length)];
    const creature = wildlifePrototype(kind).clone();
    const base = basePoint(ctx, s, offset);
    const flying = kind === "bird";
    base.y += flying ? 9 + rand(813) * 11 : 0;
    creature.position.copy(base);
    creature.scale.setScalar(flying ? .8 + rand(814) * .35 :
      .72 + rand(814) * .37);
    creature.rotation.y = rand(815) * Math.PI * 2;
    creature.userData = {
      baseY: base.y, baseX: base.x, baseZ: base.z,
      phase: rand(816) * Math.PI * 2, flying,
      speed: .36 + rand(817) * .55, angle: creature.rotation.y,
    };
    ctx.chunk.group.add(creature);
    animals.push(creature);
  }
  return animals;
}
