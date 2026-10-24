import * as THREE from "three";
import { hash } from "./constants";

const clamp = THREE.MathUtils.clamp;
const smoothstep = (start: number, end: number, value: number) => {
  const t = clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
};

export function formatTimeOfDay(hour: number): string {
  const minutes = Math.floor((((hour % 24) + 24) % 24) * 60 + 0.00001) % 1440;
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
    String(minutes % 60).padStart(2, "0");
}

/** Zero at night and one in daylight, smoothly crossing dawn and dusk. */
export function daylightAt(hour: number): number {
  const solarAltitude = Math.sin((hour - 6) * Math.PI / 12);
  return smoothstep(-.12, .23, solarAltitude);
}

/**
 * One camera-centred, untextured sky dome + one tiny batched starfield.
 * The sky never streams, is unaffected by world-origin rebasing, and draws
 * behind geometry with no expensive HDR textures or postprocessing.
 */
export class SkySystem {
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly sunDirection = new THREE.Vector3();
  private readonly moonDirection = new THREE.Vector3();
  private readonly zenith = new THREE.Color();
  private readonly horizon = new THREE.Color();
  private readonly fogColor = new THREE.Color();
  private readonly nightZenith = new THREE.Color("#0b1734");
  private readonly nightHorizon = new THREE.Color("#293755");
  private readonly dayZenith = new THREE.Color("#4a9fd4");
  private readonly dayHorizon = new THREE.Color("#d0edf0");
  private readonly dawnZenith = new THREE.Color("#665d94");
  private readonly dawnHorizon = new THREE.Color("#f5a077");
  private readonly mistColor = new THREE.Color("#ccd9dd");
  private readonly drizzleColor = new THREE.Color("#8daab9");
  private readonly coldSun = new THREE.Color("#f4f0e4");
  private readonly warmSun = new THREE.Color("#ffb77e");
  private readonly nightAmbient = new THREE.Color("#91a5c9");
  private readonly dayAmbient = new THREE.Color("#ffffff");
  private readonly nightGround = new THREE.Color("#515a73");
  private readonly dayGround = new THREE.Color("#819f78");
  private cycleMinutes = 12;
  hour = 8.5;
  daylight = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly ambient: THREE.HemisphereLight,
    private readonly sun: THREE.DirectionalLight,
    seed: number,
  ) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: this.zenith },
        uHorizon: { value: this.horizon },
        uSunDirection: { value: this.sunDirection },
        uMoonDirection: { value: this.moonDirection },
        uSunVisibility: { value: 1 },
        uMoonVisibility: { value: 0 },
        uTwilight: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec3 vDirection;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunDirection;
        uniform vec3 uMoonDirection;
        uniform float uSunVisibility;
        uniform float uMoonVisibility;
        uniform float uTwilight;
        void main() {
          vec3 direction = normalize(vDirection);
          float heightBlend = smoothstep(-0.19, 0.79, direction.y);
          vec3 sky = mix(uHorizon, uZenith, heightBlend);

          float sunDot = max(dot(direction, normalize(uSunDirection)), 0.0);
          float haze = pow(sunDot, 24.0) * (0.11 + uTwilight * 0.26);
          sky += vec3(1.0, 0.45, 0.19) * haze * uSunVisibility;
          float sunDisk = smoothstep(0.99885, 0.99925, sunDot);
          sky = mix(sky, vec3(1.0, 0.92, 0.68), sunDisk * uSunVisibility);

          float moonDot = max(dot(direction, normalize(uMoonDirection)), 0.0);
          float moonGlow = pow(moonDot, 55.0) * 0.075 * uMoonVisibility;
          sky += vec3(0.35, 0.48, 0.8) * moonGlow;
          float moonDisk = smoothstep(0.99910, 0.99942, moonDot);
          sky = mix(sky, vec3(0.84, 0.9, 1.0), moonDisk * uMoonVisibility * 0.92);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(880, 32, 18), material);
    this.dome.name = "procedural-skybox";
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -100;
    scene.add(this.dome);

    // A few deterministic stars, never hundreds of individually drawn meshes.
    const points = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
      const y = .04 + hash(seed, i, 170) * .92;
      const azimuth = hash(seed, i, 171) * Math.PI * 2;
      const xz = Math.sqrt(1 - y * y) * 810;
      points[i * 3] = Math.cos(azimuth) * xz;
      points[i * 3 + 1] = y * 810;
      points[i * 3 + 2] = Math.sin(azimuth) * xz;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: "#f6f7ef", size: 1.8, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(geometry, starMaterial);
    this.stars.name = "night-stars";
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -99;
    scene.add(this.stars);
    this.update(0, false, 0, 0);
  }

  setTimeOfDay(hour: number): void {
    if (!Number.isFinite(hour)) return;
    this.hour = ((hour % 24) + 24) % 24;
  }

  setCycleMinutes(value: number): void {
    if (Number.isFinite(value)) this.cycleMinutes = clamp(value, 6, 30);
  }

  update(dt: number, advancing: boolean, rain = 0, mist = 0): void {
    if (advancing && dt > 0) {
      // Time follows active gameplay, not idle menus or tab suspension.
      this.hour = (this.hour + Math.min(dt, .05) * 24 / (this.cycleMinutes * 60)) % 24;
    }
    this.daylight = daylightAt(this.hour);
    const altitude = Math.sin((this.hour - 6) * Math.PI / 12);
    const angle = (this.hour - 6) * Math.PI / 12;
    this.sunDirection.set(Math.cos(angle), altitude, .33 * Math.cos(angle * .7)).normalize();
    this.moonDirection.copy(this.sunDirection).negate();
    const twilight = (1 - smoothstep(.0, .37, Math.abs(altitude))) *
      (1 - .35 * this.daylight);
    const cloud = clamp(rain * .7 + mist * .55, 0, 1);

    this.zenith.copy(this.nightZenith)
      .lerp(this.dayZenith, this.daylight)
      .lerp(this.dawnZenith, twilight * .72)
      .lerp(this.drizzleColor, cloud * .4);
    this.horizon.copy(this.nightHorizon)
      .lerp(this.dayHorizon, this.daylight)
      .lerp(this.dawnHorizon, twilight * .88)
      .lerp(this.mistColor, mist * .38)
      .lerp(this.drizzleColor, rain * .38);
    this.fogColor.copy(this.horizon).lerp(this.zenith, .25);
    this.scene.background = this.fogColor;

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.fogColor);
    }
    this.sun.position.copy(this.sunDirection).multiplyScalar(120);
    this.sun.color.copy(this.coldSun).lerp(this.warmSun, twilight * .87);
    this.sun.intensity = (.018 + 2.18 * this.daylight) * (1 - rain * .31 - mist * .18);
    this.ambient.intensity = .36 + 2.34 * this.daylight * (1 - cloud * .22);
    this.ambient.color.copy(this.nightAmbient).lerp(this.dayAmbient, this.daylight);
    this.ambient.groundColor.copy(this.nightGround).lerp(this.dayGround, this.daylight);

    const uniforms = this.dome.material.uniforms;
    uniforms.uSunVisibility.value = smoothstep(-.08, .12, altitude);
    uniforms.uMoonVisibility.value = (1 - this.daylight) * (1 - cloud * .45);
    uniforms.uTwilight.value = twilight;
    this.dome.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.stars.material.opacity = (1 - this.daylight) * (1 - cloud * .85) * .94;
    this.stars.visible = this.stars.material.opacity > .02;
  }
}
