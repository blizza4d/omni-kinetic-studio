# IMPLEMENTATION PLAN — BUG-FIX RELEASE: "STRAIGHT, GROUNDED, DETAILED, TRUE"
**Build Stamp:** `iteration-5-dev (baseline: bugfix-baseline) • sha:21842619 (main) • production`  
**Date:** 2026-11-01  
**Gate:** Gate 1 Baseline Review (Planning Mode)

---

## 1. Plan Structure & Gating Rules
In accordance with Section 1.1 and the Rules of Engagement:
- **Proof-Gated:** Every defect requires a failing test on `bugfix-baseline`, a passing test after fix, before/after golden screenshots at identical seed/camera/timestamp, and a plain-English user explanation.
- **Never Hide Bugs by Disabling Features:** Shadows, rocks, contours, rim glow, and beacons must be rendered properly; never turned off.
- **Single Source of Truth:**
  - One frame convention: `/lib/frames`
  - One robot kinematic spec: `RobotModelSpec v1`
  - One authoritative arena definition: `DEFAULT_ARENA`
  - One gravity unit representation: `{ value: number, unit: "m/s2" }`
- **Zero New Features:** Cloud execution, teleoperation, and learning pipelines are paused until Gate 4 is complete.

---

## 2. Phase Progression & Work Packages

### PART 0: Prove and Reproduce (COMPLETE at Gate 1)
- [x] **BF0.1 Harness & Walk Test Ladder:** Runnable ladder L0 to L5 evaluating slip, lateral error, straightness, heading error, and zero crossings (`scripts/evaluate_walk_ladder_baseline.ts`).
- [x] **BF0.2 Walk Baseline Report:** Documented L0 failure with measured metrics (`docs/WALK_BASELINE.md`).
- [x] **BF0.3 Visual Baseline & 30 Golden Screenshots:** Captured 6 golden views on 5 seeds + 60s progression on hardware GPU (`scripts/capture_bugfix_baseline.ts`).
- [x] **BF0.4 Bisect Regressions:** Traced gravity chip, shadow disappearance, and rim red glow regressions to commit `2d6716e`.
- [x] **BF0.5 Planning Gate 1 Deliverables:** Produced Defect Register, Reproduction Report, Walk Baseline, Root Causes, Implementation Plan, Task List, and Risks & Open Questions.

---

### PART I: Critical Fixes (Post-Approval)

#### **Package BF1: Gravity Truth (Agent D, with B)**
- **Files:** `/contracts/spec.ts`, `/lib/spec/compiler.ts`, `/lib/telemetry/local_runner.ts`, `/components/viewer/ThreeViewer.tsx`.
- **Changes:**
  - Standardize gravity contract as `{ value: number, unit: "m/s2", source, displayName }`.
  - Fix HUD index lookup in `ThreeViewer.tsx` line 584: read vertical gravity correctly and format as `"1.62 m/s² (0.165 g, Moon)"`.
  - Add unit parser in `SpecCompiler` supporting "0.16 g", "1.62 m/s^2", "moon", "Mars", "Earth". Clamp minimum downward gravity to 0.1 m/s² (never 0).
  - Pipe real gravity to runner kinematics and gait dynamics.
- **Verification Gate:**
  - Failing test on `bugfix-baseline`: `test/gravity_truth.test.ts`.
  - Passes after fix; HUD chip screenshot matches stated unit.

#### **Package BF2: One Frame Convention (Agent B)**
- **Files:** Create `/lib/frames/index.ts`, `/contracts/frames.ts`.
- **Changes:**
  - Pure TypeScript frame transforms: World (Y-up, right-handed), Robot (+X forward, +Y up, +Z right).
  - Yaw $\theta$ rotates +X to $(\cos\theta, 0, -\sin\theta)$; `headingFromVector(v) = atan2(-v.z, v.x)`.
  - Continuous yaw unwrap, shortest-angle difference, and documented Euler/quaternion composition.
  - Migrate `local_runner.ts`, `ThreeViewer.tsx`, and radar to use `/lib/frames` exclusively. Remove all ad-hoc coordinate swaps.
- **Verification Gate:**
  - 1,000 random orientation round-trips within $10^{-6}$; forward-vector identity test; chirality test.

