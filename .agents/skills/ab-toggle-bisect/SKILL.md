---
name: ab-toggle-bisect
description: Standard operational procedure for systematically bisecting rendering and UI performance bottlenecks using query param feature toggles.
---

# A/B Toggle Bisect Skill

## Purpose
Systematically isolate the individual performance cost (in ms/frame, draw calls, and long tasks) of each visual subsystem:
- `?shadows=off` (disables directional shadow map and shadow casting)
- `?debrisPhysics=off` (disables dynamic debris collision checking)
- `?physics=off` (disables all physics simulation)
- `?radar=off` (disables 2D canvas radar redraw)
- `?glass=off` (replaces backdrop-filter blur with solid dark fill)
- `?dpr=1` (caps device pixel ratio to 1.0)
- `?debris=0` | `?debris=400` | `?debris=800` (alters instanced debris density)
- `?particles=off` (disables drifting atmospheric dust particles)
- `?grid=off` (disables contour terrain grid helper)
- `?trail=off` (disables motion ribbon updates)
- `?hud=off` (disables all HUD chips and telemetry readouts)

## Procedure
1. Ensure the production build is running: `npm run build && npm run start`.
2. Run baseline benchmark for 60 seconds with all features on (`http://localhost:3000`).
3. Sequentially invoke Puppeteer benchmark for each individual toggle.
4. Record p50, p95 frame time delta ($\Delta \text{ms}$) compared to baseline.
5. Rank subsystems in the "Cost by Subsystem" table and output `docs/PERF_BASELINE.md`.
