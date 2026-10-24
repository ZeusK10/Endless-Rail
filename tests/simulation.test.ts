import test from "node:test";
import assert from "node:assert/strict";
import { RailPath } from "../src/sim/rail";
import { TrainSimulation } from "../src/sim/train";
import { Landscape } from "../src/world/landscape";
import { ActivityManager } from "../src/game/activities";
import { hash, CHUNK_LENGTH, biomeAt, biomeBoundary } from "../src/game/constants";
import { populateVillage } from "../src/world/scenery";
import { TrainView } from "../src/game/train-view";
import { WorldStream } from "../src/world/world";
import { SkySystem, daylightAt, formatTimeOfDay } from "../src/game/sky";
import * as THREE from "three";

test("rail path, limits and terrain are deterministic and finite", () => {
  const a = new RailPath(82731), b = new RailPath(82731);
  const land = new Landscape(a);
  for (const s of [-2400, -1, 0, 239.99, 240, 7800, 15600, 28672]) {
    assert.deepEqual(a.point(s).toArray(), b.point(s).toArray());
    assert.ok(Number.isFinite(a.curvature(s)));
    assert.ok(a.speedLimitAt(s) >= 35 && a.speedLimitAt(s) <= 110);
    for (const lateral of [-180, -25, 0, 24, 180]) {
      const h = land.height(s, lateral);
      assert.ok(Number.isFinite(h));
      assert.equal(h, land.height(s, lateral));
    }
  }
});

test("rail segment and chunk boundaries stay continuous", () => {
  const rail = new RailPath(6319);
  const terrain = new Landscape(rail);
  for (const s of [0, 240, 610, 1220, 2100, 7800, 15600]) {
    assert.ok(rail.point(s - .001).distanceTo(rail.point(s + .001)) < .025);
    assert.ok(Math.abs(terrain.height(s - .001, 45) -
      terrain.height(s + .001, 45)) < 2);
  }
});

test("vehicle accelerates, brakes to zero, and reverses only when stopped", () => {
  const train = new TrainSimulation(new RailPath(8183));
  train.adjustThrottle(1);
  for (let i = 0; i < 480; i++) train.update(1 / 60);
  assert.ok(train.speedKmh > 10);
  assert.equal(train.setDirection(-1), false);
  train.emergencyStop();
  for (let i = 0; i < 400; i++) train.update(1 / 60);
  assert.equal(train.speedKmh, 0);
  assert.equal(train.setDirection(-1), true);
  train.setTrainType("electric");
  assert.equal(train.trainType, "electric");
  train.setMode("autodrive");
  for (let i = 0; i < 220; i++) train.update(1 / 60);
  assert.ok(Number.isFinite(train.speedKmh));
});

test("activities, comfort and milestones work without saves", () => {
  const activities = new ActivityManager(71222);
  activities.update(1800, 51, 0, "manual", .7, 90);
  assert.ok(activities.prompt.includes("nearby"));
  activities.activate(1800);
  assert.ok(activities.message.length > 0);
  activities.update(5200, 65, .2, "manual", .2, 70);
  assert.ok(activities.milestones >= 1);
  assert.ok(activities.farthestKm >= 5.2);
  assert.ok(activities.comfortScore >= 0 && activities.comfortScore <= 100);
});

test("locomotive types have different profiles and dynamic weather remains optional", async () => {
  const train = new TrainSimulation(new RailPath(1337));
  assert.equal(train.setTrainType("steam"), true);
  train.adjustThrottle(1);
  for (let i = 0; i < 200; i++) train.update(1 / 60);
  assert.ok(train.speedKmh > 0);
  assert.equal(train.setTrainType("electric"), false);
});

