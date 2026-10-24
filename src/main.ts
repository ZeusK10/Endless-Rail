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
scene.fog = new THREE.Fog("#c9e9ff", 170, 690);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1100);
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
const freeControls = element<HTMLElement>("free-controls");
const cameraValue = element<HTMLElement>("camera-value");
const controlHint = element<HTMLElement>("control-hint");

let playing = false;
let paused = false;
let cameraMode = 0;
let cameraYaw = 0;
let cameraPitch = 0;
let freeCamera = false;
let freeYaw = 0;
let freePitch = 0;
const freePosition = new THREE.Vector3();
const flyDirection = new THREE.Vector3();
const flySide = new THREE.Vector3();
const flyMovement = new THREE.Vector3();
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
  world.setDensity(quality <= 0.7 ? 0.5 : quality >= 1.3 ? 1.2 : 1);
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
  freeControls.hidden = true;
  pauseScreen.hidden = true;
  audio.start();
  lastTime = 0;
}

function setPause(value: boolean): void {
  if (!playing) return;
  paused = value;
  pauseScreen.hidden = !paused;
  touchControls.hidden = paused || freeCamera;
  freeControls.hidden = paused || !freeCamera;
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

function setFreeCamera(enabled: boolean): void {
  if (enabled === freeCamera) return;
  freeCamera = enabled;
  if (enabled) {
    freePosition.copy(camera.position).add(world.originPoint);
    const gaze = new THREE.Vector3();
    camera.getWorldDirection(gaze);
    freeYaw = Math.atan2(-gaze.x, -gaze.z);
    freePitch = Math.asin(THREE.MathUtils.clamp(gaze.y, -1, 1));
  }
  touchControls.hidden = paused || enabled;
  freeControls.hidden = paused || !enabled;
  cameraValue.textContent = enabled ? "FREE FLY" : "TRAIN VIEW";
  controlHint.textContent = enabled
    ? "FREE CAM · WASD move · Space/Shift altitude · Drag/right stick look · V exit"
    : "W throttle · Q reduce · S brake · M mode · R/F direction · C views · V free cam · H horn · E activity";
}

function moveFreeCamera(input: ReturnType<Controls["read"]>, dt: number): void {
  freeYaw -= input.cameraX * dt * 2 + input.pointerX * 0.004;
  freePitch = THREE.MathUtils.clamp(
    freePitch - input.cameraY * dt * 1.7 - input.pointerY * 0.004, -1.47, 1.47);
  flyDirection.set(-Math.sin(freeYaw), 0, -Math.cos(freeYaw));
  flySide.set(Math.cos(freeYaw), 0, -Math.sin(freeYaw));
  flyMovement.copy(flyDirection).multiplyScalar(input.flyForward)
    .addScaledVector(flySide, input.flyStrafe);
  flyMovement.y = input.flyVertical;
  if (flyMovement.lengthSq() > 1) flyMovement.normalize();
  freePosition.addScaledVector(flyMovement, dt * (input.flyFast ? 80 : 28));
}

function updateCamera(dt: number): void {
  if (freeCamera) {
    camera.position.copy(freePosition).sub(world.originPoint);
    flyDirection.set(
      -Math.sin(freeYaw) * Math.cos(freePitch),
      Math.sin(freePitch),
      -Math.cos(freeYaw) * Math.cos(freePitch));
    camera.lookAt(camera.position.clone().add(flyDirection));
    return;
  }
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
    if (input.freeCamera) setFreeCamera(!freeCamera);
    if (input.camera) {
      if (freeCamera) setFreeCamera(false);
      else cameraMode = (cameraMode + 1) % 4;
    }
    if (input.horn) {
      if (simulation.derailed) simulation.recover();
      else audio.horn();
    }
    if (input.activity) activities.activate(simulation.distance);
    if (freeCamera) {
      moveFreeCamera(input, dt);
      // Keyboard navigation in free-fly mode must never brake the train.
      simulation.applyBrake(0);
    } else {
      if (input.throttleUp) simulation.adjustThrottle(dt * 0.43);
      if (input.throttleDown) simulation.adjustThrottle(-dt * 0.43);
      simulation.applyBrake(input.brake);
      cameraYaw += input.cameraX * dt * 1.5 + input.pointerX * 0.004;
      cameraPitch = THREE.MathUtils.clamp(
        cameraPitch + input.cameraY * dt + input.pointerY * 0.004, -0.55, 1.1);
    }

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

  world.update(simulation.distance, simulation.speed,
    freeCamera ? -freePosition.z : undefined);
  trainView.update(simulation.distance, simulation.speed, dt, world.originPoint);
  updateCamera(Math.max(dt, 1 / 60));
  audio.update(simulation.speedKmh, !playing || paused);
  updateInterface();
  renderer.render(scene, camera);
});
