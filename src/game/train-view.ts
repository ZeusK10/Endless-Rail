import * as THREE from "three";
import { RailPath } from "../sim/rail";
import type { TrainType } from "../sim/train";
import { TRAIN_CAR_COUNT, TRAIN_CAR_SPACING } from "./constants";

// Shared geometries and materials avoid hundreds of individual GPU buffers.
const cube = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const wheelShape = new THREE.CylinderGeometry(0.56, 0.56, 0.23, 12);
const hubShape = new THREE.CylinderGeometry(0.20, 0.20, 0.245, 10);
const roofShape = (() => {
  const outline = new THREE.Shape();
  outline.moveTo(-1.55, 0);
  outline.lineTo(-1.5, 0.21);
  outline.lineTo(-1.06, 0.43);
  outline.lineTo(0, 0.52);
  outline.lineTo(1.06, 0.43);
  outline.lineTo(1.5, 0.21);
  outline.lineTo(1.55, 0);
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline, {
    depth: 7.0, bevelEnabled: false, steps: 1, curveSegments: 1,
  });
})();

const material = (color: string, metalness = 0) => new THREE.MeshStandardMaterial({
  color, metalness, roughness: metalness ? 0.56 : 0.8, flatShading: true,
});
const scarlet = material("#b85248");
const burgundy = material("#8c3b3c");
const teal = material("#387c8a");
const blue = material("#496b85");
const cream = material("#f3dec1");
const stripe = material("#e5b363");
const graphite = material("#344451", 0.36);
const dark = material("#222e35", 0.34);
const bogieColor = material("#404b50", 0.42);
const metal = material("#818e8b", 0.72);
const brass = material("#d4ae65", 0.56);
const tread = material("#788284");
const rubber = material("#383f42");
const glass = new THREE.MeshStandardMaterial({
  color: "#8fced8", metalness: 0.08, roughness: 0.24,
  emissive: "#27545e", emissiveIntensity: 0.17,
});
const litGlass = new THREE.MeshStandardMaterial({
  color: "#ffe8ae", roughness: 0.35,
  emissive: "#ffdc83", emissiveIntensity: 1.4,
});

function box(
  root: THREE.Group, size: [number, number, number],
  position: [number, number, number], finish: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(cube, finish);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  root.add(mesh);
  return mesh;
}

function rod(
  root: THREE.Group, a: THREE.Vector3, b: THREE.Vector3,
  radius: number, finish: THREE.Material,
): void {
  const beam = new THREE.Mesh(cylinder, finish);
  beam.position.copy(a).add(b).multiplyScalar(0.5);
  const direction = b.clone().sub(a);
  beam.scale.set(radius, direction.length(), radius);
  beam.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), direction.normalize());
  root.add(beam);
}

function rail(
  root: THREE.Group, x: number, y: number,
  zStart: number, zEnd: number, finish: THREE.Material,
): void {
  rod(root, new THREE.Vector3(x, y, zStart),
    new THREE.Vector3(x, y, zEnd), 0.046, finish);
}

function wheelGroup(
  root: THREE.Group, x: number, z: number,
  wheelSpinners: THREE.Group[],
): void {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.73, z);
  const wheel = new THREE.Mesh(wheelShape, dark);
  wheel.rotation.z = Math.PI / 2;
  pivot.add(wheel);
  const hub = new THREE.Mesh(hubShape, metal);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = x > 0 ? 0.12 : -0.12;
  pivot.add(hub);
  root.add(pivot);
  wheelSpinners.push(pivot);
}

function bogies(
  root: THREE.Group, zCenters: number[],
  wheelSpinners: THREE.Group[],
): void {
  for (const z of zCenters) {
    box(root, [2.6, 0.48, 2.0], [0, 0.94, z], bogieColor);
    for (const x of [-1.43, 1.43]) {
      box(root, [0.17, 0.28, 1.7], [x, 1.05, z], metal);
      for (const dz of [-0.65, 0.65]) {
        wheelGroup(root, x, z + dz, wheelSpinners);
      }
      // Springs and bearing caps, deliberately simple low-poly components.
      for (const dz of [-0.28, 0.28]) {
        box(root, [0.17, 0.35, 0.2], [x * 0.94, 1.1, z + dz], tread);
      }
    }
  }
}

