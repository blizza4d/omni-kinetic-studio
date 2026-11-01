# SHORT IMPLEMENTATION PLAN — "STRAIGHT, LEVEL, TRUE"
**Build Stamp:** `iteration-5-dev (baseline: followup-baseline) • sha:21842619 (main) • production`  
**Date:** 2026-11-01  
**Gate:** Planning Gate (Zero Code Modifications)

---

## 1. Focused Fix Scope & Gating Rules
- **Proof-Gated:** Every defect requires a failing test on `followup-baseline`, a passing test after fix, before/after golden screenshots at identical seed/camera/timestamp, and a plain-English user explanation.
- **Never Hide Bugs by Disabling Features:** Shadows, rocks, contours, and rim glow must be rendered properly; never turned off.
- **No Feature Creep:** Cloud execution, teleoperation, learning pipelines, and robot-model detail work are strictly deferred.

---

## 2. Work Packages (F0 to F5)

### **Package F0: Evidence and Baseline (Agent D) — [COMPLETE]**
- [x] Run Walk Test Ladder L0–L5 on `followup-baseline` (`scripts/evaluate_walk_ladder_baseline.ts`).
- [x] Capture 30 golden screenshots across 5 seeds + 60s run progression (`scripts/capture_bugfix_baseline.ts`).
- [x] Run 100-seed terrain tilt audit (`scripts/audit_terrain_tilt_baseline.ts`).
- [x] Run Python visual metrics audit (`scripts/audit_visual_metrics.py`).
- [x] Bisect gravity chip, shadow, and rim regressions to commit `2d6716e`.

---

### **Package F1: Gravity Truth (Agent C)**
- **Ownership:** Agent C (`/lib/spec`, `/lib/telemetry`).
- **Implementation:**
  - Standardize gravity representation as `{ value: number, unit: "m/s2", source, displayName }`.
  - Fix HUD index lookup in `ThreeViewer.tsx` line 584: read vertical gravity and format as `"1.62 m/s² (0.165 g, Moon)"`.
  - Add unit parser in `SpecCompiler` supporting "0.16 g", "1.62 m/s^2", "moon", "mars", "earth". Clamp minimum to 0.1 m/s² (never 0).
  - Pipe real gravity to runner kinematics and gait dynamics.
- **Acceptance Gate:**
  - Failing test on `followup-baseline`: `test/gravity_truth.test.ts`.
  - Consistency test passes: HUD, spec, runner, telemetry meta all agree.

---

### **Package F2: Frames and Straight Walking (Agent A)**
- **Ownership:** Agent A (`/sim`, `/lib/controller-core`, `/lib/frames`).
- **Implementation:**
  - Create canonical `/lib/frames` module: World (Y-up, right-handed), Body (+X forward, +Y up, +Z right).
  - Migrate `local_runner.ts` and `ThreeViewer.tsx`: eliminate ad-hoc coordinate swaps.
  - Couple body orientation to velocity heading: rotate torso quaternion by true `robotHeading` + time-filtered slope reaction (gain 0.6).
  - Implement PD pure pursuit lookahead ($0.8\text{ m}$ to $1.4\text{ m}$) with continuous yaw unwrapping.
  - Remove winding corridor modulation from generator; guarantee straight line path reachability.
  - Clamp boundary assist bias to zero beyond soft margin plus 1m.
- **Acceptance Gate (Ladder Rungs):**
  - **L0:** Slip P95 ≤ 2.0°, max lateral error ≤ 0.05m, straightness ≥ 0.995, roll/pitch RMS ≤ 1.0°.
  - **L1:** Slip P95 ≤ 2.0°, arrival within 0.5m.
  - **L2:** Slip P95 ≤ 4.0°, lateral error P95 ≤ 0.12m, straightness ≥ 0.95.
  - **L3:** Straightness ≥ 0.90 where line exists.
  - **L4 (100 seeds):** Success ≥ 90%, slip P95 ≤ 6.0°.
  - **L5:** Lunar and Earth both pass L0/L2 bounds.
  - Video check: straight-line fit residual < 0.1m on 30s recording.

---

### **Package F3: Level World (Agent B)**
- **Ownership:** Agent B (`/lib/world`, `/components/viewer`).
- **Implementation:**
  - Subtract best-fit least-squares plane from canonical heightfield after noise synthesis.
  - Cap arena mean planar tilt at $\le 1.0^\circ$ and max 12m window tilt at $\le 3.0^\circ$ across 100 seeds.
  - Lock camera `up` vector strictly to world up `(0, 1, 0)`; eliminate rig roll.
  - Follow low-passed path tangent for chase camera yaw orientation.
  - Clamp camera position to `terrainHeight + 0.4m`.
- **Acceptance Gate:**
  - `getHorizonTilt()` ≤ 0.5° and image horizon fit ≤ 1.0° across golden seeds and turns.
  - Mean plane tilt ≤ 1.0° and max window tilt ≤ 3.0° on 100 seeds.

---

### **Package F4: Rocks, Shadows, Rim (Agent B)**
- **Ownership:** Agent B (`/lib/world`, `/components/viewer`).
- **Implementation:**
  - Expand directional shadow frustum from 13m to 24m with soft PCF; ensure robot and rocks within 14m cast shadows.
  - Invert debris edge placement to eliminate boulder accumulation at 17.6m rim.
  - Populate `instanceColor` buffer with `#3A3A36`–`#55554E` variation; add instanced circular contact shadow blobs.
  - Rebalance lighting: key light 1.5, ambient 0.35, fill 0.30; set `outputColorSpace = SRGBColorSpace`.
  - Move terrain shader chunk from `<dithering_fragment>` to pre-fog chunk (`#include <fog_fragment>`).
  - Add uniform `uEdgeDistance`: brick red glow computed as `smoothstep(2.5, 0, uEdgeDistance)` (strictly 0 beyond 2.5m).
  - Anti-aliased shader contours (6-10% opacity) fading to 0 beyond 22m.
- **Acceptance Gate:**
  - Min rock luminance > 6%; top-to-ground ratio 1.25 to 2.2; visible attached shadows; I1 invariant passes.
  - Red-pixel count < 20 at distance 13m; polyline score ≤ 0.01; stripe score ≤ 1.5.

---

### **Package F5: Final Gate Review**
- Deliver Defect Cards, before/after golden screenshots at 5 seeds, ladder report, and 60-second production recording demonstrating all 4 problems resolved.
