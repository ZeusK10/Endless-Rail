# Endless Rail

A lightweight, single-player, browser-based toy-train journey through a procedurally generated world.

## Current implementation (V1 preview)

- Three.js + TypeScript + Vite.
- Deterministic, smooth railway sampled by travel distance.
- Streamed low-poly terrain and railway chunks, including driving backwards through previously visited scenery.
- Green Highlands, Cherry Blossom Valley and Lakeside Valley; foliage mixes green, pink, yellow, brown and red.
- Occasional biome-themed villages, bridges of scenery created by rail/terrain composition, and water features.
- One diesel locomotive and three passenger cars with simple acceleration, braking, coasting and gradient physics.
- Manual, cruise control and autodrive; optional simplified derailment.
- Controller, keyboard and touchscreen controls; four cameras.
- Optional speed, smooth-driving and scenic activities. Session-only milestones.
- Main menu and minimalist HUD.
- **No accounts, multiplayer, backend or save system. Refresh resets the experience.**

The scene is a playable early version, not a finished art or simulation release. Several train types, detailed stations, track junctions, advanced bridge/tunnel generation and richer sound effects are future improvements.

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
| C / Y | Change camera |
| Mouse drag / right stick | Orbit chase camera |
| Esc / Menu | Pause |

Touch buttons appear on coarse-pointer devices. Keyboard and gamepad also work on supported browsers.

## Development and review

See [AGENTS.md](AGENTS.md). The implementation is developed as small commits on a feature branch with GitHub Actions typecheck/build validation. Do not merge or deploy automatically.