function detailsAtEnds(group: THREE.Group, length: number): void {
  for (const z of [-length / 2 - 0.18, length / 2 + 0.18]) {
    box(group, [2.7, 0.20, 0.21], [0, 0.96, z], graphite);
    for (const x of [-1.08, 1.08]) {
      box(group, [0.40, 0.25, 0.34], [x, 1.0, z * 1.04], rubber);
    }
    box(group, [0.85, 0.31, 0.7], [0, 0.88, z * 1.09], dark);
  }
}

interface Car {
  group: THREE.Group;
  wheels: THREE.Group[];
  lights?: THREE.Mesh[];
  headlamp?: THREE.PointLight;
  exhaust?: THREE.Group[];
}

function locomotive(): Car {
  const group = new THREE.Group();
  const wheels: THREE.Group[] = [];
  const lights: THREE.Mesh[] = [];
  const exhaust: THREE.Group[] = [];

  // Distinct hood and rear driving cab, on a stepped underframe.
  box(group, [3.22, 0.37, 8.3], [0, 1.36, 0], graphite);
  box(group, [3.12, 0.24, 8.55], [0, 1.18, 0], metal);
  box(group, [2.62, 2.28, 4.75], [0, 2.65, -1.42], teal);
  box(group, [2.84, 2.44, 2.52], [0, 2.91, 2.55], cream);
  box(group, [3.07, 0.28, 2.84], [0, 4.27, 2.55], graphite);
  box(group, [2.84, 0.13, 4.85], [0, 3.87, -1.42], blue);

  // Nose cowl and yellow visibility band.
  box(group, [2.8, 1.03, 0.59], [0, 2.42, -3.92], scarlet);
  box(group, [2.86, 0.21, 0.60], [0, 2.77, -3.95], stripe);
  box(group, [3.05, 0.23, 4.6], [0, 1.74, -1.45], burgundy);
  box(group, [0.28, 0.4, 2.38], [1.54, 1.6, 2.55], graphite);
  box(group, [0.28, 0.4, 2.38], [-1.54, 1.6, 2.55], graphite);

  // Grilles and accessible engine-panel latches on both sides.
  for (const flank of [-1, 1]) {
    const x = flank * 1.335;
    for (let i = 0; i < 9; i++) {
      box(group, [0.056, 0.095, 0.35],
        [x, 3.15 - (i % 2) * 0.02, -3.36 + i * 0.48], dark);
      box(group, [0.061, 0.80, 0.05],
        [x, 2.86, -3.29 + i * 0.48], metal);
    }
    for (const z of [-3.45, -2.20, -0.95, 0.25]) {
      box(group, [0.05, 0.72, 0.62], [x, 2.22, z], graphite);
      box(group, [0.063, 0.056, 0.27], [x, 2.2, z], brass);
    }
    // Continuous side walkways with railing posts.
    const railX = flank * 1.62;
    rail(group, railX, 2.52, -4.1, 1.37, metal);
    for (const z of [-4.08, -2.3, -0.6, 1.35]) {
      rod(group, new THREE.Vector3(railX, 1.55, z),
        new THREE.Vector3(railX, 2.52, z), 0.047, metal);
    }

    // Cab side windows and framed door.
    box(group, [0.075, 1.02, 1.13],
      [flank * 1.46, 3.31, 2.86], glass);
    box(group, [0.09, 0.08, 1.21],
      [flank * 1.51, 3.88, 2.86], graphite);
    box(group, [0.09, 1.77, 0.08],
      [flank * 1.51, 3.12, 3.45], graphite);
    box(group, [0.06, 0.20, 0.12],
      [flank * 1.52, 2.55, 2.06], brass);
    box(group, [0.35, 0.95, 0.75],
      [flank * 1.66, 1.22, 3.23], metal);
  }
  // Two front windshields, a center divider and simple wipers.
  for (const x of [-0.70, 0.70]) {
    box(group, [1.26, 1.04, 0.08],
      [x, 3.34, 1.25], glass);
    const wiper = box(group, [0.79, 0.035, 0.09],
      [x, 3.0, 1.17], graphite);
    wiper.rotation.z = x < 0 ? 0.25 : -0.25;
  }
  box(group, [0.09, 1.10, 0.11], [0, 3.33, 1.19], graphite);

  // Exhaust chimneys and cylindrical fans on the engine roof.
  for (const z of [-2.64, -0.97]) {
    const stack = new THREE.Mesh(cylinder, graphite);
    stack.scale.set(0.28, 0.72, 0.28);
    stack.position.set(0.75, 4.32, z);
    group.add(stack);
    const smoke = new THREE.Group();
    smoke.position.set(0.75, 4.72, z);
    exhaust.push(smoke);
    group.add(smoke);
  }
  box(group, [1.12, 0.11, 1.12], [-0.66, 4.02, -2.85], graphite);
  for (let i = 0; i < 3; i++) {
    box(group, [0.12, 0.07, 0.85],
      [-1.1 + i * 0.43, 4.1, -2.85], metal);
  }

  // Front and rear headlamps and low-mounted marker lights.
  for (const x of [-1.0, 1.0]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.16, 10), litGlass);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(x, 2.38, -4.22);
    group.add(lamp);
    lights.push(lamp);
    box(group, [0.12, 0.14, 0.15], [x, 1.72, -4.24], brass);
  }
  const highLamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.12, 12), litGlass);
  highLamp.rotation.x = Math.PI / 2;
  highLamp.position.set(0, 4.02, 1.21);
  group.add(highLamp);
  lights.push(highLamp);
  const headlamp = new THREE.PointLight("#ffe6b4", 4.2, 17, 2);
  headlamp.position.set(0, 2.4, -4.2);
  group.add(headlamp);

  // Front pilot, handhold and air hoses.
  box(group, [3.20, 0.45, 0.45], [0, 0.86, -4.20], scarlet);
  box(group, [3.17, 0.24, 0.14], [0, 0.52, -4.38], graphite);
  for (const x of [-0.65, 0.65]) {
    rod(group, new THREE.Vector3(x, 1.05, -4.27),
      new THREE.Vector3(x, 0.42, -4.50), 0.065, rubber);
  }
  detailsAtEnds(group, 8.25);
  bogies(group, [-2.53, 2.53], wheels);
  return { group, wheels, lights, headlamp, exhaust };
}