#### **Package BF3: Straight Walking & Locomotion (Agent B, with D)**
- **Files:** `/lib/controller-core/`, `/lib/telemetry/local_runner.ts`.
- **Changes:**
  - Command velocity strictly along body forward vector in autonomous mode.
  - Rotate torso orientation quaternion by true `robotHeading` + time-filtered terrain pitch/roll (gain 0.6).
  - Pure pursuit lookahead (0.8m to 1.4m) with heading PD controller and yaw acceleration limits.
  - Remove winding corridor modulation from generator; ensure straight route reachability.
  - Fix boundary assist half-extent: zero bias when distance > softMargin + 1m.
- **Verification Gate:**
  - Walk Test Ladder: L0 slip P95 ≤ 2.0°, straightness ≥ 0.995; L1 slip P95 ≤ 2.0°; L2 slip P95 ≤ 4.0°.

#### **Package BF4: Terrain Tilt Detrend (Agent A, with C)**
- **Files:** `/lib/world/terrain/generator.ts`, `/lib/world/terrain/field.ts`.
- **Changes:**
  - Subtract best-fit least-squares plane from heightfield after noise synthesis.
  - Re-apply flat-zone blending at spawn and goal.
  - Cap arena mean planar tilt at $\le 1.0^\circ$ and max 12m window tilt at $\le 3.0^\circ$.
- **Verification Gate:**
  - 100-seed tilt audit passes with mean tilt P95 ≤ 1.0° and max window tilt ≤ 3.0°.

#### **Package BF5: Camera Roll Lock & Path Tangent Follow (Agent C)**
- **Files:** `/components/viewer/ThreeViewer.tsx`.
- **Changes:**
  - Lock camera `up` vector strictly to world up `(0, 1, 0)`; eliminate all rig roll.
  - Drive camera yaw from low-passed velocity tangent (time constant ~0.8s) instead of instant mouse yaw.
  - Clamp camera position to `terrainHeight(camX, camZ) + 0.4m` to prevent ridge clipping.
- **Verification Gate:**
  - `getHorizonTilt()` ≤ 0.5° and image horizon fit ≤ 1.0° across all golden seeds.

#### **Package BF6: Rim, Fog & Stripe Elimination (Agent A, with C)**
- **Files:** `/components/viewer/ThreeViewer.tsx` (terrain shaders).
- **Changes:**
  - Move terrain shader customizations from `<dithering_fragment>` to proper pre-fog chunks (`#include <fog_fragment>`).
  - Add uniform `uEdgeDistance` and `uSoftMargin`: brick red glow is computed as `smoothstep(softMargin, 0, uEdgeDistance)` (strictly 0 beyond 2.5m).
  - Contour lines: anti-aliased with `fwidth`, opacity 6-10%, fading to 0 beyond 22m.
- **Verification Gate:**
  - Red-pixel count < 20 at distance 13m; polyline score ≤ 0.01; stripe score ≤ 1.5.

#### **Package BF7: Rocks & Shadows Restoration (Agent A, with C)**
- **Files:** `/lib/world/debris.ts`, `/components/viewer/ThreeViewer.tsx`.
- **Changes:**
  - Expand directional shadow frustum from 13m to 24m with soft PCF; ensure robot and rocks within 14m cast shadows.
  - Add radial density falloff near rim in `generateDebrisField` (no dense wall at 17.6m).
  - Add 6 distinct displaced icosahedron rock geometries (no low-poly repetition).
  - Add `instanceColor` variation (base `#3A3A36` to `#55554E`, lighter top face normal gradient).
  - Add cheap contact shadow blobs under rocks.
  - Tune lighting balance: directional light 1.5, ambient 0.35, fill 0.30 (restore depth & contrast).
- **Verification Gate:**
  - Min rock luminance > 6%; top-to-ground ratio 1.25 to 2.2; visible attached shadows; I1 invariant passes.

#### **Gate 2 Review:**
- 60-second default-camera recording on production build demonstrating straight walking, level horizon, truthful gravity chip, shadowed varied rocks, faint dashed rim with zero red at distance, and no stripes.

---

### PART II: The Rest of the Register

