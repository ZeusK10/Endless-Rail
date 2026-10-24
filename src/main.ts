import * as THREE from "three";
import "./style.css";

const container = document.querySelector<HTMLDivElement>("#app");
if (!container) throw new Error("App root not found");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#c8e8ff");
scene.fog = new THREE.Fog("#c8e8ff", 85, 210);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 320);
camera.position.set(28, 24, 46);
camera.lookAt(0, 2, -5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight("#ffffff", "#8ca77a", 2.5));
const sunlight = new THREE.DirectionalLight("#fff4de", 2.4);
sunlight.position.set(-25, 55, 30);
scene.add(sunlight);

function box(
  width: number,
  height: number,
  depth: number,
  color: string,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

const meadow = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240),
  new THREE.MeshLambertMaterial({ color: "#8bc980" }),
);
meadow.rotation.x = -Math.PI / 2;
meadow.position.y = -0.15;
scene.add(meadow);

// Fixed demonstration geometry. Seamless terrain and track streaming come later.
for (let z = -90; z <= 90; z += 3) {
  box(3.8, 0.2, 0.42, "#997258", 0, 0.06, z);
}
for (const x of [-1.3, 1.3]) {
  box(0.2, 0.23, 185, "#707d84", x, 0.26, 0);
}

const lake = new THREE.Mesh(
  new THREE.CircleGeometry(15, 24),
  new THREE.MeshLambertMaterial({ color: "#7bd5e9", side: THREE.DoubleSide }),
);
lake.rotation.x = -Math.PI / 2;
lake.position.set(24, 0.01, -29);
scene.add(lake);

function addHill(x: number, z: number, radius: number, height: number, color: string) {
  const hill = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 7),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
  hill.position.set(x, height / 2 - 0.15, z);
  hill.rotation.y = x * 0.19;
  scene.add(hill);
}
addHill(-36, -52, 25, 24, "#7fb56f");
addHill(-12, -82, 27, 32, "#88bd83");
addHill(49, -66, 28, 28, "#a9c98c");
addHill(-55, 17, 27, 21, "#83b57f");

function addTree(x: number, z: number, crownColor: string, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.3 * scale, 2.5 * scale, 6),
    new THREE.MeshLambertMaterial({ color: "#886f5d" }),
  );
  trunk.position.set(x, 1.2 * scale, z);
  scene.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.8 * scale, 0),
    new THREE.MeshLambertMaterial({ color: crownColor, flatShading: true }),
  );
  leaves.position.set(x, 3.3 * scale, z);
  scene.add(leaves);
}

const leafColors = ["#6fae5b", "#a5c46c", "#cf7651", "#975f40", "#e8a3b8", "#f0bfd6"];
for (let i = 0; i < 68; i++) {
  const side = i % 2 ? 1 : -1;
  const x = side * (8 + (i * 7.1) % 29);
  const z = -69 + (i * 13.7) % 142;
  const paletteIndex = i % leafColors.length;
  addTree(x, z, leafColors[paletteIndex], 0.7 + (i % 4) * 0.13);
}

function addHouse(x: number, z: number, wall: string, roof: string) {
  box(4, 3.2, 3.8, wall, x, 1.6, z);
  const top = new THREE.Mesh(
    new THREE.ConeGeometry(3.15, 2.2, 4),
    new THREE.MeshLambertMaterial({ color: roof, flatShading: true }),
  );
  top.position.set(x, 4.1, z);
  top.rotation.y = Math.PI / 4;
  scene.add(top);
}
addHouse(-19, 8, "#f4d8a6", "#ba7462");
addHouse(-25, 13, "#e2ebc5", "#7f8d68");
addHouse(18, -48, "#f1c49c", "#a46c5d");

const train = new THREE.Group();
function trainPart(
  width: number,
  height: number,
  depth: number,
  color: string,
  x: number,
  y: number,
  z: number,
) {
  const part = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  part.position.set(x, y, z);
  train.add(part);
}
trainPart(3.1, 1.5, 7.2, "#df745a", 0, 1.55, 0);
trainPart(2.85, 1.85, 3, "#f6dca9", 0, 3.1, 1.4);
trainPart(3.25, 0.25, 3.3, "#6d8b8b", 0, 4.1, 1.4);
trainPart(2.6, 0.12, 2.6, "#92cfe4", 0, 3.25, 1.42);
for (const x of [-1.52, 1.52]) {
  for (const z of [-2.2, 2.2]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.64, 0.64, 0.3, 10),
      new THREE.MeshLambertMaterial({ color: "#3d555e" }),
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.76, z);
    train.add(wheel);
  }
}
scene.add(train);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop((time) => {
  // Preview motion only; this is not locomotive simulation or player input.
  train.position.z = Math.sin(time * 0.00018) * 12;
  renderer.render(scene, camera);
});
