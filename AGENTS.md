# Codex guidance for Endless Rail

This repository is an early technical bootstrap, not an implemented game. Build incrementally and keep each change reviewable.

## Stack and commands
- Browser-only Three.js + TypeScript + Vite.
- Install: `npm install`.
- Development: `npm run dev`.
- Typecheck: `npm run typecheck`.
- Production build: `npm run build`.
- Preview: `npm run preview`.

## Product constraints
- Low-poly, colorful **toy** look, starting in green highlands, cherry blossom groves, and a lakeside valley. Mix green, brown, red, and other tree colors.
- Plan for seamless procedural world generation, traversable/revisitable track, villages, and varied activities.
- Multiple train types and operating modes, balanced simulation, optional failures.
- Never introduce accounts, saves, multiplayer, or a backend without new approval. Refresh must reset to initial defaults.
- Station gameplay is for later.
- Current scene is a rendering smoke test only. Do not present it as finished mechanics.

## Engineering
- Keep rendering, terrain generation, train logic, controls, and UI modular as implementation advances.
- Favor seeded/deterministic generation and bounded memory for future endless world streaming.
- Preserve touch, keyboard, and gamepad design targets, but implement and test each explicitly.
- Check with `npm run typecheck` and `npm run build` before proposing a PR.
- Work in a feature branch; do not deploy or merge to `main` automatically.