test("scenery seed salts decorrelate placement coordinates", () => {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < 340; i++) {
    xs.push(hash(0x12345678 ^ Math.imul(11, 0x9e3779b1), 9, i));
    ys.push(hash(0x12345678 ^ Math.imul(17, 0x9e3779b1), 9, i));
  }
  const avg = (data: number[]) => data.reduce((a,b) => a+b, 0)/data.length;
  const mx = avg(xs), my = avg(ys);
  const covariance = xs.reduce((v,x,i) => v+(x-mx)*(ys[i]-my), 0);
  const varianceX = xs.reduce((v,x) => v+(x-mx)**2, 0);
  const varianceY = ys.reduce((v,y) => v+(y-my)**2, 0);
  assert.ok(Math.abs(covariance / Math.sqrt(varianceX*varianceY)) < .16);
});

test("village houses are detailed and share cached render geometry", () => {
  const rail = new RailPath(76120);
  const landscape = new Landscape(rail);
  const createVillage = () => {
    const chunk = {
      group: new THREE.Group(), center: new THREE.Vector3(),
      instances: [] as THREE.InstancedMesh[],
    };
    populateVillage({ chunk, rail, landscape }, 7, 7 * CHUNK_LENGTH + CHUNK_LENGTH / 2);
    return chunk.group;
  };
  const a = createVillage(), b = createVillage();
  const housesA = a.children.filter(item => item instanceof THREE.Group);
  const housesB = b.children.filter(item => item instanceof THREE.Group);
  assert.ok(housesA.length >= 7);
  assert.equal(housesA.length, housesB.length);
  const first = housesA[0] as THREE.Group;
  const repeat = housesB[0] as THREE.Group;
  assert.ok(first.children.length >= 8 && first.children.length < 30);
  const pieces = first.children as THREE.Mesh[];
  assert.ok(pieces.some(mesh => mesh.geometry.getAttribute("position").count > 600));
  assert.equal(pieces[0].geometry, (repeat.children[0] as THREE.Mesh).geometry);
});

test("diesel and steam emit bounded, world-space exhaust; electric stays clean", () => {
  const rail = new RailPath(7401);
  const scene = new THREE.Scene();
  const view = new TrainView(scene, rail);
  const particles = scene.getObjectByName("locomotive-exhaust") as THREE.InstancedMesh;
  assert.ok(particles);
  assert.equal(particles.count, 0);
  const origin = new THREE.Vector3();
  for (let i = 0; i < 110; i++) {
    view.update(i * .4, 12, 1 / 60, origin, .9, false, true);
  }
  assert.ok(particles.count > 0 && particles.count <= particles.instanceMatrix.count);
  view.setTrainType("electric");
  for (let i = 0; i < 340; i++) {
    view.update(44 + i * .4, 12, 1 / 60, origin, .9, false, true);
  }
  assert.equal(particles.count, 0);
  view.setTrainType("steam");
  view.setEffectsQuality(.45);
  for (let i = 0; i < 110; i++) {
    view.update(190 + i * .2, 7, 1 / 60, origin, .8, false, true);
  }
  assert.ok(particles.count > 0 && particles.count <= 80);
  const countBeforePause = particles.count;
  view.update(211, 0, 1, new THREE.Vector3(500, 0, 0), 0, false, false);
  assert.equal(particles.count, countBeforePause);
});

