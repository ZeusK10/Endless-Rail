import * as THREE from "three";
import { hash } from "./constants";

type WeatherKind = "clear" | "mist" | "drizzle";
const lerp = THREE.MathUtils.lerp;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Session-only scenic weather; locations and transitions are seed-stable. */
export class WeatherSystem {
  private enabled = true;
  private readonly rain: THREE.Points;
  private readonly raindrops: Float32Array;
  private readonly fairSky = new THREE.Color("#c9e9ff");
  private readonly wetSky = new THREE.Color("#a9c1d0");
  private readonly mistSky = new THREE.Color("#d1dbdc");
  label = "Clear skies";

  constructor(
    private readonly scene: THREE.Scene,
    camera: THREE.Camera,
    private readonly sun: THREE.DirectionalLight,
    private readonly seed: number,
  ) {
    const count = 170;
    this.raindrops = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.raindrops[i * 3] = (hash(seed, i, 811) - .5) * 52;
      this.raindrops[i * 3 + 1] = (hash(seed, i, 812) - .5) * 32;
      this.raindrops[i * 3 + 2] = -5 - hash(seed, i, 813) * 62;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.raindrops, 3));
    this.rain = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: "#cbeaff", size: .14, transparent: true, opacity: .65,
      sizeAttenuation: true, depthWrite: false,
    }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    camera.add(this.rain);
  }

  setEnabled(value: boolean): void { this.enabled = value; }

  private kind(index: number): WeatherKind {
    if (index <= 0) return "clear";
    const r = hash(this.seed, index, 912);
    return r < .43 ? "clear" : r < .73 ? "mist" : "drizzle";
  }

  update(distance: number, dt: number): void {
    const span = 3200;
    const positive = Math.max(0, distance);
    const index = Math.floor(positive / span);
    const within = positive - index * span;
    const blend = this.enabled
      ? smooth(THREE.MathUtils.clamp((within - (span - 440)) / 440, 0, 1))
      : 0;
    const a = this.enabled ? this.kind(index) : "clear";
    const b = this.enabled ? this.kind(index + 1) : "clear";
    const rainMix = (a === "drizzle" ? 1 - blend : 0) +
      (b === "drizzle" ? blend : 0);
    const mistMix = (a === "mist" ? 1 - blend : 0) +
      (b === "mist" ? blend : 0);
    const weatherMix = Math.min(1, rainMix + mistMix);
    this.label = rainMix > .55 ? "Light rain" : mistMix > .55 ?
      "Morning mist" : weatherMix > .2 ? "Changing skies" : "Clear skies";

    const sky = this.fairSky.clone().lerp(this.mistSky, mistMix)
      .lerp(this.wetSky, rainMix);
    (this.scene.background as THREE.Color).copy(sky);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(sky);
      this.scene.fog.near = lerp(170, 90, mistMix + rainMix * .5);
      this.scene.fog.far = lerp(690, 345, Math.min(1, mistMix * .65 + rainMix * .8));
    }
    this.sun.intensity = 2.2 - .65 * rainMix - .38 * mistMix;
    this.rain.visible = rainMix > .12;
    if (!this.rain.visible) return;
    for (let i = 0; i < this.raindrops.length; i += 3) {
      this.raindrops[i + 1] -= Math.min(dt, .05) * (17 + (i % 5) * 3);
      if (this.raindrops[i + 1] < -17) this.raindrops[i + 1] += 34;
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