function electricLocomotive(): Car {
  const group = new THREE.Group();
  const wheels: THREE.Group[] = [];
  const lights: THREE.Mesh[] = [];
  box(group, [3.2, .42, 8.4], [0, 1.4, 0], graphite);
  box(group, [3.12, 2.55, 7.9], [0, 2.93, 0], blue);
  box(group, [3.2, .36, 8.2], [0, 2.25, 0], stripe);
  box(group, [3.16, .22, 8.0], [0, 4.26, 0], graphite);
  for (const side of [-1, 1]) {
    box(group, [.07, 1.03, 1.42], [side * 1.6, 3.28, -3.1], glass);
    box(group, [.07, 1.03, 1.42], [side * 1.6, 3.28, 3.1], glass);
    for (let j = 0; j < 6; j++) {
      box(group, [.06, .62, .17], [side * 1.61, 3.02, -1.8 + j * .72], metal);
    }
  }
  // Twin raised pantographs distinguish the electric train in silhouette.
  for (const z of [-1.95, 1.8]) {
    for (const x of [-.65, .65]) {
      rod(group, new THREE.Vector3(x, 4.35, z - .65),
        new THREE.Vector3(-x, 5.32, z + .65), .075, metal);
    }
    box(group, [2.25, .12, .18], [0, 5.34, z + .65], dark);
  }
  for (const x of [-.86, .86]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.24, 8, 6), litGlass);
    lamp.position.set(x, 2.3, -4.06);
    group.add(lamp);
    lights.push(lamp);
  }
  const headlamp = new THREE.PointLight("#fff0c2", 4.2, 18, 2);
  headlamp.position.set(0, 2.5, -4.2);
  group.add(headlamp);
  bogies(group, [-2.42, 2.42], wheels);
  detailsAtEnds(group, 8.0);
  return { group, wheels, lights, headlamp, exhaust: [] };
}

