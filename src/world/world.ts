import * as THREE from "three";
import { RailPath } from "../sim/rail";
import { Landscape } from "./landscape";
import { populateLandscape, populateVillage, populateWildlife, villageRegion } from "./scenery";
import {
  BIOME_NAMES, CHUNK_LENGTH, biomeAt, biomeBlend,
  type Biome,
} from "../game/constants";

interface Chunk {
  group: THREE.Group;
  center: THREE.Vector3;
  geometries: THREE.BufferGeometry[];
  instances: THREE.InstancedMesh[];
  wildlife: THREE.Object3D[];
}

const sleeperGeometry = new THREE.BoxGeometry(3.6, 0.2, 0.55);
const fastenerGeometry = new THREE.BoxGeometry(.21, .075, .38);
const signMaterials = new Map<number, THREE.SpriteMaterial>();
function speedSignMaterial(limit: number): THREE.SpriteMaterial {
  const key = Math.round(limit / 5) * 5;
  const existing = signMaterials.get(key);
  if (existing) return existing;
  if (typeof document === "undefined") {
    const material = new THREE.SpriteMaterial({ color: "#fffdf2" });
    signMaterials.set(key, material);
    return material;
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf2"; ctx.fill();
  ctx.lineWidth = 12; ctx.strokeStyle = "#bd4840"; ctx.stroke();
  ctx.fillStyle = "#24363c"; ctx.textAlign = "center";
  ctx.textBaseline = "middle"; ctx.font = "bold 46px system-ui";
  ctx.fillText(String(key), 64, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  signMaterials.set(key, material);
  return material;
}
const sleeperMaterial = new THREE.MeshLambertMaterial({ color: "#987359" });
const railMaterial = new THREE.MeshLambertMaterial({
  color: "#6d7a7e", side: THREE.DoubleSide,
});
const groundMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true, side: THREE.DoubleSide, flatShading: true,
});
const waterMaterial = new THREE.MeshLambertMaterial({
  color: "#6cc9dc", transparent: true, opacity: 0.92, side: THREE.DoubleSide,
});
const lakeWaterMaterial = new THREE.MeshLambertMaterial({
  color: "#347f98", transparent: true, opacity: .95, side: THREE.DoubleSide,
});
const paint = (color: string) => new THREE.Color(color);
const sharedBeam = new THREE.BoxGeometry(1, 1, 1);
const bridgeStone = new THREE.MeshLambertMaterial({ color: "#a0a69c", flatShading: true });
const bridgeSteel = new THREE.MeshLambertMaterial({ color: "#5d7f82" });
const crossingRoad = new THREE.MeshLambertMaterial({
  color: "#8d7154", vertexColors: true, side: THREE.DoubleSide, flatShading: true,
});
const crossingPaint = new THREE.MeshLambertMaterial({ color: "#dfd5b6" });
const crossingWarning = new THREE.MeshLambertMaterial({ color: "#ba5147" });
const tunnelRock = new THREE.MeshLambertMaterial({ color: "#827e77", flatShading: true });
const tunnelInterior = new THREE.MeshLambertMaterial({ color: "#4e5559", side: THREE.DoubleSide, flatShading: true });
const portalStone = new THREE.MeshLambertMaterial({ color: "#c2b9a2", flatShading: true });
const tunnelLamp = new THREE.MeshBasicMaterial({ color: "#ffc581" });
const tunnelFloorMaterial = new THREE.MeshLambertMaterial({
  color: "#353737", side: THREE.DoubleSide,
});
const stationGlass = new THREE.MeshLambertMaterial({ color: "#6b9baa" });
const stationWood = new THREE.MeshLambertMaterial({ color: "#957b5e" });
const stationWall = new THREE.MeshLambertMaterial({ color: "#d9cec0" });
const stationRoof = new THREE.MeshLambertMaterial({ color: "#658285" });
const stationEdge = new THREE.MeshLambertMaterial({ color: "#e2d4b6" });
const darkCloth = new THREE.MeshLambertMaterial({ color: "#344b52" });
const fishingRodMaterial = new THREE.LineBasicMaterial({ color: "#594b3d" });
const passengerClothes = [
  "#b76f55", "#6d8fb0", "#d4a761", "#9a6c9b", "#668d71",
].map(color => new THREE.MeshLambertMaterial({ color }));
const skinTone = new THREE.MeshLambertMaterial({ color: "#ba9074" });
const boatBrown = new THREE.MeshLambertMaterial({ color: "#8b5b3b" });
const floatingLeaf = new THREE.MeshLambertMaterial({
  color: "#7eaa55", side: THREE.DoubleSide,
});
const peopleHead = new THREE.SphereGeometry(.24, 8, 6);
const boatLeafShape = new THREE.PlaneGeometry(.7, .32);
boatLeafShape.rotateX(-Math.PI / 2);
const stationSignCache = new Map<number, THREE.SpriteMaterial>();
function stationSignMaterial(id: number): THREE.SpriteMaterial {
  const cached = stationSignCache.get(id);
  if (cached) return cached;
  if (typeof document === "undefined") {
    const material = new THREE.SpriteMaterial({ color: "#fff4cd" });
    stationSignCache.set(id, material);
    return material;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#223c43"; context.fillRect(0, 0, 512, 128);
    context.strokeStyle = "#e9d79d"; context.lineWidth = 6;
    context.strokeRect(6, 6, 500, 116);
    context.fillStyle = "#fff4cd";
    context.textAlign = "center"; context.textBaseline = "middle";
    context.font = "bold 48px sans-serif";
    context.fillText(["CEDAR HALT", "RIVER CROSS", "HIGH MEADOW"][id % 3], 256, 67);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  stationSignCache.set(id, material);
  return material;
}
const soilColor = paint("#ad8f6f");
const alpineRock = paint("#747a7e");
const alpineSnow = paint("#e9f0ec");
const landmarkMaterials: Record<Biome, THREE.MeshLambertMaterial> = {
  highlands: new THREE.MeshLambertMaterial({ color: "#dcaf66", flatShading: true }),
  cherry: new THREE.MeshLambertMaterial({ color: "#e3a0bd", flatShading: true }),
  lakeside: new THREE.MeshLambertMaterial({ color: "#8bbecb", flatShading: true }),
};

const biomeGrass: Record<Biome, THREE.Color> = {
  highlands: paint("#93c77b"),
  cherry: paint("#b7cf92"),
  lakeside: paint("#91c49b"),
};

export class WorldStream {
  private readonly chunks = new Map<number, Chunk>();
  private readonly landscape: Landscape;
  private densityScale = 1;
  private viewScale = 1;
  private origin = new THREE.Vector3();
  private originDistance = Number.NaN;
  biomeName = BIOME_NAMES.highlands;

  constructor(
    readonly scene: THREE.Scene,
    readonly rail: RailPath,
  ) { this.landscape = new Landscape(rail); }

  /** Animate only streamed wildlife, with no retained objects off-screen. */
  animateWildlife(seconds: number): void {
    for (const chunk of this.chunks.values()) {
      for (const creature of chunk.wildlife) {
        const data = creature.userData;
        const wave = seconds * (data.speed as number) + (data.phase as number);
        creature.position.y = (data.baseY as number) + Math.sin(wave * 2) *
          (data.flying ? 1.4 : .075);
        if (data.flying) {
          creature.position.x = (data.baseX as number) + Math.cos(wave) * 7;
          creature.position.z = (data.baseZ as number) + Math.sin(wave) * 5;
          creature.rotation.y = (data.angle as number) + wave * .14;
        } else {
          creature.rotation.y = (data.angle as number) + Math.sin(wave) * .14;
        }
      }
    }
  }

  setDensity(scale: number): void {
    const value = THREE.MathUtils.clamp(scale, 0.45, 1.2);
    if (value === this.densityScale) return;
    this.densityScale = value;
    this.clear();
  }

  setViewScale(value: number): void {
    this.viewScale = THREE.MathUtils.clamp(value, .58, 1.3);
  }

  get originPoint(): THREE.Vector3 {
    return this.origin;
  }

  terrainHeight(s: number, offset: number): number {
    return this.landscape.height(s, offset);
  }

  update(distance: number, speed = 0, cameraDistance?: number): void {
    const focusDistance = cameraDistance ?? distance;
    const rebased = Math.floor(focusDistance / 2500) * 2500;
    if (rebased !== this.originDistance) {
      this.originDistance = rebased;
      this.origin = this.rail.point(rebased);
      for (const chunk of this.chunks.values()) {
        chunk.group.position.copy(chunk.center).sub(this.origin);
      }
    }

    const current = Math.floor(focusDistance / CHUNK_LENGTH);
    const behind = Math.max(2, Math.round((cameraDistance !== undefined ? 5 : speed < -0.2 ? 6 : 5) * this.viewScale));
    const ahead = Math.max(2, Math.round((cameraDistance !== undefined ? 5 : speed < -0.2 ? 3 : 6) * this.viewScale));
    const desired = new Set<number>();
    for (let index = current - behind; index <= current + ahead; index++) {
      desired.add(index);
      if (!this.chunks.has(index)) this.createChunk(index);
    }
    for (const [index, chunk] of this.chunks) {
      if (desired.has(index)) continue;
      this.scene.remove(chunk.group);
      for (const geometry of chunk.geometries) geometry.dispose();
      for (const instance of chunk.instances) instance.dispose();
      this.chunks.delete(index);
    }
    this.biomeName = BIOME_NAMES[biomeAt(distance)];
  }

  clear(): void {
    for (const chunk of this.chunks.values()) {
      this.scene.remove(chunk.group);
      for (const geometry of chunk.geometries) geometry.dispose();
      for (const instance of chunk.instances) instance.dispose();
    }
    this.chunks.clear();
  }

  private createChunk(index: number): void {
    const start = index * CHUNK_LENGTH;
    const end = start + CHUNK_LENGTH;
    const mid = (start + end) / 2;
    const center = this.rail.point(mid);
    const group = new THREE.Group();
    const chunk: Chunk = { group, center, geometries: [], instances: [], wildlife: [] };
    group.position.copy(center).sub(this.origin);

    this.createTerrain(chunk, start, end);
    this.createFarTerrain(chunk, start, end);
    this.createRail(chunk, start, end);
    this.createCrossing(chunk, start, end);
    this.createInfrastructure(chunk, start, end);
    this.createTunnel(chunk, start, end);
    this.createTunnelOverburden(chunk, start, end);
    this.createLandmarks(chunk, start, end);
    this.createRiver(chunk, start, end);
    this.createStation(chunk, start, end);
    populateLandscape({ chunk, rail: this.rail, landscape: this.landscape },
      index, start, end, this.densityScale);
    if (villageRegion(this.rail.seed, index)) {
      populateVillage({ chunk, rail: this.rail, landscape: this.landscape }, index, mid);
    }
    chunk.wildlife.push(...populateWildlife(
      { chunk, rail: this.rail, landscape: this.landscape }, index, start, end,
      this.densityScale));
    const lake = this.landscape.nearestLake(mid);
    if (lake && lake.s >= start && lake.s < end) this.createLake(chunk, lake);
    const reservoir = this.landscape.underwaterLake(mid);
    if (reservoir && reservoir.s >= start && reservoir.s < end) this.createLake(chunk, reservoir);

    this.scene.add(group);
    this.chunks.set(index, chunk);
  }

  private local(chunk: Chunk, s: number, offset = 0): THREE.Vector3 {
    return this.rail.point(s)
      .addScaledVector(this.rail.side(s), offset)
      .sub(chunk.center);
  }

  private createTerrain(chunk: Chunk, start: number, end: number): void {
    // Higher scene quality increases near-field relief without changing the
    // deterministic terrain function or cracking chunk seams.
    const rows = this.densityScale <= 0.55 ? 26 : this.densityScale >= 1.1 ? 44 : 36;
    const columns = rows;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let row = 0; row <= rows; row++) {
      const s = start + row / rows * (end - start);
      const biome = biomeBlend(s);
      const base = biomeGrass[biome.from].clone()
        .lerp(biomeGrass[biome.to], biome.blend);
      for (let col = 0; col <= columns; col++) {
        // Pack terrain vertices near the rail to resolve excavated tunnel walls.
        const t = col / columns * 2 - 1;
        const offset = Math.sign(t) * Math.pow(Math.abs(t), 1.35) * 190;
        const point = this.local(chunk, s, offset);
        point.y = this.terrainHeight(s, offset) - chunk.center.y;
        positions.push(point.x, point.y, point.z);
        const variation = 0.76 + this.landscape.tint(s, offset) * 0.38;
        const altitude = Math.max(0, point.y + chunk.center.y - this.rail.point(s).y);
        const slope = Math.abs(this.terrainHeight(s, offset + 4) -
          this.terrainHeight(s, offset - 4)) / 8;
        const bareSoil = THREE.MathUtils.clamp((slope - .12) * 1.15, 0, .48);
        const rock = THREE.MathUtils.clamp((altitude - 19) / 58 +
          (slope - .35) * .72, 0, .91);
        const snow = THREE.MathUtils.smoothstep(
          altitude + (this.landscape.tint(s, offset) - .5) * 24, 74, 120);
        const color = base.clone().multiplyScalar(variation)
          .lerp(soilColor, bareSoil)
          .lerp(alpineRock, rock)
          .lerp(alpineSnow, snow);
        colors.push(color.r, color.g, color.b);
        if (row < rows && col < columns) {
          const a = row * (columns + 1) + col;
          const b = a + columns + 1;
          const centerOffset = Math.sign((col + .5) / columns * 2 - 1) *
            Math.pow(Math.abs((col + .5) / columns * 2 - 1), 1.35) * 190;
          const centerS = start + (row + .5) / rows * (end - start);
          // A real cutout, not bright green ground inside the tunnel bore.
          // The overburden is the only mountain surface over the bore. Mask
          // this entire patch from the lower near terrain to prevent z-fighting.
          if (this.rail.featureAt(centerS) !== "tunnel" ||
              this.rail.featureStrength(centerS) < .13 ||
              Math.abs(centerOffset) > 59) {
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",
      new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color",
      new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    chunk.group.add(new THREE.Mesh(geometry, groundMaterial));
    chunk.geometries.push(geometry);
  }

  /**
   * Low-resolution foreground-to-horizon relief. Each strip overlaps the
   * high-detail corridor to hide T-junctions and is culled with its chunk.
   * Geometry stays bounded even after a very long forward/reverse journey.
   */
  private createFarTerrain(chunk: Chunk, start: number, end: number): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const rows = 34, columns = 30;
    for (const direction of [-1, 1]) {
      const baseIndex = positions.length / 3;
      for (let row = 0; row <= rows; row++) {
        const s = start + (end - start) * row / rows;
        const transition = biomeBlend(s);
        const ground = biomeGrass[transition.from].clone()
          .lerp(biomeGrass[transition.to], transition.blend);
        for (let col = 0; col <= columns; col++) {
          const offset = direction * (185 + Math.pow(col / columns, 1.25) * 1015);
          const p = this.local(chunk, s, offset);
          const altitude = this.landscape.height(s, offset);
          p.y = altitude - chunk.center.y - 0.14;
          positions.push(p.x, p.y, p.z);
          const relief = altitude - this.rail.point(s).y;
          const slope = Math.abs(this.landscape.height(s, offset + 11) -
            this.landscape.height(s, offset - 11)) / 22;
          const rockiness = THREE.MathUtils.clamp((relief - 24) / 72 +
            (slope - .36) * .48, 0, .95);
          const snow = THREE.MathUtils.smoothstep(
            relief + (this.landscape.tint(s, offset) - .5) * 28, 77, 131);
          const color = ground.clone().multiplyScalar(.82 +
              this.landscape.tint(s, offset) * .13)
            .lerp(alpineRock, rockiness)
            .lerp(alpineSnow, snow);
          colors.push(color.r, color.g, color.b);
          if (row < rows && col < columns) {
            const a = baseIndex + row * (columns + 1) + col;
            const b = a + columns + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    chunk.group.add(new THREE.Mesh(geometry, groundMaterial));
    chunk.geometries.push(geometry);
  }

  private createRiver(chunk: Chunk, start: number, end: number): void {
    const sector = Math.round(((start + end) / 2 - 750) / 1550);
    const crossing = sector * 1550 + 750;
    if (crossing < start || crossing >= end || !this.landscape.river(crossing, 0)) return;
    const waterPositions: number[] = [], waterIndices: number[] = [];
    const bankPositions: number[] = [], bankColors: number[] = [], bankIndices: number[] = [];
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      // Visible stream meanders through the whole valley. Recess its surface
      // inside a terrain-sampled riverbed rather than stretching a floating slab.
      const offset = -680 + 1360 * i / steps;
      const channel = this.landscape.river(crossing, offset);
      if (!channel) continue;
      const halfWidth = channel.halfWidth * (1 -
        .96 * THREE.MathUtils.smoothstep(Math.abs(offset), 540, 680));
      for (const side of [-1, 1]) {
        const at = this.local(chunk, channel.centerS + side * halfWidth * .69, offset);
        at.y = channel.waterY - chunk.center.y - .3;
        waterPositions.push(at.x, at.y, at.z);
        const edge = this.local(chunk, channel.centerS + side * halfWidth * 1.8, offset);
        // Fold banks down to the water and blend their outer lip into the
        // surrounding terrain; mesh faces remain contiguous along the stream.
        edge.y = this.landscape.height(channel.centerS +
          side * halfWidth * 1.8, offset) - chunk.center.y + .18;
        const inner = this.local(chunk, channel.centerS +
          side * halfWidth * .69, offset);
        inner.y = channel.waterY - chunk.center.y - .3;
        for (const point of [inner, edge]) {
          bankPositions.push(point.x, point.y, point.z);
          const tint = .83 + Math.sin(offset * .13 + side) * .06;
          bankColors.push(tint, tint * .83, tint * .66);
        }
      }
      if (i < steps) {
        const a = i * 2;
        waterIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        const b = i * 4;
        bankIndices.push(b, b + 1, b + 4, b + 1, b + 5, b + 4,
          b + 2, b + 6, b + 3, b + 3, b + 6, b + 7);
      }
    }
    const waterGeometry = new THREE.BufferGeometry();
    waterGeometry.setAttribute("position", new THREE.Float32BufferAttribute(waterPositions, 3));
    waterGeometry.setIndex(waterIndices);
    waterGeometry.computeVertexNormals();
    const river = new THREE.Mesh(waterGeometry, waterMaterial);
    river.name = "recessed-river";
    chunk.group.add(river);
    chunk.geometries.push(waterGeometry);
    const bankGeometry = new THREE.BufferGeometry();
    bankGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bankPositions, 3));
    bankGeometry.setAttribute("color", new THREE.Float32BufferAttribute(bankColors, 3));
    bankGeometry.setIndex(bankIndices);
    bankGeometry.computeVertexNormals();
    const banks = new THREE.Mesh(bankGeometry, crossingRoad);
    banks.name = "riverbank-soil";
    chunk.group.add(banks);
    chunk.geometries.push(bankGeometry);
  }

  private createRail(chunk: Chunk, start: number, end: number): void {
    const steps = 80;
    // A rail cross-section: base foot, thin vertical web, broad head.
    // Sweep it along the spline instead of laying a flat painted strip.
    const crossSection: Array<[number, number]> = [
      [-.22, .09], [.22, .09], [.07, .145], [.07, .29],
      [.142, .29], [.142, .38], [-.142, .38], [-.142, .29],
      [-.07, .29], [-.07, .145],
    ];
    const vertices: number[] = [], indices: number[] = [];
    for (const lane of [-1.2, 1.2]) {
      const base = vertices.length / 3;
      for (let i = 0; i <= steps; i++) {
        const s = start + i / steps * (end - start);
        for (const [offset, y] of crossSection) {
          const at = this.local(chunk, s, lane + offset);
          at.y += y;
          vertices.push(at.x, at.y, at.z);
        }
      }
      for (let i = 0; i < steps; i++) {
        for (let edge = 0; edge < crossSection.length; edge++) {
          const next = (edge + 1) % crossSection.length;
          const a = base + i * crossSection.length + edge;
          const b = base + (i + 1) * crossSection.length + edge;
          indices.push(a, b, base + i * crossSection.length + next,
            b, base + (i + 1) * crossSection.length + next,
            base + i * crossSection.length + next);
        }
      }
    }
    const railGeometry = new THREE.BufferGeometry();
    railGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    railGeometry.setIndex(indices);
    railGeometry.computeVertexNormals();
    const profileMesh = new THREE.Mesh(railGeometry, railMaterial);
    profileMesh.name = "rail-profile";
    chunk.group.add(profileMesh);
    chunk.geometries.push(railGeometry);

    // Ballast has irregular sloped shoulders and a gravel-like shaded surface.
    // Its vertices join exactly at consecutive chunk boundaries.
    const ballastOffsets = [-4.6, -3.95, -3.15, -.5, .5, 3.15, 3.95, 4.6];
    const ballastPositions: number[] = [], ballastColors: number[] = [], ballastIndices: number[] = [];
    const gravelTones = ["#aaa99e", "#86877f", "#bbb4a7", "#8f9088"];
    for (let i = 0; i <= steps; i++) {
      const s = start + i / steps * (end - start);
      for (let j = 0; j < ballastOffsets.length; j++) {
        const at = this.local(chunk, s, ballastOffsets[j]);
        at.y += j === 0 || j === ballastOffsets.length - 1 ? -.46 :
          j === 1 || j === ballastOffsets.length - 2 ? -.23 : .015;
        ballastPositions.push(at.x, at.y, at.z);
        const tone = new THREE.Color(gravelTones[Math.floor(
          ((Math.sin(s * .37 + j * 17) + 1) * .5) * gravelTones.length) % gravelTones.length]);
        ballastColors.push(tone.r, tone.g, tone.b);
        if (i < steps && j < ballastOffsets.length - 1) {
          const a = i * ballastOffsets.length + j;
          const b = a + ballastOffsets.length;
          ballastIndices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const ballast = new THREE.BufferGeometry();
    ballast.setAttribute("position", new THREE.Float32BufferAttribute(ballastPositions, 3));
    ballast.setAttribute("color", new THREE.Float32BufferAttribute(ballastColors, 3));
    ballast.setIndex(ballastIndices);
    ballast.computeVertexNormals();
    const ballastMesh = new THREE.Mesh(ballast, groundMaterial);
    ballastMesh.name = "gravel-ballast";
    chunk.group.add(ballastMesh);
    chunk.geometries.push(ballast);

    const count = Math.floor((end - start) / 2.65);
    const sleepers = new THREE.InstancedMesh(sleeperGeometry, sleeperMaterial, count);
    const fasteners = new THREE.InstancedMesh(
      fastenerGeometry, railMaterial, count * 4);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const fastenerScale = new THREE.Vector3(1, 1, 1);
    let fastenerCount = 0;
    for (let i = 0; i < count; i++) {
      const s = start + (i + .5) * (end - start) / count;
      const tangent = this.rail.tangent(s);
      rotation.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), Math.atan2(-tangent.x, -tangent.z));
      position.copy(this.local(chunk, s));
      position.y += .075;
      matrix.compose(position, rotation, scale);
      sleepers.setMatrixAt(i, matrix);
      for (const lane of [-1.2, 1.2]) {
        for (const side of [-.24, .24]) {
          const at = this.local(chunk, s, lane + side);
          at.y += .18;
          matrix.compose(at, rotation, fastenerScale);
          fasteners.setMatrixAt(fastenerCount++, matrix);
        }
      }
    }
    sleepers.name = "sleepers";
    fasteners.name = "fasteners";
    sleepers.instanceMatrix.needsUpdate = true;
    fasteners.instanceMatrix.needsUpdate = true;
    chunk.group.add(sleepers, fasteners);
    chunk.instances.push(sleepers, fasteners);

    // Sparse speed markers, an intentional readable human-scale rail detail.
    const speedMarker = Math.ceil(start / 520) * 520 + 36;
    if (speedMarker >= start && speedMarker < end) {
      const at = this.local(chunk, speedMarker, -5.5);
      const pole = new THREE.Mesh(sharedBeam, bridgeSteel);
      pole.position.copy(at);
      pole.position.y += 1.55;
      pole.scale.set(.15, 2.8, .15);
      chunk.group.add(pole);
      const sign = new THREE.Sprite(speedSignMaterial(
        this.rail.speedLimitAt(speedMarker)));
      sign.position.copy(at);
      sign.position.y += 2.95;
      sign.scale.set(2.0, 2.0, 1);
      sign.name = "readable-speed-sign";
      chunk.group.add(sign);
    }
  }

  /** Seed-independent railway crossings that tie future roads to the track. */
  private createCrossing(chunk: Chunk, start: number, end: number): void {
    const s = Math.ceil((start - 340) / 2700) * 2700 + 340;
    if (s < start || s >= end || this.rail.featureAt(s) !== "open") return;
    const root = new THREE.Group();
    root.name = "rail-crossing";
    const tangent = this.rail.tangent(s);
    const angle = Math.atan2(-tangent.x, -tangent.z);
    // A continuous terrain-conforming dirt ribbon; no elevated concrete slabs.
    const roadVertices: number[] = [], roadColors: number[] = [], roadIndices: number[] = [];
    for (let i = 0; i <= 36; i++) {
      const offset = -36 + i * 2;
      for (const side of [-1, 1]) {
        const roadS = s + side * 3.4;
        const at = this.local(chunk, roadS, offset);
        at.y = this.terrainHeight(roadS, offset) - chunk.center.y + .10;
        if (Math.abs(offset) < 4.5) at.y = this.rail.point(roadS).y - chunk.center.y - .43;
        roadVertices.push(at.x, at.y, at.z);
        const tone = .88 + ((i * 13 + (side + 1) * 7) % 9) * .013;
        roadColors.push(tone, tone * .94, tone * .83);
      }
      if (i < 36) {
        const a = i * 2;
        roadIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(roadVertices, 3));
    roadGeometry.setAttribute("color", new THREE.Float32BufferAttribute(roadColors, 3));
    roadGeometry.setIndex(roadIndices);
    roadGeometry.computeVertexNormals();
    const road = new THREE.Mesh(roadGeometry, crossingRoad);
    road.name = "mud-crossing";
    root.add(road);
    chunk.geometries.push(roadGeometry);
    for (const side of [-1, 1]) {
      const position = this.local(chunk, s - 6, side * 8.5);
      position.y = this.terrainHeight(s - 6, side * 8.5) - chunk.center.y;
      const post = new THREE.Mesh(sharedBeam, bridgeSteel);
      post.position.copy(position);
      post.position.y += 1.65;
      post.scale.set(.19, 3.3, .19);
      root.add(post);
      const warning = new THREE.Mesh(sharedBeam, crossingWarning);
      warning.position.copy(position);
      warning.position.y += 3.1;
      warning.scale.set(1.3, .75, .19);
      warning.rotation.y = angle;
      root.add(warning);
      const flash = new THREE.Mesh(sharedBeam, crossingPaint);
      flash.position.copy(position);
      flash.position.y += 3.15;
      flash.scale.set(.75, .13, .22);
      root.add(flash);
      for (let i = 0; i < 4; i++) {
        const barrier = new THREE.Mesh(sharedBeam, i % 2 ? crossingPaint : crossingWarning);
        barrier.position.copy(this.local(chunk, s - 4, side * (8.8 + i * 1.1)));
        barrier.position.y = position.y + 2.3;
        barrier.scale.set(.12, .2, 1.2);
        barrier.rotation.y = angle;
        root.add(barrier);
      }
    }
    chunk.group.add(root);
  }

  private createInfrastructure(chunk: Chunk, start: number, end: number): void {
    // Reusable simple meshes create bridges, tunnel ribs and retaining walls
    // only where the seeded rail corridor actually needs them.
    const put = (s: number, offset: number, y: number,
      width: number, height: number, length: number,
      finish: THREE.Material): void => {
      const piece = new THREE.Mesh(sharedBeam, finish);
      piece.position.copy(this.local(chunk, s, offset));
      piece.position.y = y - chunk.center.y;
      piece.rotation.y = Math.atan2(-this.rail.tangent(s).x,
        -this.rail.tangent(s).z);
      piece.scale.set(width, height, length);
      chunk.group.add(piece);
    };
    for (let s = start + 9; s < end; s += 18) {
      const feature = this.rail.featureAt(s);
      const strength = this.rail.featureStrength(s);
      if (strength < .18 || feature === "open") continue;
      const railY = this.rail.point(s).y;
      if (feature === "bridge") {
        const bed = this.terrainHeight(s, 0);
        const pierHeight = Math.max(2, railY - bed);
        put(s, 0, railY - pierHeight / 2 - .35, 1.45, pierHeight, 1.6, bridgeStone);
        put(s, 0, railY - .50, 6.6, .52, 18.7, bridgeSteel);
        for (const side of [-3.1, 3.1]) {
          put(s, side, railY + .55, .16, 1.8, 18.6, bridgeSteel);
        }
      }
      // Cuttings use excavated earth and rock banks, never boxy wall strips.
    }
  }

  /** A single arched bore in the mountain, not a row of roofed boxes. */
  private createTunnel(chunk: Chunk, start: number, end: number): void {
    const r = 5.2;
    const contour: Array<[number, number]> = [[-r, .20], [-r, 2.55]];
    for (let j = 1; j < 12; j++) {
      const angle = Math.PI - Math.PI * j / 12;
      contour.push([Math.cos(angle) * r, 2.55 + Math.sin(angle) * r]);
    }
    contour.push([r, 2.55], [r, .20]);
    const positions: number[] = [];
    const indices: number[] = [];
    const floorPositions: number[] = [], floorIndices: number[] = [];
    const steps = 60;
    const putContour = (s: number): void => {
      for (const [offset, h] of contour) {
        const p = this.local(chunk, s, offset);
        p.y += h;
        positions.push(p.x, p.y, p.z);
      }
    };
    for (let i = 0; i < steps; i++) {
      const s0 = start + i / steps * (end - start);
      const s1 = start + (i + 1) / steps * (end - start);
      if (this.rail.featureAt((s0 + s1) / 2) !== "tunnel" ||
          Math.min(this.rail.featureStrength(s0), this.rail.featureStrength(s1)) < .13) continue;
      const base = positions.length / 3;
      putContour(s0);
      putContour(s1);
      for (let j = 0; j < contour.length - 1; j++) {
        const a = base + j;
        const b = base + contour.length + j;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
      const floorBase = floorPositions.length / 3;
      for (const slice of [s0, s1]) {
        for (const flank of [-5.18, 5.18]) {
          const p = this.local(chunk, slice, flank);
          p.y += .035;
          floorPositions.push(p.x, p.y, p.z);
        }
      }
      floorIndices.push(floorBase, floorBase + 2, floorBase + 1,
        floorBase + 1, floorBase + 2, floorBase + 3);
    }
    if (floorPositions.length) {
      const floor = new THREE.BufferGeometry();
      floor.setAttribute("position", new THREE.Float32BufferAttribute(floorPositions, 3));
      floor.setIndex(floorIndices);
      floor.computeVertexNormals();
      const bed = new THREE.Mesh(floor, tunnelFloorMaterial);
      bed.name = "dark-excavated-tunnel-floor";
      chunk.group.add(bed);
      chunk.geometries.push(floor);
    }
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const bore = new THREE.Mesh(geometry, tunnelInterior);
      bore.name = "tunnel-arch";
      chunk.group.add(bore);
      chunk.geometries.push(geometry);
    }

    // Only the actual mouth gets an arched masonry ring; there is no exposed
    // "second door" immediately behind it. Portals face along the track.
    for (let s = start + 2; s < end; s += 4) {
      const inside = this.rail.featureAt(s) === "tunnel" &&
        this.rail.featureStrength(s) > .13;
      const wasInside = this.rail.featureAt(s - 4) === "tunnel" &&
        this.rail.featureStrength(s - 4) > .13;
      if (inside === wasInside) continue;
      const outline = contour.map(([offset, h]) => {
        const p = this.local(chunk, s, offset);
        p.y += h;
        return p;
      });
      const curve = new THREE.CatmullRomCurve3(outline);
      const geometry = new THREE.TubeGeometry(curve, 22, .43, 6, false);
      const mouth = new THREE.Mesh(geometry, portalStone);
      mouth.name = "tunnel-portal";
      chunk.group.add(mouth);
      chunk.geometries.push(geometry);

      // The surrounding terrain is cut to the bore; don't bridge the mouth
      // with triangulated annulus strips, which self-intersect on slopes.
    }
    for (let s = start + 12; s < end; s += 30) {
      if (this.rail.featureAt(s) !== "tunnel" || this.rail.featureStrength(s) < .75) continue;
      for (const offset of [-4.8, 4.8]) {
        const lamp = new THREE.Mesh(sharedBeam, tunnelLamp);
        lamp.position.copy(this.local(chunk, s, offset));
        lamp.position.y += 3.3;
        lamp.scale.set(.15, .22, .5);
        chunk.group.add(lamp);
      }
    }
  }

  /**
   * An upper hillside layer seals the tunnel roof into the surrounding rock.
   * The lower corridor is excavated by Landscape.height; this outer layer
   * joins both banks so the arch is no longer an exposed floating tube.
   */
  private createTunnelOverburden(chunk: Chunk, start: number, end: number): void {
    // A single solid mountain cap covers the excavated bore. The matching
    // near-ground triangles are absent beneath it, so two almost identical
    // surfaces can never compete in the depth buffer.
    const offsets = [-78, -63, -50, -35, -23, -13, -8, 0, 8, 13, 23, 35, 50, 63, 78];
    const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
    const steps = 56;
    for (let i = 0; i < steps; i++) {
      const s0 = start + (end - start) * i / steps;
      const s1 = start + (end - start) * (i + 1) / steps;
      const mid = (s0 + s1) / 2;
      if (this.rail.featureAt(mid) !== "tunnel" ||
          this.rail.featureStrength(mid) < .13) continue;
      const base = vertices.length / 3;
      for (const s of [s0, s1]) {
        const mass = this.landscape.tunnelMountainStrength(s);
        for (const offset of offsets) {
          const away = Math.abs(offset);
          const shoulder = 1 - THREE.MathUtils.smoothstep(away, 8, 65);
          const naturalY = this.landscape.height(s, offset);
          const ridgeY = this.rail.point(s).y + 16.8 * mass +
            2.8 * Math.sin(s / 98) + 1.4 * Math.sin(s / 37 + offset * .08);
          // Lift at least 26 cm clear of coincident underlying terrain.
          const coverY = naturalY + .26 +
            Math.max(0, ridgeY - naturalY) * shoulder;
          const p = this.local(chunk, s, offset);
          p.y = coverY - chunk.center.y;
          vertices.push(p.x, p.y, p.z);
          const altitude = coverY - this.rail.point(s).y;
          const rockiness = THREE.MathUtils.clamp((altitude - 9) / 24, 0, 1);
          const tint = new THREE.Color("#819779").lerp(
            new THREE.Color("#777c80"), rockiness);
          if (altitude > 43) tint.lerp(new THREE.Color("#e3e8e3"),
            THREE.MathUtils.smoothstep(altitude, 43, 76) * .38);
          tint.multiplyScalar(.91 + .07 * Math.sin(s * .09 + offset * .16));
          colors.push(tint.r, tint.g, tint.b);
        }
      }
      for (let j = 0; j < offsets.length - 1; j++) {
        const a = base + j, b = a + offsets.length;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    if (!vertices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const hill = new THREE.Mesh(geometry, groundMaterial);
    hill.name = "tunnel-hillside";
    chunk.group.add(hill);
    chunk.geometries.push(geometry);
  }

  private createLandmarks(chunk: Chunk, start: number, end: number): void {
    // Every optional activity location has a visible, biome-tinted trackside
    // landmark. A fixed seed and absolute distance preserve it on revisits.
    const first = Math.floor(start / 1550) - 1;
    const last = Math.floor(end / 1550) + 1;
    for (let index = first; index <= last; index++) {
      if (index <= 0) continue;
      const s = index * 1550 + 280;
      if (s < start || s >= end) continue;
      const offset = (this.rail.seed ^ index) & 1 ? 24 : -24;
      const foot = this.local(chunk, s, offset);
      foot.y = this.landscape.height(s, offset) - chunk.center.y;
      const root = new THREE.Group();
      root.position.copy(foot);
      root.rotation.y = Math.atan2(-this.rail.tangent(s).x, -this.rail.tangent(s).z);
      const base = new THREE.Mesh(sharedBeam, bridgeStone);
      base.scale.set(5.5, 1.3, 5.5);
      base.position.y = .65;
      root.add(base);
      const tower = new THREE.Mesh(sharedBeam, tunnelRock);
      tower.scale.set(2, 10.5, 2);
      tower.position.y = 6.55;
      root.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.8, 6),
        landmarkMaterials[biomeAt(s)]);
      cap.position.y = 14.1;
      root.add(cap);
      chunk.group.add(root);
      chunk.geometries.push(cap.geometry);
    }
  }

  private person(root: THREE.Group, x: number, y: number, z: number,
    colorIndex: number, sitting = false): void {
    const person = new THREE.Group();
    person.position.set(x, y, z);
    const torso = new THREE.Mesh(sharedBeam, passengerClothes[colorIndex % passengerClothes.length]);
    torso.scale.set(.48, sitting ? .92 : 1.15, .35);
    torso.position.y = sitting ? .96 : 1.5;
    person.add(torso);
    const head = new THREE.Mesh(peopleHead, skinTone);
    head.position.y = sitting ? 1.72 : 2.37;
    person.add(head);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(sharedBeam, darkCloth);
      leg.scale.set(.19, sitting ? .42 : .8, .20);
      leg.position.set(side * .17, sitting ? .38 : .42, sitting ? -.25 : 0);
      person.add(leg);
    }
    root.add(person);
  }

  private createStation(chunk: Chunk, start: number, end: number): void {
    const first = Math.floor((start - 125) / 3500);
    const last = Math.floor((end - 125) / 3500);
    for (let index = first; index <= last; index++) {
      const s = index * 3500 + 125;
      if (index < 0 || s < start || s >= end || this.rail.featureAt(s) !== "open") continue;
      const side = index % 2 ? -1 : 1;
      const station = new THREE.Group();
      const platformCenter = this.local(chunk, s, side * 7.4);
      const railY = this.rail.point(s).y - chunk.center.y;
      station.position.set(platformCenter.x, railY, platformCenter.z);
      station.rotation.y = Math.atan2(-this.rail.tangent(s).x, -this.rail.tangent(s).z);
      const style = Math.abs(index) % 3;
      const rural = style === 0, modern = style === 1;
      const platformLength = rural ? 78 : 106;
      const width = rural ? 6.8 : modern ? 9 : 8.4;
      const depth = rural ? 14 : 19;
      const wallHeight = rural ? 4.5 : modern ? 6.0 : 5.25;
      const buildingX = side * 8.15;
      const facadeX = buildingX - side * (width / 2 + .09);

      const block = (x: number, y: number, z: number,
        sx: number, sy: number, sz: number, material: THREE.Material): THREE.Mesh => {
        const mesh = new THREE.Mesh(sharedBeam, material);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        station.add(mesh);
        return mesh;
      };
      // Long, continuous passenger platform with painted warning line.
      block(0, .24, 0, rural ? 4.8 : 6.05, .48,
        platformLength, stationEdge);
      block(-side * 2.15, .495, 0, .17, .025,
        platformLength - 1.2, crossingWarning);
      for (const z of [-platformLength / 2 + 4, platformLength / 2 - 4]) {
        block(0, .35, z, rural ? 4.7 : 6, .3, .35, stationWood);
      }

      // A legible facade faces the rail. Doors and glazing are laid on the
      // *x face* of the hall, not at the far z end where nobody can see them.
      block(buildingX, wallHeight / 2 + .47, -11,
        width, wallHeight, depth, stationWall);
      block(buildingX, .27, -11, width + .9, .55, depth + .85, bridgeStone);
      block(facadeX - side * .04, 1.92, -11,
        .20, 3.0, 2.1, darkCloth).name = "station-door";
      block(facadeX - side * .2, 1.91, -11,
        .1, 2.74, 1.88, stationWood);
      block(facadeX - side * .33, 1.94, -10.3,
        .1, .12, .12, stationEdge);
      // Framed windows read clearly even when the exterior is unlit.
      for (const z of [-17.6, -4.6]) {
        block(facadeX - side * .04, 2.75, z,
          .20, 2.22, 2.85, stationWood);
        block(facadeX - side * .19, 2.75, z,
          .13, 1.95, 2.58, stationGlass).name = "station-window";
        block(facadeX - side * .28, 2.75, z,
          .12, 2.03, .11, stationEdge);
        block(facadeX - side * .29, 2.75, z,
          .12, .11, 2.65, stationEdge);
        block(facadeX - side * .09, 1.59, z,
          .36, .17, 3.2, bridgeStone);
      }
      if (modern) {
        // Flat steel-and-glass station with a broad upper light ribbon,
        // contrasting metal paneling and a sheltered ticket counter.
        block(buildingX, wallHeight + .60, -11,
          width + 1.2, .35, depth + 1.6, stationRoof);
        for (const z of [-19, -16.3, -13.6, -10.9, -8.2, -5.5, -3]) {
          block(facadeX - side * .12, 5.25, z,
            .14, .86, 2.26, stationGlass).name = "station-window";
          block(facadeX - side * .23, 5.25, z + 1.12,
            .11, .94, .10, stationWood);
        }
        for (const z of [-15.5, -6.5])
          block(facadeX - side * .21, 4.23, z, .10, .20, 2.7, stationRoof);
      } else {
        // Ridge-and-eave roof: timber country halt or older stone depot.
        const rise = rural ? 2.3 : 2.9;
        const half = Math.hypot(width / 2 + .75, rise) + .4;
        const tilt = Math.atan2(rise, width / 2 + .75);
        for (const flank of [-1, 1]) {
          const roof = block(buildingX + flank * width / 4,
            wallHeight + .46 + rise / 2, -11,
            half, .29, depth + 1.6, stationRoof);
          roof.rotation.z = -flank * tilt;
          for (const z of [-16, -12, -8, -4])
            block(buildingX + flank * width / 4,
              wallHeight + .47 + rise / 2 + .2, z,
              half, .035, .12, stationWood).rotation.z = -flank * tilt;
        }
        block(buildingX, wallHeight + .5 + rise, -11,
          .23, .23, depth + 1.7, stationWood);
        const gableShape = new THREE.Shape();
        gableShape.moveTo(-width / 2, wallHeight + .47);
        gableShape.lineTo(0, wallHeight + .47 + rise);
        gableShape.lineTo(width / 2, wallHeight + .47);
        gableShape.closePath();
        for (const z of [-11 - depth / 2 - .05, -11 + depth / 2 - .05]) {
          const geometry = new THREE.ExtrudeGeometry(gableShape,
            { depth: .10, bevelEnabled: false, steps: 1 });
          const gable = new THREE.Mesh(geometry, stationWall);
          gable.position.set(buildingX, 0, z);
          station.add(gable);
          chunk.geometries.push(geometry);
        }
        if (!rural) {
          // Heritage facade with decorative pilasters and a chimney.
          for (const z of [-20, -13.5, -7, -2])
            block(facadeX - side * .2, 3.0, z, .34, 5, .35, bridgeStone);
          block(buildingX + side * (width / 3), wallHeight + 2.5,
            -9, 1.2, 3.0, 1.0, bridgeStone);
        }
      }

      // Roofed waiting area. Posts line up with its canopy instead of
      // intersecting the hall; benches, timetable and luggage populate it.
      const canopyX = side * 1.0;
      const canopyY = modern ? 4.25 : 3.8;
      block(canopyX, canopyY, 14, 5.3, .24, 25, stationRoof).name = "station-canopy";
      for (const z of [3.5, 24.5]) {
        for (const x of [-1.05, 2.95]) {
          block(side * x, canopyY / 2 + .4, z,
            .22, canopyY - .8, .22, stationWood);
        }
      }
      for (const z of [-30, 4, 19, 33]) {
        block(side * .7, .98, z, 2.85, .22, .78, stationWood);
        block(side * .7, 1.47, z + .36, 2.85, .72, .16, stationWood);
        for (const x of [-1.0, 1.0])
          block(side * .7 + x, .67, z, .12, .73, .13, darkCloth);
      }
      const sign = new THREE.Sprite(stationSignMaterial(Math.abs(index)));
      sign.position.set(facadeX - side * .5, wallHeight + 1.5, -11);
      sign.scale.set(8.1, 1.9, 1);
      station.add(sign);

      const clockGeometry = new THREE.CylinderGeometry(.82, .82, .14, 16);
      const clock = new THREE.Mesh(clockGeometry, stationEdge);
      clock.rotation.z = Math.PI / 2;
      clock.position.set(facadeX - side * .37, wallHeight - .2, -11);
      station.add(clock);
      clock.name = "station-clock";
      chunk.geometries.push(clockGeometry);
      block(facadeX - side * .49, wallHeight -.16, -11,
        .06, .55, .065, darkCloth);
      block(facadeX - side * .50, wallHeight -.04, -10.80,
        .06, .065, .43, darkCloth);

      // Platform lamps, timetable boards, litter bins and low planters.
      for (const z of [-34, 0, 35]) {
        block(-side * 1.8, 2.65, z, .15, 4.5, .17, stationRoof);
        const lanternGeometry = new THREE.SphereGeometry(.41, 8, 6);
        const lantern = new THREE.Mesh(lanternGeometry, tunnelLamp);
        lantern.position.set(-side * 1.8, 5.0, z);
        station.add(lantern);
        chunk.geometries.push(lanternGeometry);
      }
      for (const z of [-27, 27]) {
        block(side * 1.2, .72, z, 2.2, .75, .9, stationWood);
        for (const x of [-.75, .75])
          block(side * 1.2 + x, 1.23, z, .7, .42, .7, stationGlass);
      }
      block(facadeX - side * .55, 2.2, 3,
        .14, 2.1, 1.4, stationRoof);
      for (let i = 0; i < 5; i++)
        block(side * (2.5 + i % 2 * .8), .74,
          8 + i * 1.3, .74, .7, .83, stationWood);
      for (let i = 0; i < (rural ? 9 : 17); i++) {
        const jitter = Math.floor((Math.sin(i * 57.2 + index * 2) + 1) * 19);
        const z = -platformLength / 2 + 6 +
          ((i * 31 + jitter) % Math.round(platformLength - 11));
        const x = side * (.2 + (i % 4) * .6);
        this.person(station, x, .50, z, i + index * 2, i % 6 === 0);
      }
      station.name = "populated-scenic-station";
      chunk.group.add(station);
    }
  }

  private createLake(chunk: Chunk, lake: ReturnType<Landscape["lake"]>): void {
    // River-space oval fits the shore carved by Landscape even on curved rails.
    const positions: number[] = [];
    const segments = 48;
    const center = this.local(chunk, lake.s, lake.offset);
    center.y = lake.waterY - chunk.center.y - .26;
    positions.push(center.x, center.y, center.z);
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI * 2;
      const p = this.local(chunk, lake.s + Math.cos(angle) * lake.lengthRadius * .91,
        lake.offset + Math.sin(angle) * lake.widthRadius * .91);
      p.y = lake.waterY - chunk.center.y - .26;
      positions.push(p.x, p.y, p.z);
    }
    const indices: number[] = [];
    for (let j = 1; j <= segments; j++) indices.push(0, j, j + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, lakeWaterMaterial);
    surface.name = "shoreline-lake";
    chunk.group.add(surface);
    chunk.geometries.push(geometry);

    // Floating leaves use a single instanced draw call with reproducible
    // positions, rather than hundreds of translucent alpha sprites.
    const leaves = new THREE.InstancedMesh(boatLeafShape, floatingLeaf, 38);
    const matrix = new THREE.Matrix4();
    const orientation = new THREE.Quaternion();
    for (let i = 0; i < 38; i++) {
      const angle = i * 2.399963 + this.rail.seed * .0001;
      const radius = Math.sqrt((i + .5) / 38) * .8;
      const leafS = lake.s + Math.cos(angle) * lake.lengthRadius * radius;
      const leafOffset = lake.offset + Math.sin(angle) * lake.widthRadius * radius;
      const pos = this.local(chunk, leafS, leafOffset);
      pos.y = lake.waterY - chunk.center.y - .22;
      orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      matrix.compose(pos, orientation,
        new THREE.Vector3(.65 + i % 3 * .16, 1, .7 + i % 2 * .22));
      leaves.setMatrixAt(i, matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
    leaves.computeBoundingSphere();
    leaves.name = "floating-lake-leaves";
    chunk.group.add(leaves);
    chunk.instances.push(leaves);

    // Rowboats carry seated passengers and oars; shoreline anglers enjoy
    // the water from solid ground. All detail is deterministic per lake.
    for (let i = 0; i < 3; i++) {
      const angle = .9 + i * 1.84;
      const boatS = lake.s + Math.cos(angle) * lake.lengthRadius * .44;
      const boatOffset = lake.offset + Math.sin(angle) * lake.widthRadius * .43;
      const boat = new THREE.Group();
      boat.position.copy(this.local(chunk, boatS, boatOffset));
      boat.position.y = lake.waterY - chunk.center.y - .1;
      boat.rotation.y = angle + Math.PI / 3;
      const hullGeometry = new THREE.SphereGeometry(2.5, 9, 6);
      const hull = new THREE.Mesh(hullGeometry, boatBrown);
      hull.scale.set(.55, .32, 1.15);
      hull.position.y = -.25;
      boat.add(hull);
      const seat = new THREE.Mesh(sharedBeam, stationWood);
      seat.scale.set(1.65, .16, 1.4);
      seat.position.y = .23;
      boat.add(seat);
      for (const side of [-1, 1]) {
        const oar = new THREE.Mesh(sharedBeam, stationWood);
        oar.scale.set(.08, .08, 3.4);
        oar.position.set(side * 1.47, .18, -.15);
        oar.rotation.y = side * .66;
        boat.add(oar);
      }
      this.person(boat, 0, .28, .15, i * 3, true);
      boat.name = "occupied-rowboat";
      chunk.group.add(boat);
      chunk.geometries.push(hullGeometry);
    }
    for (let i = 0; i < 4; i++) {
      const fishS = lake.s + (i - 1.5) * lake.lengthRadius * .31;
      const fishOffset = lake.offset +
        (i % 2 === 0 ? -1 : 1) * lake.widthRadius *
        Math.sqrt(Math.max(.06, 1 - Math.pow((fishS - lake.s) / lake.lengthRadius, 2))) * 1.12;
      const shore = this.local(chunk, fishS, fishOffset);
      shore.y = this.landscape.height(fishS, fishOffset) - chunk.center.y;
      this.person(chunk.group, shore.x, shore.y, shore.z, i + 2);
      // A short held fishing rod; no oversized line running across the lake.
      const bankDirection = Math.sign(lake.offset - fishOffset);
      const tip = this.local(chunk, fishS + 1.45,
        fishOffset + bankDirection * 1.5);
      tip.y = shore.y + 3.1;
      const rodGeometry = new THREE.BufferGeometry().setFromPoints([
        shore.clone().add(new THREE.Vector3(0, 1.9, 0)), tip,
      ]);
      const rod = new THREE.Line(rodGeometry, fishingRodMaterial);
      rod.name = "shoreline-fishing-rod";
      chunk.group.add(rod);
      chunk.geometries.push(rodGeometry);
    }
  }
}
