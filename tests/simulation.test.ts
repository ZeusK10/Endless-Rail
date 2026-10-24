import test from "node:test";
import assert from "node:assert/strict";
import { RailPath } from "../src/sim/rail";
import { TrainSimulation } from "../src/sim/train";
import { Landscape } from "../src/world/landscape";
import { ActivityManager } from "../src/game/activities";
import { hash } from "../src/game/constants";

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