function steamLocomotive(): Car {
  const group = new THREE.Group();
  const wheels: THREE.Group[] = [];
  const lights: THREE.Mesh[] = [];
  const exhaust: THREE.Group[] = [];
  box(group, [3.05, .34, 8.4], [0, 1.25, 0], graphite);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 5.65, 12), dark);
  boiler.rotation.x = Math.PI / 2;
  boiler.position.set(0, 2.78, -1.1);
  group.add(boiler);
  box(group, [2.95, 2.6, 2.55], [0, 2.83, 2.65], burgundy);
  box(group, [3.17, .20, 2.75], [0, 4.29, 2.65], graphite);
  for (const x of [-.73, .73]) {
    box(group, [1.18, 1.05, .09], [x, 3.30, 1.32], glass);
  }
  for (const z of [-3.2, -1.4, .45]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.17, .08, 5, 12), brass);
    ring.position.set(0, 2.78, z);
    group.add(ring);
  }
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(.48, .29, 1.3, 9), dark);
  funnel.position.set(0, 4.26, -2.92);
  group.add(funnel);
  const puff = new THREE.Group();
  puff.position.set(0, 5.02, -2.92);
  group.add(puff);
  exhaust.push(puff);
  box(group, [2.9, .7, 1.25], [0, 1.47, -3.67], scarlet);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.31, 10, 6), litGlass);
  lamp.position.set(0, 3.18, -4.1);
  group.add(lamp);
  lights.push(lamp);
  const headlamp = new THREE.PointLight("#ffddac", 4.2, 19, 2);
  headlamp.position.set(0, 3.2, -4.2);
  group.add(headlamp);
  bogies(group, [-2.4, 2.4], wheels);
  return { group, wheels, lights, headlamp, exhaust };
}

function carriage(index: number): Car {
  const group = new THREE.Group();
  const wheels: THREE.Group[] = [];
  const color = index % 2 ? scarlet : blue;
  const accent = index % 2 ? cream : stripe;

  box(group, [3.13, 0.32, 7.7], [0, 1.39, 0], graphite);
  box(group, [3.02, 2.28, 7.32], [0, 2.70, 0], color);
  box(group, [3.06, 0.13, 7.5], [0, 2.02, 0], accent);
  box(group, [3.06, 0.16, 7.5], [0, 3.79, 0], cream);
  const roof = new THREE.Mesh(roofShape, graphite);
  roof.position.set(0, 3.79, -3.5);
  roof.scale.set(1, 1, 1.05);
  group.add(roof);

  for (const flank of [-1, 1]) {
    for (const z of [-2.48, -0.83, 0.83, 2.48]) {
      box(group, [0.09, 1.11, 1.37],
        [flank * 1.55, 2.92, z], cream);
      box(group, [0.097, 0.91, 1.17],
        [flank * 1.61, 2.95, z], glass);
      box(group, [0.10, 0.055, 1.19],
        [flank * 1.67, 2.95, z], graphite);
    }
    // Entry doors and handrails on both ends.
    for (const z of [-3.24, 3.24]) {
      box(group, [0.08, 1.55, 0.43],
        [flank * 1.55, 2.58, z], dark);
      box(group, [0.1, 0.58, 0.27],
        [flank * 1.61, 3.03, z], glass);
      box(group, [0.15, 0.16, 0.42],
        [flank * 1.70, 1.62, z], metal);
    }
    rail(group, flank * 1.55, 1.51, -3.6, 3.6, metal);
  }

  // Vestibule bellows, end doors, two roof ventilators and couplers.
  for (const z of [-3.83, 3.83]) {
    box(group, [1.85, 2.4, 0.22], [0, 2.72, z], rubber);
    box(group, [1.16, 1.9, 0.08],
      [0, 2.64, z + Math.sign(z) * 0.14], cream);
    box(group, [0.72, 0.53, 0.12],
      [0, 3.14, z + Math.sign(z) * 0.21], glass);
  }
  for (const z of [-1.75, 1.75]) {
    box(group, [1.2, 0.28, 0.76], [0, 4.37, z], metal);
    box(group, [0.94, 0.07, 0.50], [0, 4.55, z], dark);
  }
  detailsAtEnds(group, 7.7);
  bogies(group, [-2.47, 2.47], wheels);
  return { group, wheels };
}


