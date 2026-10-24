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
          if (this.rail.featureAt(centerS) !== "tunnel" ||
              this.rail.featureStrength(centerS) < .13 ||
              Math.abs(centerOffset) > 4.55) {
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
      for (const side of [-1, 1]) {
        const at = this.local(chunk, channel.centerS + side * channel.halfWidth * .69, offset);
        at.y = channel.waterY - chunk.center.y - .3;
        waterPositions.push(at.x, at.y, at.z);
        const edge = this.local(chunk, channel.centerS + side * channel.halfWidth * 1.8, offset);
        // Fold banks down to the water and blend their outer lip into the
        // surrounding terrain; mesh faces remain contiguous along the stream.
        edge.y = this.landscape.height(channel.centerS +
          side * channel.halfWidth * 1.8, offset) - chunk.center.y + .18;
        const inner = this.local(chunk, channel.centerS +
          side * channel.halfWidth * .72, offset);
        inner.y = channel.waterY - chunk.center.y - .95;
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
      const bed = new THREE.Mesh(floor, new THREE.MeshLambertMaterial({
        color: "#353737", side: THREE.DoubleSide,
      }));
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
    const offsets = [-53, -32, -20, -11, 0, 11, 20, 32, 53];
    const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const s0 = start + (end - start) * i / steps;
      const s1 = start + (end - start) * (i + 1) / steps;
      const mid = (s0 + s1) / 2;
      if (this.rail.featureAt(mid) !== "tunnel" ||
        this.rail.featureStrength(mid) < .13) continue;
      const base = vertices.length / 3;
      for (const s of [s0, s1]) {
        const strength = this.rail.featureStrength(s);
        const coverage = strength >= .13 ? 1 : THREE.MathUtils.smoothstep(strength, .07, .13);
        for (const offset of offsets) {
          const away = Math.abs(offset);
          const shoulder = 1 - THREE.MathUtils.smoothstep(away, 7, 53);
          const naturalY = this.landscape.height(s, offset);
          const ridgeY = this.rail.point(s).y + 14.5 + 2.3 * Math.sin(s / 82);
          const coverY = naturalY + Math.max(0, ridgeY - naturalY) *
            coverage * shoulder;
          const p = this.local(chunk, s, offset);
          p.y = coverY - chunk.center.y;
          vertices.push(p.x, p.y, p.z);
          const tint = new THREE.Color(away < 14 ? "#98988c" : "#7f9875");
          tint.multiplyScalar(.91 + .08 * Math.sin(s * .07 + offset * .18));
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
    chunk.group.add(new THREE.Mesh(geometry, waterMaterial));
    chunk.geometries.push(geometry);
  }
}
