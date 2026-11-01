# TASK LIST BY SPECIALIZED ENGINEERING AGENT (A–D)
**Build Stamp:** `iteration-5-dev (baseline: followup-baseline) • sha:21842619 (main) • production`  
**Date:** 2026-11-01  
**Gate:** Planning Gate (Zero Code Modifications)

---

## 1. Strict File Ownership & Agent Roles

| Agent | Subsystem Ownership | Strict File Boundaries | Assigned Work Packages |
| :--- | :--- | :--- | :--- |
| **Agent A (Locomotion)** | Kinematics, Gait & Frames | `/sim/**`, `/lib/controller-core/**`, `/lib/frames/**` | F2 (Frames & Straight Walking) |
| **Agent B (World & Camera)** | Terrain, Shaders, Rocks & Camera | `/lib/world/**`, `/components/viewer/**` | F3 (Level World), F4 (Rocks, Shadows, Rim) |
| **Agent C (Spec & Units)** | Spec Compiler, Units & HUD | `/lib/spec/**`, `/lib/telemetry/**` | F1 (Gravity Truth & Units) |
| **Agent D (QA & Evidence)** | Harness, Baselines & Gates | `/tests/**`, `/lib/debug/**`, `/scripts/**`, `/docs/**` | F0 (Baselines & Bisects), F5 (Gates & Final Verification) |

---

## 2. Agent-Specific Task Breakdowns

### Agent A: Locomotion & Dynamics Engineering
- [ ] **A1 (F2): Author Canonical Frames Module:** Create `/lib/frames/index.ts` defining right-handed Y-up world and +X forward / +Y up / +Z right robot convention.
- [ ] **A2 (F2): Migrate Coordinate Transforms:** Replace every ad-hoc `atan2`, coordinate swap, and manual quaternion flip across the runner and controller.
- [ ] **A3 (F2): Couple Body Heading:** Rotate torso orientation quaternion by true `robotHeading` + time-filtered slope reaction (gain 0.6).
- [ ] **A4 (F2): Pure Pursuit Controller:** Implement speed-dependent lookahead (0.8m to 1.4m), continuous yaw unwrapping, and yaw acceleration damping.
- [ ] **A5 (F2): Filtered Slope Orientation:** Low-pass filter stance plane pitch/roll with gain 0.6 (clamp to ±20°) to eliminate 22.4° pitch oscillations.
- [ ] **A6 (F2): Boundary Assist Bias Elimination:** Gate steering assist strictly to distances > (halfExtent - softMargin) with smooth decay.

---

### Agent B: World, Camera & Shader Engineering
- [ ] **B1 (F3): Heightfield Planar Detrend:** Implement plane-fitting subtraction in `generator.ts` to enforce arena mean tilt ≤ 1.0° and max 12m window tilt ≤ 3.0° across all seeds.
- [ ] **B2 (F3): Camera Roll Lock:** Lock camera `up` vector to `(0, 1, 0)`; eliminate all roll from camera spring rig.
- [ ] **B3 (F3): Path Tangent Follow:** Low-pass filter travel velocity tangent (tau = 0.8s) for chase camera yaw orientation.
- [ ] **B4 (F3): Terrain Clearance Clamping:** Enforce camera elevation ≥ `sampleHeight + 0.4m`.
- [ ] **B5 (F4): Shadow Frustum Expansion:** Expand directional shadow frustum to 24m with 2048 map and PCF soft filtering; ensure casters within 14m cast attached shadows.
- [ ] **B6 (F4): Lighting Contrast Calibration:** Balance key light (1.5), ambient (0.35), and fill (0.30); set `outputColorSpace = SRGBColorSpace`.
- [ ] **B7 (F4): Rock Contact Blobs & Instance Colors:** Populate `instanceColor` buffer with `#3A3A36`–`#55554E` variation; add instanced circular contact shadow blobs.
- [ ] **B8 (F4): Debris Radial Falloff:** Invert edge placement in `debris.ts` to prevent boulder accumulation at the 17.6m perimeter.
- [ ] **B9 (F4): Terrain Shader Fog Fix:** Move custom shader chunk from `<dithering_fragment>` to pre-fog chunk so contours and rim respect exponential fog.
- [ ] **B10 (F4): Distance-Fading Contours:** Implement anti-aliased world-space contours (0.25m / 1.0m) at 8% opacity fading to 0 beyond 22m.
- [ ] **B11 (F4): Dynamic Edge Distance Uniform:** Replace static world position check with `uEdgeDistance` and `smoothstep(2.5, 0.0, uEdgeDistance)` for rim red glow.

---

### Agent C: Spec, Units & HUD Engineering
- [ ] **C1 (F1): Gravity Contract Standardization:** Refactor `EnvironmentSpec.gravity` to `{ value: number, unit: "m/s2", source, displayName }`.
- [ ] **C2 (F1): SpecCompiler Unit Parser:** Parse inputs ("0.16 g", "1.62 m/s^2", "moon", "mars", "earth") and clamp minimum to 0.1 m/s² (never 0).
- [ ] **C3 (F1): HUD Gravity Index Fix:** Fix `ThreeViewer.tsx` line 584 to read vertical gravity and format as `"1.62 m/s² (0.165 g, Moon)"`.
- [ ] **C4 (F1): Telemetry & Runner Gravity Pipe:** Ensure runner kinematics, gait bob, and debris physics consume identical gravity scalar.

---

### Agent D: QA, Evidence & Gate Management
- [ ] **D1 (F0): Baseline Evidence Capture:** (Complete) Golden views, walk ladder, tilt audit, header layout audit, and visual metrics.
- [ ] **D2 (F1–F4): Test Gates Authoring:**
  - `test/walk_ladder_gates.test.ts` (L0–L5)
  - `test/gravity_truth.test.ts`
  - `test/terrain_detrend.test.ts`
  - `test/visual_metrics_gates.test.ts` (shadows, crushed blacks, red rim pixels, stripes, polylines)
- [ ] **D3 (F5): Golden Refresh & Defect Cards:** Author Defect Cards for S, G, H, R defects with before/after crops and metrics.
