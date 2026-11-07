# IMPLEMENTATION PLAN — FIX PASS 3: "RECONCILE, PROVE, THEN FIX"
**Project:** Omni-Kinetic Browser-Native Sim-to-Real Embodied AI Studio  
**Gate:** Gate 1 (Planning Gate / Baseline Reconciliation — Zero Production Code Modifications)  
**Date:** 2026-11-02  
**Baseline Git Tag:** `fix3-baseline` (`aa9ea1d`)  

---

## 1. Plan Overview & Principles
Fix Pass 3 operates under a strict **"Reconcile, Prove, Then Fix"** mandate:
1. **Pixels Over Tests:** No bug is considered fixed until a before/after crop at identical viewport (1917×881 and 1920×1080), preset, seed, and timestamp shows it resolved to the eye and passes the automated visual metrics detector.
2. **Never Disable a Feature to Hide a Bug:** Shadows, debris, contours, rim line, and beacon remain active, physically calibrated, and mathematically verified.
3. **Stop-The-Line Review Gates:** Packages proceed sequentially (P0 $\to$ P1 $\to$ P2 $\to$ P3 $\to$ P4 $\to$ P5). Each package requires an Evidence Pack before advancing.

---

## 2. Work Packages Breakdown

### Package P0: Reconcile & Baseline (Agent E, All) — [CURRENT GATE: GATE 1]
- **Deliverables:**
  - Tag git baseline `fix3-baseline` (`aa9ea1d`).
  - Capture 1917×881 user viewport at $t=36.0\text{s}$ (Episode 3) and generate annotated reconciliation overlay.
  - Deliver Build Identity Report, Defect Confirmation Report, Root Cause Table with bisects, Gate Audit Report, Task List, and Risks Document.
- **Acceptance:** Gate 1 approval from user before modifying any production code.

---

### Package P1: Lighting, Rocks & Shadows (Agents B & A) — [GATE 2]
- **Scope:** Resolve K1–K10, D1–D4.
- **Tasks:**
  - Fix rock material color to white (`0xffffff`) so `instanceColor` is not squared into pure black.
  - Implement 5 distinct geological rock colors (`#3A3A36` to `#55554E`) with normal Y gradient for lit top faces.
  - Add 6 distinct displaced/fractured geometries ($\ge 80$ triangles, 0 pyramids) with safe embed depth ($15\%\text{–}35\%$).
  - Reposition key light to low angle ($22^\circ$ elevation) with cool hemisphere ambient fill and PMREM reflection.
  - Expand shadow frustum to 24m snapping to texel steps with PCF soft filtering; ensure terrain preserves shadow chunks.
  - Add instanced contact shadow blobs under rocks and directly under robot feet.
  - Implement distance-faded pebble cull (pebbles $< 0.12\text{m}$ fade out by $18\text{m}$) and foothold rock margin check ($\ge 5\text{cm}$).
- **Acceptance Criteria:**
  - Fraction of rock pixels with luminance $< 0.05$ is $\le 10\%$.
  - Rock-top to ground luminance ratio between $1.2$ and $2.2$.
  - Crushed black pixels on non-shadow regions $\le 1.5\%$.
  - $\ge 90\%$ of rocks within 14m cast an attached shadow in `?debug=shadowsOnly`; zero ghost shadows.
  - Robot shadow centroid within $0.15\text{m}$ of expected light vector.
  - Frame time p95 $\le 16.0\text{ms}$.
- **Gate 2 Deliverable:** Evidence Pack with before/after crops at 1917×881 and 1920×1080, checklist answers, and 15s recording.

---

### Package P2: Goal, Rim, Terrain & Camera (Agents A & B) — [GATE 3]
- **Scope:** Resolve G1–G7, T1–T6, C1–C3.
- **Tasks:**
  - Redesign goal marker: $0.6\text{m}$ ground ring draped on terrain + $2.5\text{m}$ tall cylinder ($0.25\text{m}$ radius) with alpha gradient (peak $0.25$) fading beyond $40\text{m}$.
  - Reposition goal dynamically: $8\text{–}30\text{m}$ from spawn, strictly $\ge 4\text{m}$ inside $18\text{m}$ arena boundary, slope $\le 5^\circ$, clear zone $3\text{m}$.
  - Draping rim in terrain shader: screen-space $1.5\text{px}$ width via `fwidth`, cream-dim dashed line ($0.5\text{m}$ on / $0.5\text{m}$ off, $35\%$ opacity), distance-faded beyond $30\text{m}$.
  - Restore anti-aliased contour lines: $0.25\text{m}$ minor, $1.0\text{m}$ bold, $6\%\text{–}10\%$ opacity, fading out at $35\text{m}$.
  - Add regolith micro-normal and smooth skirt normals.
  - Recalibrate camera Chase rig: pitch 14° down, distance 5.5m, elevation 1.6m, looking 1.0m ahead; enforces horizon at $20\%\text{–}28\%$ from top, robot center at $55\%\text{–}70\%$, robot height $16\%\text{–}22\%$.
