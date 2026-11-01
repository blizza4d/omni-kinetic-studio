# TASK LIST BY SPECIALIZED ENGINEERING AGENT (A–G)
**Build Stamp:** `iteration-5-dev (baseline: bugfix-baseline) • sha:21842619 (main) • production`  
**Date:** 2026-11-01  
**Gate:** Gate 1 Baseline Review (Planning Mode)

---

## 1. Strict File Ownership & Agent Roles

| Agent | Subsystem Ownership | Strict File Boundaries | Assigned Defect Packages |
| :--- | :--- | :--- | :--- |
| **Agent A** | Terrain & Debris | `/lib/world/terrain/**`, `/lib/world/debris.ts`, terrain shaders in `/components/viewer/` | BF4 (Tilt Detrend), BF6 (Rim Shader & Fog), BF7 (Debris Falloff & Rocks), BF9 (Crater Shading), BF10 (Goal Grounding) |
| **Agent B** | Locomotion & Kinematics | `/sim/**`, `/lib/controller-core/**`, `/lib/frames/**`, `/lib/world/bounds.ts` | BF2 (Frame Convention), BF3 (Straight Walking & PD Pure Pursuit), BF8 (Kinematic FK Parity) |
| **Agent C** | Viewer, Model, Lighting & Camera | `/components/viewer/**`, `/lib/robot-model/**`, camera rig & directional shadow rig | BF5 (Camera Roll Lock & Tangent Follow), BF6 (Fog Integration), BF7 (Shadow Rig & Lighting Balance), BF8 (Detailed Robot Mesh, AO, Environment Map & Footprints) |
| **Agent D** | Spec, Units & Telemetry | `/lib/spec/**`, `/lib/telemetry/**`, `/lib/clock/**`, `/contracts/**` | BF1 (Gravity Truth & Units), BF2 (Telemetry Frame v4 migration), BF3 (Playhead & Yaw Unwrapping) |
| **Agent E** | Shell, Radar & UI | `/components/shell/**`, `/components/radar/**`, `/styles/**` | BF11 (Radar Hillshade & Synchronized Dynamic Arrow), BF12 (Header Flex Spacing, Title Tooltip, Honest Steady-State Badge & Tab Empty States) |
| **Agent F** | QA, Harness & Baselines | `/tests/**`, `/lib/perf/**`, `/lib/debug/**`, `/scripts/**`, `/docs/**`, `/app/status/**` | BF0 (Walk Ladder, Visual Audits, Baseline Report, Regression Bisects), BF13 (Long Task Profiling), BF14–BF17 (Bug Bash, CI Gates, Golden Refresh) |
| **Agent G** | Architect Visibility | `/lib/nebius/**`, `/lib/safety/**`, `/app/api/architect/**`, `/app/api/logs/**` | BF12 (Stage transition streaming to Console, compile report rendering, fixture provenance badges, run summary card) |

---

## 2. Agent-Specific Task Breakdowns

### Agent A: Terrain & Debris Engineering
- [ ] **A1 (BF4): Heightfield Detrend:** Implement plane-fitting subtraction in `generator.ts` to enforce arena mean tilt ≤ 1.0° and max 12m window tilt ≤ 3.0° across all seeds.
- [ ] **A2 (BF6): Terrain Shader Fog Fix:** Move custom shader chunk from `<dithering_fragment>` to pre-fog chunk so contours and rim respect exponential fog.
- [ ] **A3 (BF6): Distance-Fading Contours:** Implement anti-aliased world-space contours (0.25m / 1.0m) at 8% opacity fading to 0 beyond 22m.
- [ ] **A4 (BF6): Dynamic Edge Distance Uniform:** Replace static world position check with `uEdgeDistance` and `smoothstep(2.5, 0.0, uEdgeDistance)` for rim red glow.
- [ ] **A5 (BF7): Debris Radial Falloff:** Invert edge placement in `debris.ts` to prevent boulder accumulation at the 17.6m perimeter.
- [ ] **A6 (BF7): Varied Rock Geometries:** Implement 6 distinct displaced icosahedron generators (displaced noise, fractured facets, flat bases).
- [ ] **A7 (BF9): Crater Readability:** Add convex rim highlights and concave shadowed floors to primary craters (≥ 8 bowls readable from top-down).
- [ ] **A8 (BF10): Goal Raycasting:** Ensure goal marker base is positioned strictly via `field.sampleHeight(goalX, goalZ)`.

---

### Agent B: Locomotion & Dynamics Engineering
- [ ] **B1 (BF2): Canonical Frames Module:** Author `/lib/frames/index.ts` defining right-handed Y-up world and +X forward / +Y up / +Z right robot convention.
- [ ] **B2 (BF2): Coordinate Migration:** Replace every ad-hoc `atan2`, coordinate swap, and manual quaternion flip across the runner and controller.
- [ ] **B3 (BF3): Coupled Body Heading:** Rotate torso quaternion to match commanded travel heading; command velocity strictly along body forward axis.
- [ ] **B4 (BF3): Pure Pursuit Controller:** Implement speed-dependent lookahead (0.8m to 1.4m), continuous yaw unwrapping, and yaw acceleration damping.
- [ ] **B5 (BF3): Filtered Slope Orientation:** Low-pass filter stance plane pitch/roll with gain 0.6 (clamp to ±20°) to eliminate 22.4° pitch oscillations.
- [ ] **B6 (BF3): Boundary Assist Hysteresis:** Gate steering assist strictly to distances > (halfExtent - softMargin) with smooth decay.
- [ ] **B7 (BF8): Kinematic FK Parity:** Generate controller FK and mesh hierarchy from `RobotModelSpec v1`; assert parity ≤ 5mm across 1,000 joint configurations.

