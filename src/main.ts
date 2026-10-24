import * as THREE from "three";
import "./style.css";
import { RailPath } from "./sim/rail";
import { TrainSimulation, type DrivingMode, type TrainType } from "./sim/train";
import { WeatherSystem } from "./game/weather";
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
const weather = new WeatherSystem(scene, camera, sunlight, seed);

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
const cruiseTarget = element<HTMLElement>("cruise-target");
const speedLimitValue = element<HTMLElement>("speed-limit-value");
const driverMessage = element<HTMLElement>("driver-message");
const sensitivityInput = element<HTMLInputElement>("camera-sensitivity");
const adaptiveQualityToggle = element<HTMLInputElement>("adaptive-quality");
const trainTypeSelect = element<HTMLSelectElement>("train-type-select");
const weatherToggle = element<HTMLInputElement>("weather-toggle");
const weatherValue = element<HTMLElement>("weather-value");
const loadingStatus = element<HTMLElement>("loading-status");
const safetyWarning = element<HTMLElement>("safety-warning");
const activityNotice = element<HTMLElement>("activity-notice");
const activityNoticeLabel = element<HTMLElement>("activity-notice-label");
const activityJoinButton = element<HTMLButtonElement>("activity-join-button");
const controllerValue = element<HTMLElement>("controller-value");
const activityValue = element<HTMLElement>("activity-value");
const achievementValue = element<HTMLElement>("achievement-value");
const comfortValue = element<HTMLElement>("comfort-value");
const bestSpeedValue = element<HTMLElement>("best-speed-value");
const overspeedValue = element<HTMLElement>("overspeed-value");
const milestoneValue = element<HTMLElement>("milestones-value");
const throttleValue = element<HTMLElement>("throttle-value");
const brakeValue = element<HTMLElement>("brake-value");
const riskValue = element<HTMLElement>("risk-value");
const recoverButton = element<HTMLButtonElement>("recover-button");
const freeControls = element<HTMLElement>("free-controls");
const cameraValue = element<HTMLElement>("camera-value");
const controlHint = element<HTMLElement>("control-hint");
const settingsButton = element<HTMLButtonElement>("settings-button");
const settingsClose = element<HTMLButtonElement>("settings-close");
const settingsScrim = element<HTMLButtonElement>("settings-scrim");
const settingsDrawer = element<HTMLElement>("settings-drawer");
const freeCamButton = element<HTMLButtonElement>("drawer-freecam-button");
const lightsButton = element<HTMLButtonElement>("drawer-lights-button");
const activityButton = element<HTMLButtonElement>("drawer-activity-button");
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode]"));

let playing = false;
let paused = false;
let settingsOpen = false;
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
let adaptiveScale = 1;
let averageFrameMs = 16.7;
let lastAdaptiveCheck = 0;
let lastHudUpdate = 0;
let cameraSensitivity = 1;
let driverMessageUntil = 0;
let lastActivityMessage = "";
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * quality * adaptiveScale);
  renderer.setSize(width, height);
}
window.addEventListener("resize", resize);
sensitivityInput.addEventListener("input", () => {
  cameraSensitivity = sensitivityInput.valueAsNumber / 100;
});
function applyGraphics(): void {
  world.setDensity(Math.max(.45, Math.min(1.2, quality * adaptiveScale)));
  world.setViewScale(adaptiveScale);
  trainView.setEffectsQuality(Math.max(.4, Math.min(1, quality * adaptiveScale)));
  resize();
}
qualitySelect.addEventListener("change", () => {
  quality = Number(qualitySelect.value) || 1;
  applyGraphics();
});
adaptiveQualityToggle.addEventListener("change", () => {
  adaptiveScale = 1;
  applyGraphics();
});
resize();

function setSettings(open: boolean): void {
  settingsOpen = open && playing && !paused;
  settingsDrawer.classList.toggle("is-open", settingsOpen);
  settingsDrawer.inert = !settingsOpen;
  settingsDrawer.setAttribute("aria-hidden", String(!settingsOpen));
  settingsButton.setAttribute("aria-expanded", String(settingsOpen));
  settingsScrim.hidden = !settingsOpen;
  if (settingsOpen) settingsClose.focus();
  else if (settingsDrawer.contains(document.activeElement)) settingsButton.focus();
}

