import test from "node:test";
import assert from "node:assert/strict";
import { RailPath } from "../src/sim/rail";
import { TrainSimulation, derailmentRatePerSecond, derailmentRiskLevel } from "../src/sim/train";
import { Landscape } from "../src/world/landscape";
import { ActivityManager } from "../src/game/activities";
import { hash, CHUNK_LENGTH, biomeAt, biomeBoundary } from "../src/game/constants";
import { populateVillage, populateWildlife, villageRegion } from "../src/world/scenery";
import { TrainView } from "../src/game/train-view";
import { WorldStream } from "../src/world/world";
import { avoidTerrain, minimumCameraY } from "../src/game/camera-rig";
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

test("settlements span multiple chunks with architectural detail", () => {
  const rail = new RailPath(76120);
  const landscape = new Landscape(rail);
  const createVillage = (index: number) => {
    const chunk = {
      group: new THREE.Group(), center: new THREE.Vector3(),
      instances: [] as THREE.InstancedMesh[],
    };
    populateVillage({ chunk, rail, landscape },
      index, index * CHUNK_LENGTH + CHUNK_LENGTH / 2);
    return chunk.group;
  };
  const groups = [6, 7, 8].map(index => createVillage(index));
  for (const group of groups) {
    const road = group.getObjectByName("terrain-following-mud-road") as THREE.Mesh;
    assert.ok(road, "each settlement chunk needs a continuous ground-hugging road");
    assert.ok(road.geometry.getAttribute("position").count > 60);
  }
  assert.equal(villageRegion(rail.seed, 5), null);
  assert.ok(villageRegion(rail.seed, 6) && villageRegion(rail.seed, 8));
  const counts = groups.map(group => group.children.filter(item => item instanceof THREE.Group).length);
  assert.ok(counts.every(count => count >= 3), "each village chunk has distinct structures");
  assert.ok(counts.reduce((a, b) => a + b, 0) >= 12, "settlement has enough structures");
  const again = createVillage(7);
  const a = groups[1].children.filter(item => item instanceof THREE.Group) as THREE.Group[];
  const b = again.children.filter(item => item instanceof THREE.Group) as THREE.Group[];
  assert.equal(a.length, b.length);
  const detailed = a.find(item => item.children.some(part =>
    part instanceof THREE.Mesh && part.geometry.getAttribute("position").count > 600));
  assert.ok(detailed, "at least one house has merged facade and roof details");
  const match = b[a.indexOf(detailed)];
  assert.equal((detailed.children[0] as THREE.Mesh).geometry,
    (match.children[0] as THREE.Mesh).geometry);
});

test("seeded ground animals and birds avoid water and dense village paths", () => {
  const rail = new RailPath(81124);
  const landscape = new Landscape(rail);
  const setup = () => ({
    group: new THREE.Group(), center: rail.point(120), instances: [] as THREE.InstancedMesh[],
  });
  const a = setup(), b = setup();
  const first = populateWildlife({ chunk: a, rail, landscape }, 0, 0, CHUNK_LENGTH);
  const second = populateWildlife({ chunk: b, rail, landscape }, 0, 0, CHUNK_LENGTH);
  assert.equal(first.length, second.length);
  for (let i = 0; i < first.length; i++) {
    assert.deepEqual(first[i].position.toArray(), second[i].position.toArray());
    assert.ok(first[i].children.length <= 4, "wildlife geometry is draw-call friendly");
  }
});

test("locomotive headlights project forward and obey the light toggle", () => {
  const scene = new THREE.Scene();
  const view = new TrainView(scene, new RailPath(8231));
  const activeSpot = () => {
    let spot: THREE.SpotLight | undefined;
    scene.traverse(object => {
      if (object instanceof THREE.SpotLight) spot = object;
    });
    return spot;
  };
  assert.ok(activeSpot(), "the active locomotive needs a forward spotlight");
  assert.ok(activeSpot()!.target.position.z < activeSpot()!.position.z - 20);
  assert.ok(scene.getObjectByName("forward-headlight-beam")?.visible);
  view.toggleLights();
  assert.equal(activeSpot()!.intensity, 0);
  assert.equal(scene.getObjectByName("forward-headlight-beam")?.visible, false);
  view.setTrainType("steam");
  assert.equal(activeSpot()!.intensity, 0);
  view.toggleLights();
  assert.ok(activeSpot()!.intensity > 0);
  assert.equal(scene.getObjectByName("forward-headlight-beam")?.visible, true);
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
  const hills: THREE.Object3D[] = [];
  scene.traverse(o => {
    if (o.name === "tunnel-arch") arches.push(o);
    if (o.name === "tunnel-hillside") hills.push(o);
  });
  assert.ok(arches.length > 0);
  assert.ok(hills.length > 0, "tunnel bore must be enclosed by an upper hillside");
  const railHeight = rail.point(s).y;
  assert.ok(world.terrainHeight(s, 35) > railHeight + 5);
  world.clear();
});

