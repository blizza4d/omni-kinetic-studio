# Omni-Kinetic Studio v2 — Discovery & Baseline Audit (`V2_DISCOVERY.md`)

**Date:** November 18, 2026  
**Repository:** `blizza4d/omni-kinetic-studio`  
**Stack:** Next.js 14.2.24 (App Router), React 18, TypeScript 5.7, Tailwind CSS 3.4, Three.js 0.174, Zod 3.24, Lucide Icons, Node Test Runner (`tsx --test`)

---

## 1. Architecture & File Map

### 1.1 Entrypoints & Shell
- `app/layout.tsx`, `app/page.tsx`: App Router shell loading `components/shell/Shell.tsx`.
- `components/shell/Shell.tsx`: Root studio layout — top flex header bar, resizable left `AnalogLogPane`, right 3D `ThreeViewer` viewport, keyboard shortcut handler (`keydown`), SSE telemetry stream client (`/api/jobs/stream`), and modal overlays (`CommandPalette`, `PerfPanel`, `ShortcutsOverlay`, `TokenSpendPopover`, `TeleopOverlay`, `DatasetPanel`, `DeltaComparisonCard`, `GaitLab`).
- `components/shell/AnalogLogPane.tsx`: Left drawer containing 9 tabs (`Console`, `Diff & Review`, `Spec`, `Reward`, `Datagen`, `Critique`, `Safety`, `Jobs`, `Metrics`), log filter input, live progress bar, and virtualized log list.
- `components/shell/FpsBadge.tsx`, `components/shell/PerfPanel.tsx`: Frame-time metrics (`p50`/`p95`), quality tier selector (`low`/`medium`/`high`/`ultra`), and steady-state long task probe (`lib/perf/probe.ts`).

### 1.2 3D Viewport, Terrain & World
- `components/viewer/ThreeViewer.tsx`: Main WebGL renderer, lighting (low-angle key directional light + hemisphere ambient fill + ACES filmic tone mapping), starfield + dark lunar sky (`0x0c0c0c`), procedural canonical terrain mesh with custom fragment shader (`onBeforeCompile`), 4×4 chunked instanced boulders (`lib/world/debris.ts`), 12-DOF quadruped mesh (`build12DOFQuadruped`), ghost comparison mesh, foot contact blobs (`buildFootContactBlobs`), trail line (`trailLineRef`), goal beacon (`buildGoalMarker`), ballistic dust particles (`lib/droid/fx/DustPuffs.ts`), follow/orbit/top-down/side camera rig (`lib/camera/follow_camera.ts`), offscreen/live 2D radar canvas (`initOffscreenRadar` / `drawRadar`), and bottom playback scrubber.
- **CRITICAL DEFECT DISCOVERED — DUAL TERRAIN SAMPLER MISMATCH:**
  - `lib/world/terrain/generator.ts` (`generateCanonicalTerrain` → `TerrainField.sampleHeight(x, z)`) is used by **`ThreeViewer.tsx`** to build the 3D terrain mesh, place instanced boulders, place the goal beacon, clamp foot contact blobs, and render the radar hillshade.
  - `lib/world/terrain.ts` (`getTerrainHeight(x, z)`) is a **completely different fBm + sine function** used by **`lib/telemetry/local_runner.ts`** (`LocalSimulationRunner`) and `lib/spec/compiler.ts`.
  - **Consequence:** The physics/gait runner walked on an invisible phantom terrain 0.30m–0.80m above or below the rendered 3D terrain mesh! Meanwhile, `ThreeViewer.tsx` clamped the olive-green foot contact blobs (`buildFootContactBlobs`) to `canonicalFieldRef.current.sampleHeight()`, causing the robot's body and feet to visually float high in mid-air above the olive-green contact discs on the ground.

### 1.3 Simulation, Kinematics & Gait
- `lib/telemetry/local_runner.ts`: Server-side `LocalSimulationRunner` invoked by `app/api/jobs/stream/route.ts` via Server-Sent Events (30-frame batches every 500ms). Runs hardcoded autonomous pure pursuit from `(0, 0)` to `(14, -10)`.
- `lib/telemetry/store.ts`: Singleton `TelemetryStore` ring buffer (6,000 frames) holding received frames outside React state.
- `lib/telemetry/jitter_buffer.ts`: `TelemetryJitterBuffer` smooths 500ms SSE bursts into display-rate interpolated poses.
- `lib/droid/gait/GaitController.ts`, `GaitParams.ts`, `Phase.ts`, `FootPlanner.ts`, `lib/droid/body/CenterOfMass.ts`, `lib/droid/ik/TwoBoneIK.ts`, `lib/droid/render/RigApplier.ts`, `lib/droid/secondary/SecondaryMotion.ts`: Quadruped gait kinematics.
- `lib/frames/index.ts`: Single Frame Convention (Right-handed Y-up world: +X East, +Y Up, +Z South; Body: +X forward, +Y up, +Z right; yaw $\theta$ maps +X to $(\cos\theta, 0, -\sin\theta)$).
- `lib/anim/math/*`: `spring.ts`, `minJerk.ts`, `inertialize.ts`, `oneEuro.ts`, `quaternion.ts`, `smoothing.ts`, `command_shaper.ts`.
- `lib/sim/fixedStep.ts`, `lib/sim/framePacer.ts`: Fixed timestep loop and frame pacer primitives (exist in `lib/sim/` but not yet wired into an interactive browser-side simulation loop).

