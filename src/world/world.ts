import * as THREE from "three";
import { RailPath } from "../sim/rail";
import { Landscape } from "./landscape";
import {
  BIOME_NAMES, CHUNK_LENGTH, FOLIAGE, biomeAt, biomeBlend, hash,
  type Biome,
} from "../game/constants";

interface Chunk {
  group: THREE.Group;
  center: THREE.Vector3;
  geometries: THREE.BufferGeometry[];
  instances: THREE.InstancedMesh[];
}

const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.37, 2.8, 5);
const crownGeometry = new THREE.DodecahedronGeometry(1.75, 0);
const pineGeometry = new THREE.ConeGeometry(1.8, 3.6, 6);
const blossomGeometry = new THREE.IcosahedronGeometry(1.8, 0);
const sleeperGeometry = new THREE.BoxGeometry(3.6, 0.2, 0.55);
const houseGeometry = new THREE.BoxGeometry(1, 1, 1);
const roofGeometry = new THREE.ConeGeometry(1, 1, 4);
const waterGeometry = new THREE.CircleGeometry(1, 28);
const trunkMaterial = new THREE.MeshLambertMaterial({ color: "#8c644a" });
const crownMaterial = new THREE.MeshLambertMaterial({
  color: "#ffffff", flatShading: true,
});
const sleeperMaterial = new THREE.MeshLambertMaterial({ color: "#987359" });
const railMaterial = new THREE.MeshLambertMaterial({
  color: "#6d7a7e", side: THREE.DoubleSide,
});
const groundMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true, side: THREE.DoubleSide, flatShading: true,
});
const houseWalls = ["#f8dfa8", "#d5e4bd", "#f4c5b8", "#f7e6cd"];
const houseRoofs = ["#a85e51", "#886f7a", "#71877f", "#bd8a5e"];
const villageMaterials = houseWalls.map((c) => new THREE.MeshLambertMaterial({ color: c }));
const roofMaterials = houseRoofs.map((c) => new THREE.MeshLambertMaterial({ color: c }));
const waterMaterial = new THREE.MeshLambertMaterial({
  color: "#6cc9dc", transparent: true, opacity: 0.92, side: THREE.DoubleSide,
});
const paint = (color: string) => new THREE.Color(color);

const biomeGrass: Record<Biome, THREE.Color> = {
  highlands: paint("#93c77b"),
  cherry: paint("#b7cf92"),
  lakeside: paint("#91c49b"),
};

export class WorldStream {
  private readonly chunks = new Map<number, Chunk>();
  private readonly landscape: Landscape;
  private origin = new THREE.Vector3();
  private originDistance = Number.NaN;
  biomeName = BIOME_NAMES.highlands;

  constructor(
    readonly scene: THREE.Scene,
    readonly rail: RailPath,
  ) { this.landscape = new Landscape(rail); }

  get originPoint(): THREE.Vector3 {
    return this.origin;
  }

  terrainHeight(s: number, offset: number): number {
    return this.landscape.height(s, offset);
  }

  update(distance: number, speed = 0): void {
    const rebased = Math.floor(distance / 2500) * 2500;
    if (rebased !== this.originDistance) {
      this.originDistance = rebased;
      this.origin = this.rail.point(rebased);
      for (const chunk of this.chunks.values()) {
        chunk.group.position.copy(chunk.center).sub(this.origin);
      }
    }

    const current = Math.floor(distance / CHUNK_LENGTH);
    const behind = speed < -0.2 ? 6 : 3;
    const ahead = speed < -0.2 ? 3 : 6;
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
    this.createRail(chunk, start, end);
    this.createVegetation(chunk, index, start, end);
    if (index % 16 === 7) this.createVillage(chunk, index, mid);
    if (biomeAt(mid) === "lakeside" && index % 5 === 1) {
      this.createLake(chunk, mid);
    }

    this.scene.add(group);
    this.chunks.set(index, chunk);
  }

  private local(chunk: Chunk, s: number, offset = 0): THREE.Vector3 {
    return this.rail.point(s)
      .addScaledVector(this.rail.side(s), offset)
      .sub(chunk.center);
  }

