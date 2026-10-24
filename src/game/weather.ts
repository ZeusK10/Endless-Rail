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
  label = "Clear skies";
  rainAmount = 0;
  mistAmount = 0;

  constructor(
    private readonly scene: THREE.Scene,
    camera: THREE.Camera,
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

    this.rainAmount = rainMix;
    this.mistAmount = mistMix;
    // Only visibility, particle motion and fog depth belong to weather.
    // SkySystem owns the dome, fog tint, and time-of-day illumination.
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = lerp(220, 70, mistMix + rainMix * .5);
      this.scene.fog.far = lerp(1350, 420, Math.min(1, mistMix * .65 + rainMix * .8));
    }
    this.rain.visible = rainMix > .12;
    if (!this.rain.visible) return;
    for (let i = 0; i < this.raindrops.length; i += 3) {
      this.raindrops[i + 1] -= Math.min(dt, .05) * (17 + (i % 5) * 3);
      if (this.raindrops[i + 1] < -17) this.raindrops[i + 1] += 34;
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