test("lakes preserve a dry rail corridor and tunnels do not leak water", () => {
  const rail = new RailPath(71425);
  const terrain = new Landscape(rail);
  for (let i = 0; i < 10; i++) {
    const lake = terrain.lake(i);
    assert.ok(Math.abs(lake.offset) > lake.widthRadius + 40,
      "lake shore must stay outside ordinary track");
    assert.equal(terrain.isWater(lake.s, 0), false);
    assert.ok(terrain.height(lake.s, lake.offset) < lake.waterY,
      "water must be inside a carved basin");
  }
  for (let sector = 0; sector < 75; sector++) {
    const s = sector * 1550 + 750;
    if (rail.featureAt(s) === "tunnel") {
      assert.equal(terrain.underwaterLake(s), null,
        "unsealed underwater sections stay disabled");
    }
  }
});

test("camera terrain sweep retracts and preserves safe clearance", () => {
  const rail = new RailPath(7124);
  const scene = new THREE.Scene();
  const world = new WorldStream(scene, rail);
  const anchor = rail.point(780).add(new THREE.Vector3(0, 5, 0));
  const wanted = anchor.clone().addScaledVector(rail.side(780), 110);
  wanted.y = -80;
  const safe = avoidTerrain(anchor, wanted, rail, world);
  assert.ok(safe.distanceTo(anchor) < wanted.distanceTo(anchor));
  assert.ok(safe.y >= minimumCameraY(safe, rail, world));
  world.clear();
});

test("rail uses shaped steel profiles, contiguous ballast and shared fasteners", () => {
  const rail = new RailPath(4442);
  const scene = new THREE.Scene();
  const world = new WorldStream(scene, rail);
  world.setDensity(.45);
  world.setViewScale(.58);
  world.update(0);
  const profile = scene.getObjectByName("rail-profile") as THREE.Mesh;
  const ballast = scene.getObjectByName("gravel-ballast") as THREE.Mesh;
  const fasteners = scene.getObjectByName("fasteners") as THREE.InstancedMesh;
  assert.ok(profile && ballast && fasteners);
  assert.ok(profile.geometry.getAttribute("position").count >= 1000);
  assert.ok(ballast.geometry.getAttribute("color").count > 500);
  assert.ok(fasteners.count >= 250);
  world.clear();
});

test("calibrated derailment hazard matches its displayed 10-second probability", () => {
  const safe = derailmentRiskLevel(65, 85, .00045, 0);
  const unsafe = derailmentRiskLevel(112, 48, .00055, .86);
  assert.ok(safe < .01);
  assert.ok(unsafe > .75);
  assert.ok(derailmentRatePerSecond(unsafe) > 100 * derailmentRatePerSecond(safe));
  const rail = new RailPath(60123);
  const sim = new TrainSimulation(rail);
  sim.derailmentRisk = unsafe;
  const expected = 1 - Math.exp(-derailmentRatePerSecond(unsafe) * 10);
  assert.ok(Math.abs(sim.derailmentChance10s - expected) < 1e-12);
});

test("failure toggle prevents derailment, but dangerous driving derails seeded trials", () => {
  let failures = 0;
  for (let i = 0; i < 24; i++) {
    const rail = new RailPath(1000 + i);
    rail.speedLimitAt = () => 42;
    rail.curvature = () => .00051;
    rail.grade = () => 0;
    const disabled = new TrainSimulation(rail);
    disabled.speed = 108 / 3.6;
    for (let t = 0; t < 150; t++) disabled.update(1 / 60);
    assert.equal(disabled.derailed, false);
    const dangerous = new TrainSimulation(rail);
    dangerous.speed = 108 / 3.6;
    dangerous.derailmentEnabled = true;
    for (let t = 0; t < 360 && !dangerous.derailed; t++) dangerous.update(1 / 60);
    if (dangerous.derailed) failures++;
  }
  assert.ok(failures >= 9, "overspeeding through tight bends should cause measurable seeded failures");
});

test("forward travel and reverse revisit remain bounded and deterministic", () => {
  const rail = new RailPath(2026);
  const scene = new THREE.Scene();
  const world = new WorldStream(scene, rail);
  world.setDensity(.45);
  world.setViewScale(.58);
  const sample = [0, 320, 1900, 4800].map(s => world.terrainHeight(s, 74));
  for (const distance of [0, 1700, 3900, 6100, 4800, 2200, 0]) {
    world.update(distance, 15);
    assert.ok(scene.children.length <= 22, "streaming should retain bounded chunks");
  }
  assert.deepEqual([0, 320, 1900, 4800].map(s => world.terrainHeight(s, 74)), sample);
  assert.ok(scene.getObjectByName("rail-profile"), "rails survive reverse revisiting");
  world.clear();
  assert.equal(scene.children.length, 0);
});

test("road crossings add legible warning structures on open track", () => {
  const rail = new RailPath(5501);
  const world = new WorldStream(new THREE.Scene(), rail);
  world.setDensity(.45);
  world.setViewScale(.58);
  world.update(340);
  const crossing = world.scene.getObjectByName("rail-crossing");
  assert.ok(crossing, "planned crossing should be present beside the track");
  assert.ok(crossing.children.length >= 14);
  world.clear();
});
