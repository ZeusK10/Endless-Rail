# Endless Rail

A lightweight, single-player, browser-based toy-train journey through a procedurally generated world.

## Current implementation (V1 preview)

- Three.js + TypeScript + Vite.
- Deterministic, smooth railway sampled by travel distance.
- Streamed, deterministic multi-level terrain with rolling valleys, high ridgelines, sculpted lakes and railway cuttings; reversing regenerates the same places.
- Dense three-tier broadleaf, pine and blossom forests, colorful bushes, flowers and rocky outcrops in Green Highlands, Cherry Blossom Valley and Lakeside Valley.
- Occasional biome-themed villages with roof slopes, trim, windows, chimneys, porches, paths, fences and water features.
- One diesel locomotive and three passenger cars with simple acceleration, braking, coasting and gradient physics.
- Manual, cruise control and autodrive; optional simplified derailment.
- Controller, keyboard and touchscreen controls; four train cameras plus free-fly camera with independent world streaming.
- Optional speed, smooth-driving and scenic activities. Session-only milestones.
- Main menu, minimalist HUD and low/balanced/high rendering and vegetation-density settings.
- **No accounts, multiplayer, backend or save system. Refresh resets the experience.**

The scenery is richer stylized low-poly art, rather than photorealism. The scene is a playable early version, not a finished art or simulation release. Several train types, detailed stations, track junctions, advanced bridge/tunnel generation and richer sound effects are future improvements.

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
~~~

## Controls

| Input | Action |
| --- | --- |
| W / RT | Increase persistent throttle |
| Q / LB | Decrease throttle |
| S / LT | Brake |
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

Free-cam touch flight buttons appear when flight mode is active. Touch buttons appear on coarse-pointer devices. Keyboard and gamepad also work on supported browsers.

## Development and review

See [AGENTS.md](AGENTS.md). The implementation is developed as small commits on a feature branch with GitHub Actions typecheck/build validation. Do not merge or deploy automatically.