### 1.4 Current Control & Teleop Path (Gap Analysis)
- `components/teleop/TeleopOverlay.tsx`: Modal webcam CV hand-tracking UI (`workers/vision/vision.worker.ts`) with a limb-tip virtual keyboard fallback. It calls `onCommand(cmd)` in `Shell.tsx`, which only sets React state `teleopCommand` — **never reaching the locomotion controller or driving the droid**.
- No keyboard driving (`WASD` / Arrows), no Gamepad API polling, no touch virtual joystick, no click-to-move waypoint driving, no pointer drive, no unified `ControlArbiter`, no shared `ShortcutRegistry`, and no client-side deterministic simulation loop for <100ms input latency.

---

## 2. Root Cause Mapping of Screenshot Defects (`R-01` – `R-09`)

| ID | Defect | Root Cause Located in Code |
|----|--------|----------------------------|
| **R-01** | Console shows `t=7.0s / 16.7s (6%)` while bottom bar shows `(42%)` | `AnalogLogPane.tsx:338` displays `activeJobStatus.progress` (computed over `duration=120s` in `app/api/jobs/stream/route.ts`) next to `episodeLength / 60 = 16.7s`, whereas `ThreeViewer.tsx` computes `t / 16.7s`. No single `SimClock` source of truth. |
| **R-02** | Mixed run-mode wording (`LOCAL SIMULATION` vs `Local physics streaming ... [DEMO: LOCAL RUNNER]`) | Hardcoded legacy strings in `app/api/jobs/stream/route.ts`, `lib/cloud/job_store.ts`, `JobCard.tsx`, `CommandPalette.tsx`, `RunSummaryCard.tsx`. |
| **R-03** | Unlabeled olive-green ground ellipses + long white line; floating droid | (1) Terrain mismatch between `LocalSimulationRunner` (`lib/world/terrain.ts`) and `ThreeViewer` (`lib/world/terrain/generator.ts`) causes the droid to float ~0.4m above its olive-green foot contact blobs (`buildFootContactBlobs`). (2) `trailLineRef` draws an unlabeled solid cream wire across the ground. |
| **R-04** | Faint white squiggly lines on terrain | `ThreeViewer.tsx:1053-1061` uses un-smoothed hard threshold `if (fMajor < 1.0)` / `if (fMinor < 0.7)` on `vWorldPos.y` contours, producing aliased jagged lines. |
| **R-05** | Small busy radar (`130px`), no range rings, no legend | `ThreeViewer.tsx` draws a `130×130` canvas with raw scattered dots and a single bright goal dot, lacking range rings (10m/20m), density aggregation, size toggle, legend popover, or text alternative. |
| **R-06** | Clipped partial tab glyph after "Datagen" | `AnalogLogPane.tsx` tab strip overflows horizontally without snap alignment, edge fade masks, disabled boundary arrows, or an overflow "More" menu. |
| **R-07** | No visible user control | Simulation is passive server-streamed SSE; `TeleopOverlay` does not drive locomotion; no on-screen control HUD, keyboard/gamepad/touch/click-to-move inputs, or interactive camera controls. |
| **R-08** | Short 16.7s episode with no end behavior | Default `episodeLength = 1000` ticks (16.7s) with no end-of-episode behavior setting (`stop`/`loop`/`auto-restart`) or interactive Results Card. |
| **R-09** | Stiff droid body and stick legs | `build12DOFQuadruped` uses a plain box + thin sticks with minimal hip mounts; gait lacks user-controlled maneuvers (spin, reverse, strafe, charge-hop ballistics, crouch/stand, inertialized gait switches, body weight shift, and secondary motion). |
| **Build SHA** | Console always prints `sha:21378b3` in browser | `lib/build_stamp.ts:22` reads `VERCEL_GIT_COMMIT_SHA` (server-only env var) and falls back to hardcoded `'21378b3'` in client bundles because `next.config.mjs` does not inject `NEXT_PUBLIC_GIT_SHA`. |

---

## 3. Baseline Measurements (Executed Before v2 Changes)

- **Existing unit test suite:** 90 / 90 tests passing (`npx tsx --test test/*.test.ts`).
- **Terrain height discrepancy at $(x=4.0, z=-3.0)$, seed 42:**
  - `lib/world/terrain.ts:getTerrainHeight(4, -3)` vs `generateCanonicalTerrain(42).sampleHeight(4, -3)`: diverges by **> 0.35m** across the crater floor, directly causing the visible mid-air floating defect.
- **Input-to-motion latency (baseline):** $\infty$ (no interactive locomotion command pipeline; server-side SSE batch interval is 500ms).
- **Production bundle first-load JS (`/`):** 425 kB (`next build`).
