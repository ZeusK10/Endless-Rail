import * as THREE from "three";
import { RailPath } from "../sim/rail";
import { TRAIN_CAR_COUNT, TRAIN_CAR_SPACING } from "./constants";

const chassisMaterial = new THREE.MeshLambertMaterial({ color: "#d96f52" });
const bodyMaterial = new THREE.MeshLambertMaterial({ color: "#4c8290" });
const creamMaterial = new THREE.MeshLambertMaterial({ color: "#f8dfab" });
const roofMaterial = new THREE.MeshLambertMaterial({ color: "#556c7a" });
const windowMaterial = new THREE.MeshLambertMaterial({
  color: "#8cd1e3", emissive: "#27505a", emissiveIntensity: 0.15,
});
const wheelMaterial = new THREE.MeshLambertMaterial({ color: "#334c56" });
const lampMaterial = new THREE.MeshLambertMaterial({
  color: "#ffebae", emissive: "#ffe193", emissiveIntensity: 1,
});

function part(
  root: THREE.Group, size: [number, number, number],
  position: [number, number, number], material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  root.add(mesh);
  return mesh;
}

function wheel(root: THREE.Group, x: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.58, 0.27, 10),
    wheelMaterial,
  );
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, 0.7, z);
  root.add(mesh);
  return mesh;
}

function locomotive(): { group: THREE.Group; wheels: THREE.Mesh[]; lamp: THREE.Mesh } {
  const group = new THREE.Group();
  part(group, [3.3, 0.9, 7.5], [0, 1.2, 0], chassisMaterial);
  part(group, [2.85, 2.05, 4.1], [0, 2.55, -1.25], bodyMaterial);
  part(group, [2.9, 2.6, 2.5], [0, 2.75, 2], creamMaterial);
  part(group, [3.3, 0.3, 2.9], [0, 4.15, 2], roofMaterial);
  part(group, [2.7, 1.25, 0.13], [0, 3.05, 0.7], windowMaterial);
  part(group, [0.13, 1.2, 1.7], [-1.48, 3.1, 2], windowMaterial);
  part(group, [0.13, 1.2, 1.7], [1.48, 3.1, 2], windowMaterial);
  const lamp = part(group, [1.0, 0.36, 0.13], [0, 2.5, -3.86], lampMaterial);
  lamp.visible = true;
  const wheels: THREE.Mesh[] = [];
  for (const x of [-1.57, 1.57]) {
    for (const z of [-2.55, 2.55]) wheels.push(wheel(group, x, z));
  }
  return { group, wheels, lamp };
}

function carriage(index: number): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const group = new THREE.Group();
  const color = index % 2 === 0 ? bodyMaterial : chassisMaterial;
  part(group, [3.1, 0.75, 7.1], [0, 1.18, 0], roofMaterial);
  part(group, [2.95, 2.2, 6.7], [0, 2.48, 0], color);
  part(group, [3.1, 0.35, 7.1], [0, 3.82, 0], creamMaterial);
  for (const side of [-1, 1]) {
    for (const z of [-2.05, 0, 2.05]) {
      part(group, [0.09, 0.85, 1.45],
        [side * 1.51, 2.65, z], windowMaterial);
    }
  }
  const wheels: THREE.Mesh[] = [];
  for (const x of [-1.48, 1.48]) {
    for (const z of [-2.2, 2.2]) wheels.push(wheel(group, x, z));
  }
  return { group, wheels };
}

export class TrainView {
  private readonly groups: THREE.Group[] = [];
  private readonly wheels: THREE.Mesh[] = [];
  private readonly headlight: THREE.Mesh;
  lights = true;

  constructor(private readonly scene: THREE.Scene, private readonly rail: RailPath) {
    const loco = locomotive();
    this.groups.push(loco.group);
    this.wheels.push(...loco.wheels);
    this.headlight = loco.lamp;
    scene.add(loco.group);
    for (let i = 0; i < TRAIN_CAR_COUNT; i++) {
      const car = carriage(i);
      this.groups.push(car.group);
      this.wheels.push(...car.wheels);
      scene.add(car.group);
    }
  }

  toggleLights(): void {
    this.lights = !this.lights;
    this.headlight.visible = this.lights;
  }

  update(distance: number, speed: number, dt: number, origin: THREE.Vector3): void {
    this.groups.forEach((group, i) => {
      const at = distance - i * TRAIN_CAR_SPACING;
      const tangent = this.rail.tangent(at);
      group.position.copy(this.rail.point(at)).sub(origin);
      group.rotation.y = Math.atan2(-tangent.x, -tangent.z);
      group.rotation.z = Math.sin(distance / 7 + i) * Math.min(0.016, Math.abs(speed) * 0.0007);
    });
    for (const wheelMesh of this.wheels) {
      wheelMesh.rotation.x -= speed * dt / 0.58;
    }
  }
}