---

### Agent C: Viewer, Model, Lighting & Camera Engineering
- [ ] **C1 (BF5): Camera Roll Lock:** Lock camera `up` vector to `(0, 1, 0)`; eliminate all roll from camera spring rig.
- [ ] **C2 (BF5): Path Tangent Follow:** Low-pass filter travel velocity tangent (tau = 0.8s) for chase camera yaw orientation.
- [ ] **C3 (BF5): Terrain Clearance Clamping:** Enforce camera elevation ≥ `sampleHeight + 0.4m`.
- [ ] **C4 (BF7): Shadow Frustum Expansion:** Expand directional shadow frustum to 24m with 2048 map and PCF soft filtering; ensure casters within 14m cast attached shadows.
- [ ] **C5 (BF7): Lighting Contrast Calibration:** Balance key light (1.5), ambient (0.35), and fill (0.30); set `outputColorSpace = SRGBColorSpace`.
- [ ] **C6 (BF7): Rock Contact Blobs & Instance Colors:** Populate `instanceColor` buffer with `#3A3A36`–`#55554E` variation; add instanced circular contact shadow blobs.
- [ ] **C7 (BF8): Detailed Robot Mesh:** Implement beveled shell, stereo camera sensor head, rear lidar puck, actuator cylinder housings at all 12 joints, tapered sturdy legs, rubber foot pads with ankle shocks, and telemetry LED strip.
- [ ] **C8 (BF8): PMREM Environment Map:** Create procedural gradient reflection map for metallic robot components.
- [ ] **C9 (BF8): Decal Footprints:** Implement instanced decal footprint buffer fading over 20 seconds.

---

### Agent D: Spec, Units & Telemetry Engineering
- [ ] **D1 (BF1): Gravity Contract Standardization:** Refactor `EnvironmentSpec.gravity` to `{ value: number, unit: "m/s2", source, displayName }`.
- [ ] **D2 (BF1): SpecCompiler Unit Parser:** Parse inputs ("0.16 g", "1.62 m/s^2", "moon", "mars", "earth") and clamp minimum to 0.1 m/s² (never 0).
- [ ] **D3 (BF1): HUD Gravity Index Fix:** Fix `ThreeViewer.tsx` line 584 to read vertical gravity and format with units.
- [ ] **D4 (BF2): TelemetryFrame v4 Expansion:** Add `bodyForward[3]`, `slipAngle`, `headingError`, `lateralError`, `yawRate`, `roll`, `pitch`, and `pathTangent[3]`.
- [ ] **D5 (BF3): Playhead Continuity:** Ensure position (Hermite) and rotation (shortest-path slerp) sample at identical playhead time.

---

### Agent E: Shell, Radar & UI Engineering
- [ ] **E1 (BF11): Synchronized Radar Transform:** Transform radar debris and hillshade relative to robot position, eliminating coordinate desync.
- [ ] **E2 (BF11): Rotating Robot Arrow:** Draw robot arrow rotated dynamically by `robotHeading` via `ctx.rotate`.
- [ ] **E3 (BF11): Pebble Filtering & Scale:** Filter out debris < 0.12m on radar (dots < 500); draw 10m scale bar and coordinate legend.
- [ ] **E4 (BF12): Header Spacing & Tooltip:** Apply `gap-2` (≥ 6px) to header flex row with responsive collapse order; add title tooltip.
- [ ] **E5 (BF12): Honest Long Task Badge:** Filter `FpsBadge` count to 60-second rolling steady-state window; tag startup tasks in P panel.
- [ ] **E6 (BF12): Tab Empty States:** Add truthful empty states with icon, descriptive sentence, and action button for Spec, Reward, Datagen, Critique tabs.

---

### Agent F: QA, Test Harness & Defect Management
- [ ] **F1 (BF0): Baseline Evidence Capture:** (Complete) Golden views, walk ladder, tilt audit, header layout audit, and visual metrics.
- [ ] **F2 (BF16): Test Gates in CI:** Author and integrate:
  - `test/walk_ladder_gates.test.ts` (L0–L5)
  - `test/gravity_truth.test.ts`
  - `test/robot_fk_parity.test.ts`
  - `test/header_layout.test.ts`
  - `test/visual_metrics_gates.test.ts` (crushed blacks, red rim pixels, stripes, polylines)
- [ ] **F3 (BF14): Bug Bash Execution:** Automate execution of 12 exploratory scenarios on production build.
- [ ] **F4 (BF17): Golden Refresh & Changelog:** Refresh golden screenshots with visible diffs; generate `CHANGELOG.md` and `docs/FIXES.md`.

---

### Agent G: Transparent Architect Visibility
- [ ] **G1 (BF12): Stage Transition Streaming:** Pipe Architect stage transitions to Console log with duration, tokens, and tier.
- [ ] **G2 (BF12): Provenance Badges:** Add honest badges (`[LIVE: NEBIUS]`, `[CACHED]`, `[FIXTURE]`) to rail and cards.
- [ ] **G3 (BF12): Compile Report Rendering:** Render clamped parameters and adjustments in Spec tab.
- [ ] **G4 (BF12): Run Summary Card:** Display completed episode summary card upon simulation finish.
