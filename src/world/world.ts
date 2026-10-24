import * as THREE from "three";
import { RailPath } from "../sim/rail";
import { Landscape } from "./landscape";
import { populateLandscape, populateVillage } from "./scenery";
import {
  BIOME_NAMES, CHUNK_LENGTH, biomeAt, biomeBlend,
  type Biome,
} from "../game/constants";

interface Chunk {
  group: THREE.Group;
  center: THREE.Vector3;
  geometries: THREE.BufferGeometry[];
  instances: THREE.InstancedMesh[];
}

const sleeperGeometry = new THREE.BoxGeometry(3.6, 0.2, 0.55);
const waterGeometry = new THREE.CircleGeometry(1, 28);
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
const tunnelRock = new THREE.MeshLambertMaterial({ color: "#827e77", flatShading: true });
const soilColor = paint("#ad8f6f");
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
    const chunk: Chunk = { group, center, geometries: [], instances: [] };
    group.position.copy(center).sub(this.origin);

    this.createTerrain(chunk, start, end);
    this.createFarTerrain(chunk, start, end);
    this.createRail(chunk, start, end);
    this.createInfrastructure(chunk, start, end);
    this.createLandmarks(chunk, start, end);
    this.createRiver(chunk, start, end);
    populateLandscape({ chunk, rail: this.rail, landscape: this.landscape },
      index, start, end, this.densityScale);
    if (((index % 12) + 12) % 12 === 7) {
      populateVillage({ chunk, rail: this.rail, landscape: this.landscape }, index, mid);
    }
    const lake = this.landscape.nearestLake(mid);
    if (lake && lake.s >= start && lake.s < end) this.createLake(chunk, lake);

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
        const offset = (col / columns - 0.5) * 380;
        const point = this.local(chunk, s, offset);
        point.y = this.terrainHeight(s, offset) - chunk.center.y;
        positions.push(point.x, point.y, point.z);
        const variation = 0.76 + this.landscape.tint(s, offset) * 0.38;
        const altitude = Math.max(0, point.y + chunk.center.y - this.rail.point(s).y);
        const slope = Math.abs(this.terrainHeight(s, offset + 4) -
          this.terrainHeight(s, offset - 4)) / 8;
        const bareSoil = THREE.MathUtils.clamp((slope - .12) * 1.15, 0, .48);
        const rock = THREE.MathUtils.clamp((altitude - 16) / 60 +
          (slope - .5) * .6, 0, .76);
        const color = base.clone().multiplyScalar(variation)
          .lerp(soilColor, bareSoil)
          .lerp(new THREE.Color("#92968d"), rock);
        colors.push(color.r, color.g, color.b);
        if (row < rows && col < columns) {
          const a = row * (columns + 1) + col;
          const b = a + columns + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
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
    const rows = 22, columns = 14;
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
          const rockiness = THREE.MathUtils.clamp((altitude - this.rail.point(s).y - 20) / 160, 0, .8);
          const color = ground.clone().multiplyScalar(.83)
            .lerp(new THREE.Color("#89928b"), rockiness);
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
    const positions: number[] = [];
    const indices: number[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const offset = -195 + 390 * i / steps;
      const channel = this.landscape.river(crossing, offset);
      if (!channel) continue;
      for (const side of [-1, 1]) {
        const p = this.local(chunk,
          channel.centerS + side * channel.halfWidth, offset);
        p.y = channel.waterY - chunk.center.y - .11;
        positions.push(p.x, p.y, p.z);
      }
      if (i < steps) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    chunk.group.add(new THREE.Mesh(geometry, waterMaterial));
    chunk.geometries.push(geometry);
  }

  private createRail(chunk: Chunk, start: number, end: number): void {
    const positions: number[] = [];
    const indices: number[] = [];
    const steps = 80;
    const railWidth = 0.16;
    for (const lane of [-1.2, 1.2]) {
      const base = positions.length / 3;
      for (let i = 0; i <= steps; i++) {
        const s = start + i / steps * (end - start);
        const left = this.local(chunk, s, lane - railWidth / 2);
        const right = this.local(chunk, s, lane + railWidth / 2);
        left.y += 0.23;
        right.y += 0.23;
        positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
        if (i < steps) {
          const a = base + 2 * i;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",
      new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    chunk.group.add(new THREE.Mesh(geometry, railMaterial));
    chunk.geometries.push(geometry);

    const count = Math.floor((end - start) / 3);
    const sleepers = new THREE.InstancedMesh(
      sleeperGeometry, sleeperMaterial, count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const s = start + i * 3;
      position.copy(this.local(chunk, s));
      position.y += 0.07;
      const tangent = this.rail.tangent(s);
      rotation.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), Math.atan2(-tangent.x, -tangent.z));
      matrix.compose(position, rotation, scale);
      sleepers.setMatrixAt(i, matrix);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    chunk.group.add(sleepers);
    chunk.instances.push(sleepers);
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
      } else if (feature === "tunnel") {
        for (const side of [-4.0, 4.0]) {
          put(s, side, railY + 3.1, 1.7, 7.5, 18.5, tunnelRock);
        }
        put(s, 0, railY + 6.55, 9.5, 1.5, 18.5, tunnelRock);
      } else if (feature === "cutting") {
        for (const side of [-7.2, 7.2]) {
          put(s, side, railY + 1.7, 1.25, 4.1, 18.5, tunnelRock);
        }
      }
    }
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

  private createLake(
    chunk: Chunk, lake: ReturnType<Landscape["lake"]>,
  ): void {
    const location = this.local(chunk, lake.s, lake.offset);
    location.y = lake.waterY - chunk.center.y - .05;
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(lake.widthRadius, lake.lengthRadius, 1);
    water.position.copy(location);
    chunk.group.add(water);
  }
}
