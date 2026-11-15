# Omni-Kinetic Studio: Code Discovery, Defect Analysis & Reproduction Report (Phase V0)

**Date:** 2026-11-15  
**Target URL:** https://omni-kinetic-studio.vercel.app/  
**Repository:** `blizza4d/omni-kinetic-studio`  
**Viewport Evaluated:** 1917 × 892 px, Quality Tier `HIGH`, Simulation Time $t = 2.0\text{s}$

---

## 1. Architectural Architecture & File Map

### 1.1 Technology Stack
- **Framework:** Next.js 14.2.24 (App Router), React 18, TypeScript (strict), Tailwind CSS.
- **3D Graphics Engine:** Direct imperative Three.js (v0.169.0) inside `components/viewer/ThreeViewer.tsx`.
- **Simulation & Telemetry Layer:**
  - Client runner: `lib/telemetry/local_runner.ts` (`LocalSimulationRunner`).
  - Off-React Telemetry Store: `lib/telemetry/store.ts` (`TelemetryStore`).
  - Telemetry Jitter Buffer & Pacer: `lib/telemetry/jitter_buffer.ts`, `lib/sim/framePacer.ts`.
  - SSE Streaming Route: `app/api/jobs/stream/route.ts`.
- **Procedural Locomotion & Kinematics:**
  - Gait Engine: `lib/droid/gait/GaitController.ts`, `FootPlanner.ts`, `GaitParams.ts`, `Phase.ts`.
  - Inverse Kinematics: `lib/droid/ik/TwoBoneIK.ts`, `lib/anim/ik/twoBoneIK.ts`.
  - Center of Mass & Attitude: `lib/droid/body/CenterOfMass.ts`.
  - Visual Rig Applier: `lib/droid/render/RigApplier.ts`.
- **Environment & World:**
  - Canonical Terrain: `lib/world/terrain/field.ts`, `lib/world/terrain/generator.ts`.
  - Debris Field: `lib/world/debris.ts`.
  - Spatial Boundaries: `lib/world/bounds.ts`.
- **UI Shell & Header:**
  - Workstation Shell: `components/shell/Shell.tsx`.
  - Architect Log & Tabs: `components/shell/AnalogLogPane.tsx`.
  - Performance Instrumentation: `lib/perf/probe.ts`, `components/shell/FpsBadge.tsx`, `PerfPanel.tsx`.
  - Build Identity: `lib/build_stamp.ts`, `contracts/build_stamp.ts`.

---

## 2. Screenshot Defect Analysis & Root Causes (S-01 to S-16)

| Defect ID | Title | Verified Root Cause | Impact |
| :--- | :--- | :--- | :--- |
| **S-01** | Droid appears airborne with splayed, disconnected legs | In `ThreeViewer.tsx` joint rotation assignment, `thighGroup.rotation.z` was set to `-angle` and `hipGroup.rotation.x` to `+angle`. This inverted both hip roll and thigh pitch, flipping the legs backwards and upwards ($y_{\text{foot}} = +0.10\text{m}$ above hip), creating an unnatural hovering/collapsed pose. | **CRITICAL** |
| **S-02** | Floating white ellipses near feet | `footBlobsRef` in `ThreeViewer.tsx` set blob position to swinging foot elevation (`foot.pos[1] + 0.012`) and changed color to white (`0xfdfbf7`) when not in contact, rather than clamping contact shadows to the terrain surface with normal alignment. | **HIGH** |
| **S-03** | Thin wire/line trailing from droid | `trailLineRef` in `ThreeViewer.tsx` continuously drew a raw world-space `THREE.Line` from spawn $(0, 0)$ to the robot without terrain draping or debug gating. | **MEDIUM** |
| **S-04** | Radar is an unreadable field of white noise | `initOffscreenRadar` rendered 1,800 debris dots plus raw per-pixel noise onto a 116×116 canvas. In addition, the robot arrow was hardcoded at $(cx, cy)$ without heading rotation `ctx.rotate(heading)`, ignoring actual robot orientation. | **HIGH** |
| **S-05** | Top bar overlaps and crowds | Header flex children lacked `min-width: 0` isolation; "Task Prompt" button overflowed "Policy v1"; scenario title truncated aggressively at `max-w-[110px]` even with ample viewport width. | **HIGH** |
| **S-06** | Tab bar clipped & tabs unreachable | `AnalogLogPane.tsx` fixed container width ($420\text{px}$) truncated the 9-tab row at "Saf" (Safety), leaving Safety, Jobs, and Metrics clipped with no scroll arrows or "More" dropdown. | **HIGH** |
| **S-07** | Left panel & header proportions | Left panel lacked a resizable splitter, persistence, and virtualized scrolling for high log counts. | **MEDIUM** |
| **S-08** | White dashed artifacts along horizon | `buildCanonicalTerrainMesh` shader rendered an unaliased hard boundary dash at 18m without distance attenuation or `fwidth` antialiasing; extreme near/far depth ratio exacerbated grazing-angle z-fighting. | **HIGH** |
| **S-09** | Rocks render as flat black silhouettes | Debris boulder material had flat shading, distorted vertex normals, zero ambient ground bounce, and lacked high-contrast lunar sun/shadow separation. | **HIGH** |
| **S-10** | Flat monochrome scene with weak depth cues | Thick `FogExp2` grayed out the sky and background. On an airless lunar world, the sky should be pitch black with faint stars, illuminated by a hard directional sun and subtle regolith bounce. | **HIGH** |
| **S-11** | Clipped light cone & ellipse at right edge | Goal beacon cylinder and torus at $(14, 0, -10)$ floated above the ground and clipped the camera frustum at grazing angles. | **MEDIUM** |
| **S-12** | Droid small & camera framing wastes space | Default chase camera sat at $5.0\text{m}$ distance, leaving the droid occupying $< 10\%$ of viewport height instead of the $16\%\text{–}22\%$ rule-of-thirds target. | **MEDIUM** |
| **S-13** | Red "1 long task" chip in steady state | `PerfProbe.ts` counted one-time startup tasks (shader compilation) in an unbounded array without a sliding 60s window or startup vs steady-state classification. | **MEDIUM** |
| **S-14** | Version string redundancy | `lib/build_stamp.ts` concatenated `v1.0.0-production` with `production`, printing duplicate environment tokens. | **LOW** |
| **S-15** | Mixed terminology | Inconsistent run-mode nomenclature between "Local physics streaming" and "DEMO: LOCAL RUNNER". | **LOW** |
| **S-16** | Ambiguous progress indicators | Scrubber showed raw seconds ($t=2.0\text{s}$) while console showed ambiguous percentage without episode total duration context. | **LOW** |

---

## 3. Deterministic Reproduction Harness

To deterministically reproduce the state captured in the user screenshot:
- **URL Parameters:** `?debug=1&seed=1&t=2.0&camera=default&tier=high&paused=1`
- **Global Test Hook:** `window.__omniDebug` exposes:
  - `getState()`: Live droid position, orientation quaternion, per-foot clearance, contact flags, joint angles, active decals, radar marks.
  - `captureTrace(durationSec, hz)`: Returns deterministic sample trajectory.
