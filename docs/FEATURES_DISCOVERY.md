# FEATURES DISCOVERY & FOUNDATION ARCHITECTURE (Phase X0)

## 1. Architectural Survey

| Subsystem | Existing Implementation | Discovery Findings & Capabilities |
|---|---|---|
| **Framework & Build** | Next.js 14.2 (App Router), TypeScript 5.4, TailwindCSS | Fast production builds, strict typing, standard zero-bundle server routes. |
| **3D Rendering** | Three.js 0.160+, WebGL2, ACES Filmic Tone Mapping | Viewport container (`#viewport-container`), camera rig (follow, orbit, top-down, fpv), canonical terrain heightfield mesh, instanced debris, detailed articulated quadruped mesh with LED load indicators. |
| **Physics & Simulation** | Deterministic 60 Hz Fixed-Step (`SimEngine.ts`, `fixedStep.ts`) | Single progress clock (`SimClock.ts`), analytical canonical terrain heightfield (`TerrainService.ts`), procedural gait kinematics (`GaitController.ts`, FABRIK/two-bone IK, spring dampers, ground stance feet). |
| **Episode Lifecycle** | Strict Two-Lifetime Architecture (`EpisodeManager.ts`, `guard.ts`) | App-scoped singletons (`InputManager`, `ShortcutRegistry`, renderer) persist indefinitely; episode-scoped resources (`SimClock`, `GaitController`, `ControlArbiter`, `CommandShaper`) reinitialize fresh per episode with async `ifCurrent` guards and per-episode `AbortController`. |
| **Control Pipeline** | Unified `LocomotionCommand` Interface | Pure pursuit autonomous policy, manual inputs (keyboard, gamepad, touch, waypoint click-to-move), `ControlArbiter.ts` critically damped blend handover, `CommandShaper.ts` gravity/slope traction limiter, and arena boundary safety layer. |
| **User Inputs** | App-Scoped `InputManager.ts` | Attached to `window` once; typing-target suppression (`isTypingTarget`); `ShortcutRegistry.ts` conflict validation; `onEpisodeStart()` latch reset. |
| **Telemetry & Replay** | `DeterministicRecorder.ts`, `ReplayCursor.ts` | Keyframe state snapshots, byte-equal checksum verification (`computeStateChecksum`), seek-to-step scrubbing, fork-to-manual take over. |
| **UI & Studio Tabs** | `AnalogLogPane.tsx` | 9-tab strip with scroll snapping and edge fades: Console, Diff & Review, Spec, Reward, Datagen, Critique, Safety, Jobs, Metrics. |
| **Missions & Environment** | `BUILT_IN_MISSIONS` (6 missions) | Medal scoring (Bronze, Silver, Gold), deterministic objectives, dynamic debris generator, terrain height brush with undo/redo. |
| **AI Integration** | Nebius Token Factory / Nemotron | Streaming spec compilation, safety gate review, token and cost tracking. |

---

## 2. Foundations Checklist (Phase X0)

- [x] **`EpisodeManager.ts`:** Idempotent `start()`, `restart()`, `end()`, `disposeAll()` with `ifCurrent` guard.
- [x] **`InputManager.ts`:** Unified single input manager; typing target suppression; episode boundary latch clearance.
- [x] **Unified Command Path:** `LocomotionCommand` is the only input reaching `GaitController.step()`.
- [x] **Seeded PRNG Module:** `lib/sim/prng.ts` with `mulberry32`, `hash32`, `dailySeed`, and `gaussian`.
- [x] **Feature Flags Module:** `lib/flags.ts` with query param overrides (`?flags=...`), default values, and `Capabilities` object.
- [x] **Build Info:** `lib/buildInfo.ts` with dynamic git SHA and build metadata.
- [x] **Golden Trace Invariant:** Verified $< 5 \times 10^{-7}$ max error against `test/golden/gait-before.json`.
- [x] **Multi-Episode Controls:** Verified across 5 consecutive episodes via `test/episode_lifecycle.test.ts`.