settingsButton.addEventListener("click", () => setSettings(!settingsOpen));
settingsClose.addEventListener("click", () => setSettings(false));
settingsScrim.addEventListener("click", () => setSettings(false));
trainTypeSelect.addEventListener("change", () => {
  const type = trainTypeSelect.value as TrainType;
  if (simulation.setTrainType(type)) {
    trainView.setTrainType(type);
    audio.setEngineType(type);
  } else {
    trainTypeSelect.value = simulation.trainType;
    driverMessage.textContent = "Stop the train before switching locomotives";
    driverMessageUntil = performance.now() + 2700;
  }
});
weatherToggle.addEventListener("change", () => weather.setEnabled(weatherToggle.checked));
modeButtons.forEach(button => button.addEventListener("click", () => {
  simulation.setMode(button.dataset.mode as DrivingMode);
}));
function toggleLights(): void {
  trainView.toggleLights();
  lightsButton.textContent = trainView.lights ? "Lights: On" : "Lights: Off";
  lightsButton.setAttribute("aria-pressed", String(trainView.lights));
}
lightsButton.addEventListener("click", toggleLights);
activityButton.addEventListener("click", () => activities.activate(simulation.distance));
activityJoinButton.addEventListener("click", () => activities.activate(simulation.distance));
const volumeNames = ["master", "engine", "rails", "horn", "effects"] as const;
function updateAudioMix(): void {
  const mix = Object.fromEntries(volumeNames.map(name => [name,
    element<HTMLInputElement>("volume-" + name).valueAsNumber / 100]));
  audio.setMix(mix);
}
volumeNames.forEach(name => element<HTMLInputElement>("volume-" + name)
  .addEventListener("input", updateAudioMix));
updateAudioMix();
freeCamButton.addEventListener("click", () => {
  setFreeCamera(!freeCamera);
  setSettings(false);
});

// Play the horn inside the actual input gesture, especially for iPad Safari;
// the animation-loop path remains for Bluetooth gamepad input.
document.addEventListener("pointerdown", event => {
  if (playing && !paused && !simulation.derailed &&
      (event.target as HTMLElement).closest('[data-control="horn"]')) {
    audio.horn();
  }
}, { capture: true });
document.addEventListener("keydown", event => {
  if (playing && !paused && !simulation.derailed && event.code === "KeyH" &&
      !event.repeat && !(event.target as HTMLElement).closest("input, select, textarea")) {
    audio.horn();
  }
});

function start(): void {
  if (playing) return;
  playing = true;
  paused = false;
  setSettings(false);
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
  if (paused) setSettings(false);
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
  freeCamButton.textContent = enabled ? "Return to train view" : "Enter free camera";
  controlHint.textContent = enabled
    ? "FREE CAM · WASD move · Space/Shift altitude · Drag/right stick look · V exit"
    : "W throttle · Q reduce · S brake · H horn · R/F direction · C views · ⚙ Settings · Esc pause";
}

