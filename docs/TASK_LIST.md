# TASK LIST ACROSS AGENTS A TO E — FIX PASS 3: "RECONCILE, PROVE, THEN FIX"
**Project:** Omni-Kinetic Browser-Native Sim-to-Real Embodied AI Studio  
**Gate:** Gate 1 (Planning Gate / Baseline Reconciliation — Zero Production Code Modifications)  
**Date:** 2026-11-02  
**Baseline Git Tag:** `fix3-baseline` (`aa9ea1d`)  

---

## 1. Agent Assignments & File Ownership (Section 1.3)

### Agent A: World Engineering
**Owned Paths:** `/lib/world/terrain`, `/workers/terrain`, `/lib/world/debris`, terrain and rim shaders.
- [ ] **Task A.1 (K1/Palette):** Define rock color palette (`--rock-base #3A3A36` to `--rock-top #55554E`) with normal Y top-face gradient.
- [ ] **Task A.2 (K10/Shapes):** Create 6 displaced/fractured icosahedron geometries ($\ge 80$ tris, flattened bottoms, 0 pyramids).
- [ ] **Task A.3 (K9/Grounding):** Fix rock embedding ($15\%\text{–}35\%$ embed depth) and assert 0 floating rocks.
- [ ] **Task A.4 (D1–D3/Distribution):** Implement distance falloff for pebbles $< 0.12\text{m}$ (fade out by $18\text{m}$); fix perimeter ring falloff.
- [ ] **Task A.5 (G1–G2/Goal):** Build conforming ground ring ($0.6\text{m}$) draped on terrain; place goal $\ge 4\text{m}$ inside boundary on slope $\le 5^\circ$.
- [ ] **Task A.6 (G3/Rim):** Implement screen-space $1.5\text{px}$ dashed line in terrain shader via `fwidth`, cream-dim ($35\%$ opacity), fading beyond $30\text{m}$.
- [ ] **Task A.7 (T2/Contours):** Restore anti-aliased world-space contour lines ($0.25\text{m}$ minor, $1.0\text{m}$ bold, $6\%\text{–}10\%$ opacity).
- [ ] **Task A.8 (T3–T4/Terrain):** Add regolith micro-normal and smooth perimeter skirt normals.

---

### Agent B: Render & Visuals Engineering
**Owned Paths:** `/components/viewer`, `/lib/world/render`, `/lib/robot-model`, `/components/camera`.
- [ ] **Task B.1 (K1/Material):** Fix `debrisMat` color to white (`0xffffff`) so `instanceColor` is not squared to pure black.
- [ ] **Task B.2 (K2–K4/Lighting):** Reposition key light to low angle ($22^\circ$ elevation); add cool hemisphere ambient fill and PMREM reflection.
- [ ] **Task B.3 (K2/Shadows):** Configure 24m shadow frustum snapping to texel steps with PCF soft filtering; ensure terrain preserves shadow chunks.
- [ ] **Task B.4 (K6–K7/AO):** Implement instanced contact shadow blobs under rocks and directly under planted feet.
- [ ] **Task B.5 (C1–C2/Camera):** Recalibrate default Chase camera (pitch 14° down, distance 5.5m, elevation 1.6m) to place horizon at $20\%\text{–}28\%$ and robot center at $55\%\text{–}70\%$.
- [ ] **Task B.6 (R1–R7/Robot Mesh):** Author `RobotModelSpec v1` and build detailed 12-DOF robot mesh: beveled shell, front stereo camera head, rear lidar puck, actuator housings, tapered legs, rubber foot pads, and flank status LEDs.

---

### Agent C: Locomotion & Episodes Engineering
**Owned Paths:** `/sim`, `/lib/controller-core`, `/lib/frames`, `/lib/telemetry`.
- [ ] **Task C.1 (L1/Episode Events):** Emit typed `EpisodeEvent` at every reset with reason (`goal_reached`, `out_of_bounds`, etc.), duration, distance, and reward.
- [ ] **Task C.2 (K8/Footholds):** Update foothold selector to enforce $\ge 5\text{cm}$ clearance margin from rock colliders.
- [ ] **Task C.3 (R5/Kinematics):** Derive controller FK/IK from `RobotModelSpec v1` and enforce `robot-fk-parity` test ($\le 5\text{mm}$ error across 1,000 poses).
- [ ] **Task C.4 (Walk Ladder):** Continuously verify walk ladder L0 through L5; evaluate 30s trajectory residual ($< 0.1\text{m}$).

---

### Agent D: UI, Radar & Shell Engineering
**Owned Paths:** `/components/shell`, `/components/ui`, `/components/radar`, `/styles`, `/lib/nebius`, `/app/api/logs`.
- [ ] **Task D.1 (H1/Header Layout):** Refactor header to single flex row with `gap >= 6px`, `min-width: 0`, 32px chip height, tabular Courier Prime numerals, and responsive icon collapse.
- [ ] **Task D.2 (H2/Tooltip):** Add full-text title tooltip for truncated headers.
- [ ] **Task D.3 (H4/Long Tasks):** Filter `FpsBadge` to 60s rolling steady-state window ($t > 5\text{s}$); tag startup tasks; display neutral badge when 0.
- [ ] **Task D.4 (Q1–Q5/Radar):** Pre-render offscreen hillshade texture; filter rocks $\ge 0.12\text{m}$ (under 500 dots); draw 14px heading arrow, path, goal ring, 10m scale bar, and axis legend.
- [ ] **Task D.5 (L1–L2/Playback Bar):** Render episode boundary tick marks on playback scrubber; show episode index and reset reason in run card.
- [ ] **Task D.6 (L3–L6/Console):** Log episode completion events to Console; show Architect stage transitions and artifact tabs in fixture mode; add source badge `[FIXTURE]`.

---

### Agent E: QA, Evidence & Build Identity Engineering
**Owned Paths:** `/tests`, `/lib/debug`, `/lib/perf`, `/scripts`, `/docs`, build identity.
- [ ] **Task E.1 (B1–B3/BuildStamp v2):** Implement prebuild script baking git SHA, dirty flag, UTC timestamp, and bundle hash into `build_stamp_generated.json`. Add viewport corner watermark.
- [ ] **Task E.2 (Evidence Packs):** Generate Evidence Packs for Gates 2, 3, 4, and 5 with before/after crops at 1917×881 and 1920×1080.
- [ ] **Task E.3 (CI Gate Automation):** Hook visual metrics gates into `npm test`: rock luminance, shadow presence, layout overlap, radar structure, FK parity, and build stamp freshness.
- [ ] **Task E.4 (Verification & Bisects):** Maintain test suite 100% green; produce `/docs/FIXES.md` and release changelog.
