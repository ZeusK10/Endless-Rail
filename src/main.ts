import * as THREE from "three";
import "./style.css";
import { RailPath } from "./sim/rail";
import { TrainSimulation } from "./sim/train";
import { WorldStream } from "./world/world";
import { TrainView } from "./game/train-view";
import { Controls } from "./game/controls";
import { ActivityManager } from "./game/activities";
import { TrainAudio } from "./game/audio";

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error("Missing interface element: " + id);
  return result as T;
}

const container = element<HTMLDivElement>("app");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#c9e9ff");
scene.fog = new THREE.Fog("#c9e9ff", 90, 230);
const camera = new THREE.PerspectiveCamera(57, 1, 0.1, 400);
const renderer = new THREE.WebGLRenderer({
  antialias: true, powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight("#ffffff", "#819f78", 2.7));
const sunlight = new THREE.DirectionalLight("#fff0cf", 2.2);
sunlight.position.set(-40, 75, 35);
scene.add(sunlight);

const seed = crypto.getRandomValues(new Uint32Array(1))[0];
const rail = new RailPath(seed);
const simulation = new TrainSimulation(rail);
const world = new WorldStream(scene, rail);
const trainView = new TrainView(scene, rail);
const controls = new Controls(renderer.domElement);
const activities = new ActivityManager(seed);
const audio = new TrainAudio();

const startScreen = element<HTMLElement>("start-screen");
const pauseScreen = element<HTMLElement>("pause-screen");
const hud = element<HTMLElement>("game-hud");
const touchControls = element<HTMLElement>("touch-controls");
const playButton = element<HTMLButtonElement>("play-button");
const resumeButton = element<HTMLButtonElement>("resume-button");
const restartButton = element<HTMLButtonElement>("restart-button");
const derailOption = element<HTMLInputElement>("derail-toggle");
const qualitySelect = element<HTMLSelectElement>("quality-select");
const speedValue = element<HTMLElement>("speed-value");
const distanceValue = element<HTMLElement>("distance-value");
const modeValue = element<HTMLElement>("mode-value");
const biomeValue = element<HTMLElement>("biome-value");
const directionValue = element<HTMLElement>("direction-value");
const controllerValue = element<HTMLElement>("controller-value");
const activityValue = element<HTMLElement>("activity-value");
const achievementValue = element<HTMLElement>("achievement-value");
const throttleValue = element<HTMLElement>("throttle-value");
const brakeValue = element<HTMLElement>("brake-value");
const recoverButton = element<HTMLButtonElement>("recover-button");

let playing = false;
let paused = false;
let cameraMode = 0;
let cameraYaw = 0;
let cameraPitch = 0;
let lastTime = 0;
let accumulator = 0;
let quality = 1;
let lastControllerName = "";
const forward = new THREE.Vector3();
const side = new THREE.Vector3();
const target = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const FIXED_STEP = 1 / 60;

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * quality);
  renderer.setSize(width, height);
}
window.addEventListener("resize", resize);
qualitySelect.addEventListener("change", () => {
  quality = Number(qualitySelect.value) || 1;
  resize();
});
resize();

function start(): void {
  if (playing) return;
  playing = true;
  paused = false;
  startScreen.hidden = true;
  hud.hidden = false;
  touchControls.hidden = false;
  pauseScreen.hidden = true;
  audio.start();
  lastTime = 0;
}

function setPause(value: boolean): void {
  if (!playing) return;
  paused = value;
  pauseScreen.hidden = !paused;
  touchControls.hidden = paused;
  if (!paused) audio.start();
}

playButton.addEventListener("click", start);
resumeButton.addEventListener("click", () => setPause(false));
restartButton.addEventListener("click", () => window.location.reload());
derailOption.addEventListener("change", () => {
  simulation.derailmentEnabled = derailOption.checked;
});
recoverButton.addEventListener("click", () => simulation.recover());
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) setPause(true);
});

world.update(0);
trainView.update(0, 0, 0, world.originPoint);