test("time-of-day sampling, weather tint and skybox remain bounded", () => {
  assert.equal(formatTimeOfDay(8.5), "08:30");
  assert.equal(formatTimeOfDay(23.75), "23:45");
  assert.equal(formatTimeOfDay(24.25), "00:15");
  assert.ok(daylightAt(12) > .99);
  assert.ok(daylightAt(0) < .01);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#ffffff", 170, 690);
  const camera = new THREE.PerspectiveCamera(62, 1, .1, 1100);
  const ambient = new THREE.HemisphereLight("#ffffff", "#819f78", 2.7);
  const sun = new THREE.DirectionalLight("#ffffff", 2.2);
  const sky = new SkySystem(scene, camera, ambient, sun, 4192);
  assert.ok(scene.getObjectByName("procedural-skybox"));
  const stars = scene.getObjectByName("night-stars") as THREE.Points;
  sky.setTimeOfDay(12);
  sky.update(0, false, 0, 0);
  const noonSun = sun.intensity;
  assert.ok(noonSun > 1.8);
  assert.equal(stars.visible, false);
  const noonFog = (scene.fog as THREE.Fog).color.clone();
  sky.setTimeOfDay(0);
  sky.update(0, false, 0, 0);
  assert.ok(sun.intensity < .1);
  assert.ok(stars.visible);
  assert.ok(ambient.intensity < 1);
  assert.notDeepEqual((scene.fog as THREE.Fog).color.toArray(), noonFog.toArray());
  sky.setTimeOfDay(6);
  sky.update(0, false, 1, 0);
  assert.ok(Number.isFinite(sun.position.length()));
  sky.setTimeOfDay(8.5);
  sky.setCycleMinutes(12);
  sky.update(60, true, 0, 0);
  // RAF dt is capped so a background-tab jump cannot skip whole nights.
  assert.ok(sky.hour > 8.5 && sky.hour < 8.51);
  const beforePause = sky.hour;
  sky.update(30, false, 0, 0);
  assert.equal(sky.hour, beforePause);
});

test("shorter variable biomes, route features and water stay reproducible", () => {
  const first = new RailPath(18842);
  const reversed = new RailPath(18842);
  const terrain = new Landscape(first);
  for (let i = 1; i <= 15; i++) {
    const length = biomeBoundary(i) - biomeBoundary(i - 1);
    assert.ok(length >= 1900 && length <= 3300, "biome length " + length);
    assert.notEqual(biomeAt(biomeBoundary(i) - 10), biomeAt(biomeBoundary(i) + 10));
  }
  let bridges = 0, tunnels = 0;
  for (let sector = 0; sector < 10; sector++) {
    const s = sector * 1550 + 750;
    const feature = first.featureAt(s);
    if (feature === "bridge") {
      bridges++;
      const water = terrain.river(s, 0);
      assert.ok(water && terrain.isWater(water.centerS, 0), "bridge must cross an actual river");
      assert.ok(terrain.height(water.centerS, 0) < first.point(water.centerS).y - 2);
    }
    if (feature === "tunnel") tunnels++;
    assert.deepEqual(first.point(s).toArray(), reversed.point(s).toArray());
  }
  assert.ok(bridges >= 2 && tunnels >= 2);
  for (const s of [0, 399, 780, 1550, 3650, 6400, 9200, 17880]) {
    assert.ok(first.point(s - .02).distanceTo(first.point(s + .02)) < .3);
    assert.ok(Number.isFinite(terrain.height(s, 840)));
  }
  assert.ok(terrain.isWater(1100, terrain.lake(0).offset));
});

test("tunnels create a real continuous arch within raised terrain", () => {
  const rail = new RailPath(71425);
  let s = 750;
  for (let i = 0; i < 9 && rail.featureAt(s) !== "tunnel"; i++) s += 1550;
  assert.equal(rail.featureAt(s), "tunnel");
  const scene = new THREE.Scene();
  const world = new WorldStream(scene, rail);
  world.update(s);
  const arches: THREE.Object3D[] = [];
  scene.traverse(o => { if (o.name === "tunnel-arch") arches.push(o); });
  assert.ok(arches.length > 0);
  const railHeight = rail.point(s).y;
  assert.ok(world.terrainHeight(s, 35) > railHeight + 5);
  world.clear();
});

test("occasional underwater tunnels keep water above the arched bore", () => {
  const rail = new RailPath(71425);
  const terrain = new Landscape(rail);
  let reservoir: ReturnType<Landscape["lake"]> | null = null;
  for (let sector = 0; sector < 75 && !reservoir; sector++) {
    reservoir = terrain.underwaterLake(sector * 1550 + 750);
  }
  assert.ok(reservoir, "there should be occasional submerged tunnel sections");
  assert.equal(rail.featureAt(reservoir.s), "tunnel");
  assert.ok(reservoir.waterY > rail.point(reservoir.s).y + 7.7);
  assert.ok(terrain.isWater(reservoir.s, 0));
});
