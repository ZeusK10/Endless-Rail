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

function isVillageClearing(seed: number, index: number, s: number, offset: number): boolean {
  if (((index % 12) + 12) % 12 !== 7) return false;
  const mid = index * CHUNK_LENGTH + CHUNK_LENGTH / 2;
  const side = hash(seed, index, 99) > 0.5 ? 1 : -1;
  return Math.abs(s - mid) < 104 && Math.abs(offset - side * 58) < 47;
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

export function populateVillage(ctx: Context, index: number, mid: number): void {
  const seed = ctx.rail.seed;
  const biome = biomeAt(mid);
  const side = hash(seed, index, 99) > 0.5 ? 1 : -1;
  const count = 7 + Math.floor(hash(seed, index, 3) * 5);
  for (let i = 0; i < count; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    const s = mid - 83 + col * 30 + (hash(seed ^ 0x3b15e, index, i) - 0.5) * 24;
    const offset = side * (33 + row * 41 + hash(seed ^ 0x941e5, index, i) * 18);
    const house = makeHouse(biome, i, 0.68 + hash(seed + 6, index, i) * 0.45);
    house.position.copy(basePoint(ctx, s, offset));
    house.rotation.y = Math.atan2(-ctx.rail.tangent(s).x, -ctx.rail.tangent(s).z) +
      (side < 0 ? Math.PI : 0) + (hash(seed ^ 0x861aa, index, i) - .5) * .44;
    ctx.chunk.group.add(house);
    // Short garden paths run from each doorway towards the village lane.
    const path = new THREE.Mesh(reusableBox, paths);
    path.scale.set(2.1, 0.12, 5);
    path.position.copy(basePoint(ctx, s, offset - side * 6));
    path.position.y += 0.1;
    path.rotation.y = house.rotation.y;
    ctx.chunk.group.add(path);

    if (i % 3 === 0) {
      // Individual vegetable plots and gardens make each hamlet feel lived in.
      const plot = basePoint(ctx, s + 8, offset + side * 9);
      block(ctx.chunk.group, soil, plot.x, plot.y + .08, plot.z, 5.8, .16, 8.4);
      for (let bed = -1; bed <= 1; bed++) {
        block(ctx.chunk.group, field,
          plot.x + bed * 1.55, plot.y + .19, plot.z,
          .75, .16, 7.4);
      }
    }
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
