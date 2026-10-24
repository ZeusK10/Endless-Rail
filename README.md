# Endless Rail

A browser-based, single-player, low-poly toy-style endless train experience.

> **Status:** Initial technical bootstrap. The playable train simulation, seamless procedural world, activities, and detailed systems are not implemented yet.

## Confirmed direction

- Technology: Three.js + TypeScript + Vite (WebGL); static hosting.
- Several train types; balanced simulation depth; all previously chosen operating modes and train access.
- Seamless world streaming with train reversing and revisiting supported in the eventual implementation.
- Initial scenery: green highlands, cherry blossoms, and a lakeside valley. Trees include green, brown, red, and other seasonal colors.
- Occasional villages of differing character across biomes; interactive activities to add gameplay variety.
- Derailment/failure is optional. Station gameplay is planned for later.
- Single-player only. No multiplayer, backend, accounts, or persistence. A refresh resets to the initial state.

## Run the starter

Requires Node.js 20.19+ (Node.js 22 LTS recommended).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

## Validate

```sh
npm run typecheck
npm run build
```

The current scene is a **visual smoke test**, not a finished game. It draws track, a simple train, colorful trees, hills, lake, and village-like buildings to verify WebGL rendering.

## Cloud onboarding

After this repository contains its initial `main` commit, select `ZeusK10/Endless-Rail` while creating a Codex Cloud environment. Allow installation of npm dependencies, run the checks above, then publish the prepared environment.

See [AGENTS.md](AGENTS.md) for implementation boundaries.