function moveFreeCamera(input: ReturnType<Controls["read"]>, dt: number): void {
  freeYaw -= (input.cameraX * dt * 2 + input.pointerX * 0.004) * cameraSensitivity;
  freePitch = THREE.MathUtils.clamp(
    freePitch - (input.cameraY * dt * 1.7 + input.pointerY * 0.004) * cameraSensitivity, -1.47, 1.47);
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
  } else if (cameraMode === 3) {
    desiredCamera.copy(target).addScaledVector(forward, 2.1);
    desiredCamera.y += 4.2;
  } else if (cameraMode === 4) {
    desiredCamera.copy(target).addScaledVector(side, 38)
      .addScaledVector(forward, 15);
    desiredCamera.y += 5.5;
  } else {
    desiredCamera.copy(target).addScaledVector(forward, -34)
      .addScaledVector(side, Math.sin(simulation.distance / 75) * 24);
    desiredCamera.y += 16;
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
  cruiseTarget.hidden = simulation.mode !== "cruise";
  cruiseTarget.textContent = "TARGET " + Math.round(simulation.targetSpeed * 3.6) + " KM/H";
  speedLimitValue.textContent = String(simulation.speedLimitKmh);
  speedLimitValue.className = simulation.speedKmh > simulation.speedLimitKmh + 5 ? "risk-high" : "";
  modeButtons.forEach(button => button.setAttribute("aria-pressed",
    String(button.dataset.mode === simulation.mode)));
  biomeValue.textContent = world.biomeName;
  directionValue.textContent = simulation.direction === 1 ? "FORWARD" : "REVERSE";
  throttleValue.textContent = Math.round(simulation.throttle * 100) + "%";
  brakeValue.textContent = Math.round(simulation.brake * 100) + "%";
  riskValue.textContent = simulation.derailed ? "DERAILED" :
    simulation.derailmentEnabled
      ? Math.round(simulation.derailmentChance10s * 100) + "% / 10s"
      : "OFF";
  riskValue.className = simulation.derailmentRisk > 0.68
    ? "risk-high" : simulation.derailmentRisk > 0.35 ? "risk-medium" : "";
  activityValue.textContent = activities.prompt || activities.message ||
    "Follow the horizon. Optional activities appear along the tracks.";
  const chance = simulation.derailmentChance10s;
  safetyWarning.hidden = !simulation.derailmentEnabled || simulation.derailed || chance < 0.08;
  if (!safetyWarning.hidden) {
    safetyWarning.textContent = "⚠ Derailment risk " + Math.round(chance * 100) +
      "% over 10 seconds — slow down";
  }
  driverMessage.hidden = performance.now() > driverMessageUntil;
  activityNotice.hidden = !activities.prompt;
  activityNoticeLabel.textContent = activities.prompt;
  activityJoinButton.hidden = !activities.prompt.includes("nearby");
  achievementValue.textContent = String(activities.completed);
  comfortValue.textContent = String(Math.round(activities.comfortScore));
  bestSpeedValue.textContent = String(Math.round(activities.bestSpeedKmh));
  overspeedValue.textContent = String(Math.round(activities.overspeedMeters));
  milestoneValue.textContent = String(activities.milestones);
  weatherValue.textContent = weather.label;
  loadingStatus.hidden = !playing || audio.audioProgress >= 1;
  loadingStatus.textContent = "Loading railway audio: " +
    Math.round(audio.audioProgress * 100) + "%";
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
  if (playing && !paused && dt > 0) {
    averageFrameMs = averageFrameMs * .96 + dt * 1000 * .04;
    if (adaptiveQualityToggle.checked && time - lastAdaptiveCheck > 7000) {
      lastAdaptiveCheck = time;
      const next = averageFrameMs > 23 ? Math.max(.65, adaptiveScale - .12) :
        averageFrameMs < 17 && adaptiveScale < 1 ? Math.min(1, adaptiveScale + .06) : adaptiveScale;
      if (Math.abs(next - adaptiveScale) > .01) {
        adaptiveScale = next;
        applyGraphics();
      }
    }
  }
  const input = controls.read();

  if (!playing) {
    if (input.horn || input.activity || input.pause) start();
  } else if (input.pause) {
    if (settingsOpen) setSettings(false);
    else setPause(!paused);
  }

  if (playing && !paused) {
    if (input.mode && !freeCamera && !settingsOpen) simulation.cycleMode();
    if (input.reverse && !simulation.setDirection(-1)) {
      driverMessage.textContent = "Stop completely before reversing";
      driverMessageUntil = performance.now() + 2400;
    }
    if (input.forward && !simulation.setDirection(1)) {
      driverMessage.textContent = "Stop completely before changing direction";
      driverMessageUntil = performance.now() + 2400;
    }
    if (input.emergency) {
      simulation.emergencyStop();
      driverMessage.textContent = "EMERGENCY BRAKE APPLIED";
      driverMessageUntil = performance.now() + 2900;
    }
    if (input.lights) toggleLights();
    if (input.freeCamera) setFreeCamera(!freeCamera);
    if (input.camera) {
      if (freeCamera) setFreeCamera(false);
      else cameraMode = (cameraMode + 1) % 6;
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
      simulation.setIndependentBrake(0);
    } else {
      if (input.throttleTapUp) simulation.adjustThrottle(0.055);
      if (input.throttleTapDown) simulation.adjustThrottle(-0.055);
      if (input.throttleUp && !input.throttleTapUp) simulation.adjustThrottle(dt * 0.43);
      if (input.throttleDown && !input.throttleTapDown) simulation.adjustThrottle(-dt * 0.43);
      simulation.applyBrake(input.brake);
      simulation.setIndependentBrake(input.locomotiveBrake);
      cameraYaw += (input.cameraX * dt * 1.5 + input.pointerX * 0.004) * cameraSensitivity;
      cameraPitch = THREE.MathUtils.clamp(
        cameraPitch + (input.cameraY * dt + input.pointerY * 0.004) * cameraSensitivity, -0.55, 1.1);
    }

    accumulator += dt;
    let iterations = 0;
    while (accumulator >= FIXED_STEP && iterations++ < 4) {
      simulation.update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
    if (iterations >= 4) accumulator = 0;
    activities.update(simulation.distance, simulation.speedKmh,
      simulation.brake, simulation.mode, simulation.acceleration,
      simulation.speedLimitKmh);
    if (activities.message && activities.message !== lastActivityMessage) {
      lastActivityMessage = activities.message;
      driverMessage.textContent = activities.message;
      driverMessageUntil = performance.now() + 2900;
    }
  }

  world.update(simulation.distance, simulation.speed,
    freeCamera ? -freePosition.z : undefined);
  trainView.update(simulation.distance, simulation.speed, dt, world.originPoint,
    simulation.throttle, simulation.derailed, playing && !paused);
  updateCamera(Math.max(dt, 1 / 60));
  weather.update(simulation.distance, paused ? 0 : dt);
  audio.update({
    speedKmh: simulation.speedKmh,
    throttle: simulation.throttle,
    brake: simulation.brake,
    curvature: rail.curvature(simulation.distance),
    derailmentRisk: simulation.derailmentRisk,
    traveled: simulation.traveled,
    derailed: simulation.derailed,
    paused: !playing || paused,
  });
  if (time - lastHudUpdate > 100 || !playing) {
    lastHudUpdate = time;
    updateInterface();
  }
  renderer.render(scene, camera);
});
