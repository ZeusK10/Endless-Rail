# Endless Rail

A lightweight, single-player, browser-based toy-train journey through a procedurally generated world.

## Current implementation (V1.2 development branch)

- Three.js + TypeScript + Vite.
- Deterministic rail alignment with straight-ish stretches, varied bends and seeded bridge, tunnel and cutting corridors. Track limits are available to the HUD and route-aware cruise/autodrive.
- Streamed, deterministic multi-level terrain with rolling valleys, high ridgelines, sculpted lakes and railway cuttings; reversing regenerates the same places.
- Dense three-tier broadleaf, pine and blossom forests, colorful bushes, flowers and rocky outcrops in Green Highlands, Cherry Blossom Valley and Lakeside Valley.
- Irregular biome-themed villages with gardens, roads and landmarks. Cached, merged low-poly houses have pitched gables, roof tile courses, window mullions/shutters, doors, flower boxes, stonework and distinct highland chimneys, cherry verandas and lakeside porches.
- Selectable diesel, electric and steam locomotive models (only when stopped), each with different acceleration and speed characteristics; passenger cars retain their details and animated wheelsets. A batched, low-poly exhaust plume emits darker diesel soot or fuller rising steam, while electric locomotives have no smoke.
- Smooth acceleration, braking, coasting and gradient physics, with independent locomotive braking, emergency stopping, look-ahead speed limiting, and visible derailment reactions.
- Manual, cruise control and autodrive; optional, graded derailment probability based on speed, cornering and harsh braking. HUD estimates the risk over the next ten seconds.
- Controller, keyboard and touchscreen controls; four train cameras plus free-fly camera with independent world streaming.
- Bundled CC0 recordings of a real diesel idling, rail cars rolling and a longer locomotive horn, blended by speed and throttle. Added generated rail-joint clicks, brake hiss, curve squeal, and derailment crash effects.
- Optional speed, smooth-driving, scenic, passenger-comfort and speed-limit activities. Session-only milestones, best speed, comfort and overspeed statistics.
- Main menu, minimalist contextual driving HUD, slide-out settings, camera sensitivity, per-category audio mixer, adaptive rendering/vegetation density and view distance. Seeded clear, mist and drizzle weather cycles.
- **No accounts, multiplayer, backend or save system. Refresh resets the experience.**

The train and scenery are stylized low-poly representations rather than scanned models. The new train audio uses real field recordings plus procedural effects, all bundled locally. See [AUDIO_SOURCES.md](AUDIO_SOURCES.md) for the recordings, edits and CC0 licensing. The scene is a playable early version, not a finished art or simulation release. Station and junction operations remain future milestones. Electric/steam propulsion accents are lightweight synthesized placeholders; the bundled real engine recording is diesel-specific. Train-type-specific field recordings and in-device audio balancing remain future sound improvements.

## Run

Requires Node.js 20.19+.

~~~sh
npm install
npm run dev
~~~

## Check

~~~sh
npm run typecheck
npm run build
npm test
npm run test:browser   # installs Chromium separately: npx playwright install chromium
~~~

## Train audio and derailment

Audio starts after a user gesture as required by iPad/Safari browsers. Recorded diesel playback rate/volume respond to throttle, the recorded wheel-rail layer takes over as speed increases, and filtered joint clicks and brake sounds respond to running conditions. Curve-flange squeal increases on bends and at elevated risk. The locomotive exhaust is a separate visual effect: it trails in world space, pauses with gameplay, and scales emission rate with throttle and graphics quality.

Derailment remains OFF by default. When enabled in the pause menu, the HUD displays an **estimated ten-second probability** if the current conditions persist. High speed in sharper curves and hard braking increase that probability; a derailment stops the train and plays a one-shot crash sound. Recovery resets the locomotive, not the world. No audio settings or game state are saved.

## Controls

| Input | Action |
| --- | --- |
| W / RT | Increase persistent throttle |
| Q / LB | Decrease throttle |
| S / LT | Brake |
| J | Hold independent locomotive brake |
| B / left-stick press | Emergency stop |
| M / RB | Cycle manual / cruise / autodrive |
| R / D-pad left | Reverse when stopped |
| F / D-pad right | Forward when stopped |
| H / A | Horn / recover after derailment |
| L / B | Toggle headlight |
| E / X | Join optional activity |
| C / Y | Cycle train-follow cameras (or return from free cam) |
| V / gamepad View-Select / FREE | Toggle detached free-fly camera |
| Free cam: W/A/S/D or left stick | Fly forward/back/strafe |
| Free cam: Space/Shift or LB/RB | Move up/down |
| Free cam: Ctrl or RT | Fly faster |
| Free cam: mouse drag / right stick | Look around |
| Mouse drag / right stick | Orbit chase camera |
| Esc / Menu | Pause |

Choose locomotive type and camera sensitivity in Settings. Dynamic weather and adaptive graphics can be disabled there. The game resets to defaults on refresh.

Free-cam touch flight buttons appear when flight mode is active. Touch buttons appear on coarse-pointer devices. Keyboard and gamepad also work on supported browsers.

## Development and review

See [AGENTS.md](AGENTS.md). The implementation is developed as small commits on a feature branch with GitHub Actions typecheck/build validation. Do not merge or deploy automatically.

## Validation scope

GitHub Actions runs TypeScript typechecking, a production build, deterministic rail/simulation tests, and a Chromium browser-interaction smoke test. Headless Chromium is **not** a replacement for listening on an iPad, verifying touch responsiveness on physical devices, or testing Bluetooth gamepads. Before merging, manually check horns/volume, graphics settings, all touch buttons, long reverse journeys, locomotive switching, and mobile battery/temperature.