- **Acceptance Criteria:**
  - Goal projected height $\le 18\%$ of viewport; base within $1\text{cm}$ of terrain.
  - Rim line has no run thicker than $6\text{px}$ and zero bright white blocks beyond $15\text{m}$.
  - Red rim pixels at center spawn $= 0$; active within $2.5\text{m}$ of margin.
  - Horizon position in viewport strictly between $20\%$ and $28\%$.
  - Terrain parity passes on 10,000 points within $1\text{cm}$ on all tiers.
- **Gate 3 Deliverable:** Evidence Pack with before/after crops and checklist items 5–9 and 15.

---

### Package P3: Locomotion Verification & Episodes (Agent C)
- **Scope:** Resolve L1–L2, Section 4.10.
- **Tasks:**
  - Emit typed `EpisodeEvent` at every reset: `reason`, `duration`, `distance`, `reward`, `collisions`, `slipP95`.
  - Log clean Console line on episode end: `"Episode 1 ended: goal reached in 15.2 s, 17.2 m"`.
  - Mark episode reset boundaries as distinct tick marks on the playback scrubber.
  - Re-verify walk ladder L0–L5 and evaluate 30s production video trajectory residual ($< 0.1\text{m}$).
- **Acceptance Criteria:** Walk ladder L0–L5 passes; Console truthfully logs episode completion; scrubber marks episode boundaries.

---

### Package P4: Radar, Detailed Robot, Header UI & Log (Agents D & B) — [GATE 4]
- **Scope:** Resolve Q1–Q6, R1–R8, H1–H7, L3–L6.
- **Tasks:**
  - Radar: Pre-render offscreen hillshade texture; filter rocks $\ge 0.12\text{m}$ (under 500 dots); draw $14\text{px}$ heading arrow, path, goal ring, $10\text{m}$ scale bar, and axis legend (+X / N).
  - Header: Enforce flex row with `gap >= 6px`, `min-width: 0`, single-row 48px height, tabular Courier Prime, responsive icon collapse on narrow screens.
  - Perf Badge: Filter long tasks to rolling 60s steady-state window; tag startup tasks; neutral color at 0.
  - Detailed Robot (`RobotModelSpec v1`): Beveled shell with raised top cover and seams; front stereo camera head with sage ring; rear lidar puck; actuator housings; tapered legs; rubber foot pads with spring shocks; flank status LEDs. Enforce `robot-fk-parity` on 1,000 configurations ($\le 5\text{mm}$).
  - Console & Architect: In fixture mode, log stage transitions; fill Spec, Reward, Datagen tabs; token meter states `[FIXTURE]`; show Run Summary card at episode end.
- **Acceptance Criteria:**
  - `layout-overlap-test` passes at 1280, 1440, 1917, 1920 px with $\ge 4\text{px}$ gap.
  - Steady-state long task count $= 0$ (neutral badge).
  - Robot body contrast against ground $\ge 2.0:1$; draw calls $\le 30$; triangles $\le 25\text{k}$ at LOD0.
  - Zero console errors over 5-minute production run.
- **Gate 4 Deliverable:** Evidence Pack with checklist items 10–14 and 16, and 60s recording.

---

### Package P5: CI Enforcement & Final Release Package (Agent E) — [GATE 5]
- **Scope:** Hook all visual, layout, and regression tests into blocking CI pipeline.
- **Tasks:**
  - Add CI test runners for rock luminance, shadow presence, layout overlap, radar structure, FK parity, and build stamp freshness.
  - Demonstrate that reverting P1, P2, or P4 fails the respective gate.
  - Capture refreshed golden screenshots across 5 seeds with visible diffs.
  - Author `/docs/FIXES.md` and changelog.
- **Gate 5 Deliverable:** Final release package and 3-minute production video.