interface SmokePuff {
  position: THREE.Vector3; // absolute world position; survives origin rebasing
  velocity: THREE.Vector3;
  age: number;
  duration: number;
  radius: number;
  steam: boolean;
}

/**
 * A single batched, bounded smoke plume follows the locomotive stacks.
 * Particles are emitted in world space so they trail behind a moving engine,
 * never drifting along with the locomotive or snapping on origin rebase.
 */
class ExhaustParticles {
  private static readonly MAX = 80;
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: SmokePuff[] = Array.from(
    { length: ExhaustParticles.MAX }, () => ({
      position: new THREE.Vector3(), velocity: new THREE.Vector3(),
      age: Infinity, duration: 1, radius: 1, steam: false,
    }));
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly sourcePosition = new THREE.Vector3();
  private readonly defaultRotation = new THREE.Quaternion();
  private readonly size = new THREE.Vector3();
  private seed = 0x2f9e4c71;
  private cursor = 0;
  private spawnAmount = 0;
  private emissionIndex = 0;
  private density = 1;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const finish = new THREE.MeshBasicMaterial({
      color: "#ffffff", transparent: true, opacity: 0.29,
      depthWrite: false, flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(geometry, finish, ExhaustParticles.MAX);
    this.mesh.name = "locomotive-exhaust";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  setQuality(value: number): void {
    this.density = THREE.MathUtils.clamp(value, 0.4, 1);
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private spawn(
    stack: THREE.Group, origin: THREE.Vector3, type: TrainType,
    speed: number, tangent: THREE.Vector3,
  ): void {
    const puff = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % ExhaustParticles.MAX;
    puff.steam = type === "steam";
    stack.getWorldPosition(this.sourcePosition);
    puff.position.copy(this.sourcePosition).add(origin);
    puff.position.x += (this.random() - .5) * .16;
    puff.position.z += (this.random() - .5) * .16;
    // Rising, expanding exhaust with a gentle slipstream opposite travel.
    const wind = THREE.MathUtils.clamp(speed * .035, -1.2, 1.2);
    puff.velocity.set(
      (this.random() - .5) * .85 - tangent.x * wind,
      (puff.steam ? 1.42 : .82) + this.random() * .68,
      (this.random() - .5) * .85 - tangent.z * wind,
    );
    puff.age = 0;
    puff.duration = (puff.steam ? 3.6 : 2.5) * (.84 + this.random() * .4);
    puff.radius = (puff.steam ? .48 : .31) * (.8 + this.random() * .65);
  }

  update(
    dt: number, origin: THREE.Vector3, emitters: THREE.Group[],
    type: TrainType, throttle: number, speed: number,
    tangent: THREE.Vector3, active: boolean,
  ): void {
    const step = active ? THREE.MathUtils.clamp(dt, 0, .05) : 0;
    if (step > 0 && emitters.length && type !== "electric") {
      const rate = type === "steam"
        ? 7 + throttle * 14 + Math.min(5, Math.abs(speed) * .3)
        : 1.7 + throttle * 8;
      // Fractional accumulator stays bounded after a hidden tab or long frame.
      this.spawnAmount = Math.min(2, this.spawnAmount + rate * this.density * step);
      while (this.spawnAmount >= 1) {
        this.spawnAmount -= 1;
        const emitter = emitters[this.emissionIndex++ % emitters.length];
        this.spawn(emitter, origin, type, speed, tangent);
      }
    } else if (type === "electric") {
      this.spawnAmount = 0;
    }

    let visible = 0;
    for (const puff of this.pool) {
      if (puff.age >= puff.duration) continue;
      puff.age += step;
      if (puff.age >= puff.duration) continue;
      puff.position.addScaledVector(puff.velocity, step);
      const progress = puff.age / puff.duration;
      const fade = Math.min(1, (1 - progress) * 4);
      const radius = puff.radius * (0.63 + 2 * progress) * fade;
      this.size.setScalar(radius);
      this.position.copy(puff.position).sub(origin);
      this.matrix.compose(this.position, this.defaultRotation, this.size);
      this.mesh.setMatrixAt(visible, this.matrix);
      if (puff.steam) {
        this.color.setRGB(.74 + progress * .23, .76 + progress * .22,
          .74 + progress * .24);
      } else {
        this.color.setRGB(.31 + progress * .42, .35 + progress * .43,
          .35 + progress * .44);
      }
      this.mesh.setColorAt(visible, this.color);
      visible++;
    }
    this.mesh.count = visible;
    if (visible) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

export class TrainView {
  private readonly groups: THREE.Group[] = [];
  private readonly wheels: THREE.Group[] = [];
  private headlights: THREE.Mesh[];
  private headlamp: THREE.PointLight;
  private exhaust: THREE.Group[];
  private readonly locomotives: Record<TrainType, Car>;
  private activeType: TrainType = "diesel";
  lights = true;
  private wheelRotation = 0;
  private derailBlend = 0;
  private readonly smoke: ExhaustParticles;

  constructor(private readonly scene: THREE.Scene, private readonly rail: RailPath) {
    this.smoke = new ExhaustParticles(scene);
    const loco = locomotive();
    this.locomotives = {
      diesel: loco, electric: electricLocomotive(), steam: steamLocomotive(),
    };
    this.groups.push(loco.group);
    this.wheels.push(...loco.wheels);
    this.headlights = loco.lights ?? [];
    this.headlamp = loco.headlamp!;
    this.exhaust = loco.exhaust ?? [];
    scene.add(loco.group);

    for (let i = 0; i < TRAIN_CAR_COUNT; i++) {
      const car = carriage(i);
      this.groups.push(car.group);
      this.wheels.push(...car.wheels);
      scene.add(car.group);
    }
  }

  setTrainType(type: TrainType): void {
    if (this.activeType === type) return;
    const previous = this.locomotives[this.activeType];
    const next = this.locomotives[type];
    this.scene.remove(previous.group);
    this.groups[0] = next.group;
    this.wheels.splice(0, previous.wheels.length, ...next.wheels);
    this.headlights = next.lights ?? [];
    this.headlamp = next.headlamp!;
    this.exhaust = next.exhaust ?? [];
    this.headlights.forEach(mesh => { mesh.visible = this.lights; });
    this.headlamp.intensity = this.lights ? 4.2 : 0;
    this.scene.add(next.group);
    this.activeType = type;
  }

  setEffectsQuality(value: number): void {
    this.smoke.setQuality(value);
  }

  toggleLights(): void {
    this.lights = !this.lights;
    this.headlights.forEach(mesh => { mesh.visible = this.lights; });
    this.headlamp.intensity = this.lights ? 4.2 : 0;
  }

  update(
    distance: number, speed: number, dt: number,
    origin: THREE.Vector3, throttle = 0, derailed = false, active = true,
  ): void {
    this.derailBlend = THREE.MathUtils.damp(this.derailBlend, derailed ? 1 : 0, 3, Math.max(dt, 0));
    this.groups.forEach((group, i) => {
      const at = distance - i * TRAIN_CAR_SPACING;
      const tangent = this.rail.tangent(at);
      group.position.copy(this.rail.point(at)).sub(origin);
      group.position.addScaledVector(this.rail.side(at), this.derailBlend *
        (i % 2 === 0 ? 2.4 + i * .65 : -1.8 - i * .5));
      group.rotation.y = Math.atan2(-tangent.x, -tangent.z) +
        this.derailBlend * (i % 2 === 0 ? .16 : -.21);
      const curve = this.rail.curvature(at);
      const sway = Math.sin(distance / 4.5 - i * 0.7) *
        Math.min(0.045, Math.abs(speed) * 0.001 + curve * 3);
      group.rotation.z = sway + this.derailBlend *
        (i % 2 === 0 ? .38 + i * .04 : -.27 - i * .05);
      group.rotation.x = Math.sin(distance / 7 - i) * Math.min(0.015, Math.abs(speed) * 0.0004);
    });

    this.wheelRotation -= speed * dt / 0.56;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelRotation;

    // Update emitters after the locomotive world matrix, before spawning
    // smoke in absolute coordinates. Electric locomotives emit no smoke.
    this.groups[0].updateMatrixWorld(true);
    this.smoke.update(dt, origin, this.exhaust, this.activeType,
      throttle, speed, this.rail.tangent(distance), active && !derailed);
  }
}