#### **Package BF8: Detailed Robot Model (Agent C, with B)**
- **Files:** `/lib/robot-model/spec.ts`, `/components/viewer/ThreeViewer.tsx`, `/app/debug/robot/page.tsx`.
- **Changes:**
  - Single-source-of-truth `RobotModelSpec v1` generating both controller IK/FK and Three.js mesh.
  - Beveled chassis shell with recessed cream accent panel, front stereo camera sensor head with sage rings, rear lidar puck, side vents, actuator housings at all 12 joints, tapered sturdy legs, rubber foot pads with compliant ankle shocks, and telemetry LED strips.
  - Procedural PMREM gradient environment map for metallic reflections.
  - Decal footprint trail (InstancedMesh) fading over 20s.
  - LOD0 (≤ 25k tris, ≤ 30 draw calls), LOD1 (≤ 6k tris), LOD2 (≤ 1.5k tris).
- **Verification Gate:**
  - `robot-fk-parity` test passes (all 4 feet within 5mm across 1,000 joint configs).

#### **Package BF9: Terrain Shading & Crater Readability (Agent A)**
- **Files:** `/lib/world/terrain/generator.ts`, `/components/viewer/ThreeViewer.tsx`.
- **Changes:**
  - Smooth vertex normals via central difference grid sampling; regolith micro-normal.
  - Enhanced crater shader with lit rims, darker bowls, and convex highlights (≥ 8 readable bowls).
- **Verification Gate:**
  - Facet audit passes; terrain render cost ≤ 1.0 ms.

#### **Package BF10: Grounded Goal Marker & Safe Placement (Agent A, with B)**
- **Files:** `/components/viewer/ThreeViewer.tsx`, `/lib/spec/compiler.ts`.
- **Changes:**
  - Replace large cone with ground ring (cream-dim, 0.6m radius) and soft light column (opacity 0.25, height 2.5m).
  - Raycast base directly onto terrain surface (`sampleHeight`).
  - Constrain goal placement: 8m to 30m from spawn, at least 4m inside arena edge.
- **Verification Gate:**
  - Base touches terrain within 1cm; path planning reachability verified.

#### **Package BF11: Readable & Synchronized Radar (Agent E)**
- **Files:** `/components/viewer/ThreeViewer.tsx`, `/components/radar/RadarWidget.tsx`.
- **Changes:**
  - Transform radar debris and hillshade relative to robot position, eliminating world/robot desync.
  - Filter out pebbles under 0.12m from radar (dots < 500); size dots proportionally to boulder scale.
  - Rotate robot heading arrow dynamically via `ctx.rotate(robotHeading)`.
  - Draw planned path (dashed cream) and fading footprint trail (sage).
  - Add 10m scale bar and coordinate axis.
- **Verification Gate:**
  - Radar positions match 3D viewport within 0.5m; update time ≤ 1.5ms.

#### **Package BF12: Header Spacing, Honest Badge & Empty Tabs (Agent E, with G)**
- **Files:** `/components/shell/Shell.tsx`, `/components/shell/FpsBadge.tsx`, `/components/shell/AnalogLogPane.tsx`.
- **Changes:**
  - Apply `gap-2` (≥ 6px) with `min-w-0` and responsive collapse rules to header; add full title tooltip.
  - Filter `FpsBadge` long tasks to 60-second rolling steady-state window (>50ms after first 5s); tag startup tasks in P panel.
  - Add truthful empty states with icons, sentences, and actions for Spec, Reward, Datagen, Critique tabs.
  - Stream Architect stage transition events to Console log.
- **Verification Gate:**
  - Zero header chip collisions at 1280px, 1440px, 1920px; steady-state long tasks badge is 0.

#### **Package BF13: Steady-State Long Tasks Elimination (Agent F, with A, C)**
- **Files:** `/lib/perf/probe.ts`, `/lib/world/terrain/generator.ts`.
- **Changes:**
  - Move heavy terrain heightfield generation to worker or slice across initial ticks.
- **Verification Gate:**
  - Zero steady-state long tasks and zero console errors over 5-minute production run.

#### **Gate 3 Review:**
- Updated Defect Register with all items fixed, all Defect Cards attached, and before/after views across 5 seeds.

---

### PART III: Bug Bash & Hardening

- **Package BF14:** Scripted exploratory bug bash driving 12 scenarios (`docs/BUG_BASH.md`).
- **Package BF15:** Triage and fix newly found defects.
- **Package BF16:** CI test gates (Ladder L0-L5, tilt, visual metrics, gravity consistency, FK parity).
- **Package BF17:** Final golden screenshot refresh and `CHANGELOG.md` / `FIXES.md`.
- **Gate 4 Review:** Final release sign-off.
