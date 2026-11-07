# AGENTS.md — Omni-Kinetic System Specification (Fix Pass 3: "Reconcile, Prove, Then Fix")

## 1. ARCHITECTURE SUMMARY & AGENT ROLES (5 Specialized Engineering Agents)
Omni-Kinetic is a browser-native Sim-to-Real Embodied AI Studio in focused, screenshot-driven bug-fix mode with 5 specialized engineering agents:
- **Agent A (World Engineering):** Owns `/lib/world/terrain`, `/workers/terrain`, `/lib/world/debris`, terrain and rim shaders. Responsible for rock variety, embedding depth, pebble distance culling, conforming goal ring, dashed terrain rim, anti-aliased contours, regolith micro-normals, and smooth skirt normals. [@rocks.md](.agents/rules/rocks.md) [@goal-rim.md](.agents/rules/goal-rim.md) [@terrain-visuals.md](.agents/rules/terrain-visuals.md)
- **Agent B (Render & Visuals):** Owns `/components/viewer`, `/lib/world/render`, `/lib/robot-model`, `/components/camera`. Responsible for rock materials (base white, normal-Y gradient), low-angle key lighting ($22^\circ$), hemisphere ambient fill, 24m shadow frustum snapping to texels, ACES tone mapping, camera framing ($20\%\text{–}28\%$ horizon), and detailed `RobotModelSpec v1` mesh. [@lighting-materials.md](.agents/rules/lighting-materials.md) [@shadows.md](.agents/rules/shadows.md) [@camera-framing.md](.agents/rules/camera-framing.md) [@robot-model.md](.agents/rules/robot-model.md)
- **Agent C (Locomotion & Episodes):** Owns `/sim`, `/lib/controller-core`, `/lib/frames`, `/lib/telemetry`. Responsible for Single Frame Convention, pure pursuit path tracking, low-pass filtered slope reaction, rock margin avoidance ($\ge 5\text{cm}$), `robot-fk-parity` kinematic alignment, walk ladder L0–L5, and typed `EpisodeEvent` emission. [@walk-straight.md](.agents/rules/walk-straight.md) [@frames-convention.md](.agents/rules/frames-convention.md) [@episodes-log.md](.agents/rules/episodes-log.md)
- **Agent D (UI, Radar & Shell):** Owns `/components/shell`, `/components/ui`, `/components/radar`, `/styles`, `/lib/nebius`, `/app/api/logs`. Responsible for single-row flex header with zero overlaps, honest 60s rolling steady-state `FpsBadge`, offscreen hillshade radar with $\ge 14\text{px}$ arrow, scale bar, episode boundary tick marks, and fixture-mode Architect visibility. [@header-ui.md](.agents/rules/header-ui.md) [@radar.md](.agents/rules/radar.md)
- **Agent E (QA, Evidence & Build Identity):** Owns `/tests`, `/lib/debug`, `/lib/perf`, `/scripts`, `/docs`, build identity. Responsible for `BuildStamp v2` (git SHA, dirty flag, timestamp, bundle hash), Evidence Packs, automated visual metrics CI gates, regression bisects, and release documentation. [@build-identity.md](.agents/rules/build-identity.md) [@evidence-packs.md](.agents/rules/evidence-packs.md) [@defect-process.md](.agents/rules/defect-process.md) [@visual-self-review.md](.agents/rules/visual-self-review.md)

---

## 2. STRICT GUARDRAILS & CORE INVARIANTS
- **PIXELS OVER TESTS & PROOF-FIRST MANDATE:** The user's screenshot is the ground truth. A defect is fixed only when (1) a test fails on `fix3-baseline`, (2) passes after the fix, (3) before/after crops at identical viewport (1917×881 and 1920×1080), preset, seed, camera, and timestamp are attached, (4) a numeric metric is reported, and (5) the Visual Self-Review checklist is answered.
- **STOP THE LINE:** Packages proceed in strict sequence: P0 $\to$ P1 $\to$ P2 $\to$ P3 $\to$ P4 $\to$ P5. Do not start a subsequent package until the preceding review gate is approved.
- **NEVER HIDE A BUG BY DISABLING A FEATURE:** Turning off shadows, rocks, contours, the rim line, the goal beacon, or any visual element to eliminate a defect is strictly forbidden. Fix the root cause.
- **BUILD IDENTITY MANDATE:** Every build must bake dynamic git SHA, branch, `dirty` flag with list of modified files, build timestamp (UTC), and bundle hash into `BuildStamp v2`. The footer stamp in the viewport corner must always reflect the running code.
- **UNITS & TRUTHFUL UI MANDATE:** Every physical quantity in the UI, logs, contracts, and docs MUST explicitly state its physical unit (`m/s2`, `g`, `m`, `deg`, `s`). Gravity is defined internally in $\text{m/s}^2$ and displayed truthfully as `"1.62 m/s² (0.165 g, Moon)"`. Every number on screen is real. Header chips never overlap or touch ($\text{gap} \ge 4\text{px}$).
- **ONE SINGLE FRAME CONVENTION (`/lib/frames`):**
  - World: Right-handed, Y-up, meters (+X East, +Y Up, +Z South).
  - Body: +X forward, +Y up, +Z right (left legs have negative Z).
  - Yaw $\theta$ rotates +X to $(\cos\theta, 0, -\sin\theta)$; `headingFromVector(v) = Math.atan2(-v.z, v.x)`.
  - The controller, mesh builder, telemetry, and camera rig MUST use `/lib/frames` exclusively. Zero ad-hoc coordinate axis permutations.
- **LEVEL HORIZON & CAMERA FRAMING:** Camera `up` vector is permanently world up (`camera.up.set(0, 1, 0)`). Default Chase camera places the horizon strictly between $20\%$ and $28\%$ from the top of the viewport, robot center between $55\%$ and $70\%$, and robot height between $16\%$ and $22\%$.
- **PERFORMANCE BUDGET:** Frame time p50 $\le 12\text{ ms}$, p95 $\le 16\text{ ms}$ (hard cap 20 ms). Zero steady-state long tasks (> 50 ms) over 5 minutes. Robot mesh: $\le 30$ draw calls and $\le 25\text{k}$ triangles at LOD0.

---

## 3. DESIGN TOKENS & SYSTEM PALETTE ("Analog AI")
- `--charcoal: #2A2A2A`, `--charcoal-deep: #1F1F1F`, `--sage: #6B705C`, `--brick: #B83B2F`, `--cream: #FDFBF7`, `--cream-dim: rgba(253, 251, 247, 0.62)`, `--hairline: rgba(253, 251, 247, 0.08)`, `--robot-body: #3A3A3A`, `--rock-top: #4A4A44`, `--rock-base: #3A3A36`, `--footprint: rgba(253, 251, 247, 0.25)`, `--contour: rgba(253, 251, 247, 0.08)`.
- Header layout: single flex row with `gap >= 6px`, 32px chip height, tabular numerals in Courier Prime.
- Hotkeys: `Ctrl+K` (Palette), `T` (Teleop), `R` (Record), `Space` (Play/Pause), `?` (Shortcuts), `P` (Perf), `C` (Contact), `J` (Judge Mode), `1`-`4` (Camera Presets).