function updateCamera(dt: number): void {
  const s = simulation.distance;
  const origin = world.originPoint;
  target.copy(rail.point(s)).sub(origin);
  forward.copy(rail.tangent(s));
  side.copy(rail.side(s));
  if (cameraMode === 0) {
    desiredCamera.copy(target)
      .addScaledVector(forward, -17 * Math.cos(cameraYaw))
      .addScaledVector(side, 17 * Math.sin(cameraYaw));
    desiredCamera.y += 9 + cameraPitch * 5;
  } else if (cameraMode === 1) {
    desiredCamera.copy(target).addScaledVector(side, 21);
    desiredCamera.y += 9;
  } else if (cameraMode === 2) {
    desiredCamera.copy(target).addScaledVector(forward, 19);
    desiredCamera.y += 8;
  } else {
    desiredCamera.copy(target).addScaledVector(forward, 2.1);
    desiredCamera.y += 4.2;
  }
  const aim = target.clone().addScaledVector(forward, cameraMode === 3 ? 28 : 7);
  aim.y += cameraMode === 3 ? 3.3 : 2.2;
  const alpha = 1 - Math.exp(-6 * Math.min(dt, 0.1));
  if (camera.position.distanceTo(desiredCamera) > 150) {
    camera.position.copy(desiredCamera);
  } else {
    camera.position.lerp(desiredCamera, alpha);
  }
  camera.lookAt(aim);
}

function updateInterface(): void {
  speedValue.textContent = String(Math.round(simulation.speedKmh));
  distanceValue.textContent = (simulation.traveled / 1000).toFixed(1);
  modeValue.textContent = simulation.mode.toUpperCase();
  biomeValue.textContent = world.biomeName;
  directionValue.textContent = simulation.direction === 1 ? "FORWARD" : "REVERSE";
  throttleValue.textContent = Math.round(simulation.throttle * 100) + "%";
  brakeValue.textContent = Math.round(simulation.brake * 100) + "%";
  activityValue.textContent = activities.prompt || activities.message ||
    "Follow the horizon. Optional activities appear along the tracks.";
  achievementValue.textContent = String(activities.completed);
  recoverButton.hidden = !simulation.derailed;
  if (controls.gamepadName !== lastControllerName) {
    lastControllerName = controls.gamepadName;
    controllerValue.textContent = lastControllerName
      ? "Controller connected" : "Keyboard / touch";
  }
}

renderer.setAnimationLoop((time) => {
  const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  const input = controls.read();

  if (!playing) {
    if (input.horn || input.activity || input.pause) start();
  } else if (input.pause) {
    setPause(!paused);
  }

  if (playing && !paused) {
    if (input.mode) simulation.cycleMode();
    if (input.reverse) simulation.setDirection(-1);
    if (input.forward) simulation.setDirection(1);
    if (input.lights) trainView.toggleLights();
    if (input.camera) cameraMode = (cameraMode + 1) % 4;
    if (input.horn) {
      if (simulation.derailed) simulation.recover();
      else audio.horn();
    }
    if (input.activity) activities.activate(simulation.distance);
    if (input.throttleUp) simulation.adjustThrottle(dt * 0.43);
    if (input.throttleDown) simulation.adjustThrottle(-dt * 0.43);
    simulation.applyBrake(input.brake);
    cameraYaw += input.cameraX * dt * 1.5;
    cameraPitch = THREE.MathUtils.clamp(
      cameraPitch + input.cameraY * dt, -0.55, 1.1);

    accumulator += dt;
    let iterations = 0;
    while (accumulator >= FIXED_STEP && iterations++ < 4) {
      simulation.update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
    if (iterations >= 4) accumulator = 0;
    activities.update(simulation.distance, simulation.speedKmh,
      simulation.brake, simulation.mode);
  }

  world.update(simulation.distance, simulation.speed);
  trainView.update(simulation.distance, simulation.speed, dt, world.originPoint);
  updateCamera(Math.max(dt, 1 / 60));
  audio.update(simulation.speedKmh, !playing || paused);
  updateInterface();
  renderer.render(scene, camera);
});