  private createTerrain(chunk: Chunk, start: number, end: number): void {
    const rows = 32;
    const columns = 32;
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
        const rock = THREE.MathUtils.clamp((altitude - 18) / 65, 0, 0.65);
        const color = base.clone().multiplyScalar(variation)
          .lerp(new THREE.Color("#a2a68c"), rock);
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

  private createVegetation(
    chunk: Chunk, index: number, start: number, end: number,
  ): void {
    const count = 46;
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
    const crowns = [
      new THREE.InstancedMesh(crownGeometry, crownMaterial, count),
      new THREE.InstancedMesh(pineGeometry, crownMaterial, count),
      new THREE.InstancedMesh(blossomGeometry, crownMaterial, count),
    ];
    const typeCounts = [0, 0, 0];
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const s = start + 5 + hash(this.rail.seed, index, i * 4) *
        (end - start - 10);
      const offset = (hash(this.rail.seed, index, i * 4 + 1) > 0.5 ? 1 : -1) *
        (10 + hash(this.rail.seed, index, i * 4 + 2) * 95);
      const size = 0.7 + hash(this.rail.seed, index, i * 4 + 3) * 1.15;
      const base = this.local(chunk, s, offset);
      base.y = this.terrainHeight(s, offset) - chunk.center.y;
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0),
        hash(this.rail.seed + 4, index, i) * Math.PI * 2);

      position.copy(base);
      position.y += 1.4 * size;
      scale.set(size, size, size);
      matrix.compose(position, rotation, scale);
      trunks.setMatrixAt(i, matrix);

      position.copy(base);
      position.y += 3.35 * size;
      scale.set(size, size * (0.8 + hash(this.rail.seed + 3, index, i) * 0.4), size);
      matrix.compose(position, rotation, scale);
      const treeBiome = biomeAt(s);
      const speciesRoll = hash(this.rail.seed + 18, index, i);
      const species = treeBiome === "cherry" && speciesRoll < 0.65
        ? 2 : speciesRoll < 0.27 ? 1 : 0;
      const instanceIndex = typeCounts[species]++;
      crowns[species].setMatrixAt(instanceIndex, matrix);
      const foliage = FOLIAGE[treeBiome];
      const colorIndex = Math.floor(hash(this.rail.seed + 9, index, i) * foliage.length);
      crowns[species].setColorAt(instanceIndex, new THREE.Color(foliage[colorIndex]));
    }
    trunks.instanceMatrix.needsUpdate = true;
    chunk.group.add(trunks);
    chunk.instances.push(trunks);
    crowns.forEach((mesh, species) => {
      mesh.count = typeCounts[species];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      chunk.group.add(mesh);
      chunk.instances.push(mesh);
    });
  }

  private createVillage(chunk: Chunk, index: number, mid: number): void {
    const biome = biomeAt(mid);
    const count = 5 + Math.floor(hash(this.rail.seed, index, 8) * 5);
    const side = hash(this.rail.seed, index, 99) > 0.5 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const s = mid + (hash(this.rail.seed, index, i * 3) - 0.5) * 155;
      const offset = side * (22 + hash(this.rail.seed, index, i * 3 + 1) * 54);
      const size = 0.85 + hash(this.rail.seed, index, i * 3 + 2) * 0.7;
      const base = this.local(chunk, s, offset);
      base.y = this.terrainHeight(s, offset) - chunk.center.y;
      const house = new THREE.Group();
      house.position.copy(base);
      const colorIndex = (i + (biome === "cherry" ? 2 : 0)) % villageMaterials.length;
      const walls = new THREE.Mesh(houseGeometry, villageMaterials[colorIndex]);
      walls.scale.set(5 * size, 3.5 * size, 4.5 * size);
      walls.position.y = 1.75 * size;
      const roof = new THREE.Mesh(roofGeometry, roofMaterials[colorIndex]);
      roof.scale.set(3.9 * size, 2.4 * size, 3.6 * size);
      roof.position.y = 4.7 * size;
      roof.rotation.y = Math.PI / 4;
      if (biome === "cherry") {
        // Lower, wider roofs distinguish the blossom hamlets.
        roof.scale.set(4.6 * size, 1.6 * size, 4.2 * size);
      } else if (biome === "lakeside") {
        // Broad roofs and small porch decks for waterfront cottages.
        roof.scale.set(4.2 * size, 1.4 * size, 3.8 * size);
        const deck = new THREE.Mesh(houseGeometry, roofMaterials[2]);
        deck.scale.set(6.5 * size, 0.18 * size, 2.7 * size);
        deck.position.set(0, 0.16 * size, -3.0 * size);
        house.add(deck);
      } else if (i % 3 === 0) {
        // A modest barn-like silhouette among the highland cottages.
        walls.scale.set(6.2 * size, 3.6 * size, 5.1 * size);
        roof.scale.set(4.6 * size, 2.7 * size, 4.2 * size);
      }
      house.add(walls, roof);
      chunk.group.add(house);
    }
  }

  private createLake(chunk: Chunk, mid: number): void {
    const index = Math.floor(mid / CHUNK_LENGTH);
    const lake = this.landscape.lake(index);
    const location = this.local(chunk, lake.s, lake.offset);
    location.y = lake.waterY - chunk.center.y;
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(76, 58, 1);
    water.position.copy(location);
    chunk.group.add(water);
  }
}
