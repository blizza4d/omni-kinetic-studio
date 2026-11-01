# AGENTS.md — Omni-Kinetic System Specification (Follow-Up Fix: "STRAIGHT, LEVEL, TRUE")

## 1. ARCHITECTURE SUMMARY & AGENT ROLES (4 Focused Engineering Agents)
Omni-Kinetic is a browser-native Sim-to-Real Embodied AI Studio in focused bug-fix mode with 4 specialized engineering agents:
- **Agent A (Locomotion & Dynamics):** Owns `/sim`, `/lib/controller-core`, `/lib/frames`. Single canonical frame convention, coupled non-holonomic heading control, pure pursuit path tracking, time-filtered terrain slope reaction (gain 0.6), walk test ladder L0–L5. [@frames-convention.md](.agents/rules/frames-convention.md) [@walk-straight.md](.agents/rules/walk-straight.md)
- **Agent B (World, Camera & Shaders):** Owns `/lib/world`, `/components/viewer`, terrain and rim shaders, camera rig. Heightfield planar detrend (mean tilt ≤ 1.0°, max 12m window ≤ 3.0°), roll-locked chase camera with path-tangent follow, 24m directional shadow frustum with soft PCF, rock instance colors (`#3A3A36`–`#55554E`), pre-fog anti-aliased shader contours, dynamic rim glow uniform (`uEdgeDistance`). [@terrain-visuals.md](.agents/rules/terrain-visuals.md) [@rim-fog-horizon.md](.agents/rules/rim-fog-horizon.md) [@lighting-shadows.md](.agents/rules/lighting-shadows.md)
- **Agent C (Spec & Units):** Owns `/lib/spec`, `/lib/telemetry`, gravity parsing and display. Strict physical units mandate (`m/s2`, `g`, `m`, `deg`, `s`), unit parser for prompt/preset inputs, clamp minimum downward gravity to 0.1 m/s² (never 0), truthful gravity HUD display `"1.62 m/s² (0.165 g, Moon)"`. [@units-gravity.md](.agents/rules/units-gravity.md)
- **Agent D (QA & Evidence):** Owns `/tests`, `/lib/debug`, `/scripts`, `/docs`. Walk test ladder harness (L0–L5), visual metrics detectors, regression bisects, Visual Self-Review protocol, defect cards. [@defect-process.md](.agents/rules/defect-process.md) [@visual-self-review.md](.agents/rules/visual-self-review.md)

---

## 2. STRICT GUARDRAILS & CORE INVARIANTS
- **DEFECT-FIRST, PROOF-FIRST MANDATE:** A defect is fixed only when (1) a test fails on `followup-baseline`, (2) passes after the fix, (3) before/after golden screenshots at identical seed/camera/timestamp are attached, and (4) a numeric metric is reported with a plain-English explanation.
- **NEVER HIDE A BUG BY DISABLING A FEATURE:** Turning off shadows, rocks, contours, the rim glow, or beacons to eliminate a defect is strictly forbidden. Shadows must be rendered with proper 24m frustum sizing and soft PCF filtering.
- **ONE SINGLE FRAME CONVENTION (`/lib/frames`):**
  - World: Right-handed, Y-up, meters.
  - Body: +X forward, +Y up, +Z right (left legs have negative Z).
  - Yaw $\theta$ rotates +X to $(\cos\theta, 0, -\sin\theta)$; `headingFromVector(v) = Math.atan2(-v.z, v.x)`.
  - The controller, mesh builder, telemetry, and camera rig MUST use `/lib/frames` exclusively. Zero ad-hoc coordinate axis permutations.
- **UNITS MANDATE:** Every physical quantity in the UI, logs, contracts, and docs MUST explicitly state its physical unit (`m/s2`, `g`, `m`, `deg`, `s`). Gravity is defined internally in $\text{m/s}^2$ and displayed truthfully as `"1.62 m/s² (0.165 g, Moon)"`.
- **LEVEL HORIZON & TERRAIN DETREND:** Camera `up` vector is permanently world up (zero rig roll). Heightfield detrend guarantees mean plane tilt $\le 1.0^\circ$ and max 12m window tilt $\le 3.0^\circ$.
- **PERFORMANCE BUDGET:** Frame time p50 $\le 12\text{ ms}$, p95 $\le 16\text{ ms}$ (hard cap 20 ms). Zero steady-state long tasks (> 50 ms) over 5 minutes.
- **TRUTHFUL UI MANDATE:** Every number on screen is real. Header chips never overlap. Honest source badges: `[LIVE: NEBIUS]`, `[CACHED]`, `[FIXTURE]`.

---

## 3. DESIGN TOKENS & SYSTEM PALETTE ("Analog AI")
- `--charcoal: #2A2A2A`, `--charcoal-deep: #1F1F1F`, `--sage: #6B705C`, `--brick: #B83B2F`, `--cream: #FDFBF7`, `--cream-dim: rgba(253, 251, 247, 0.62)`, `--hairline: rgba(253, 251, 247, 0.08)`, `--robot-body: #3A3A3A`, `--rock-top: #4A4A44`, `--rock-base: #3A3A36`, `--footprint: rgba(253, 251, 247, 0.25)`, `--contour: rgba(253, 251, 247, 0.08)`.
- Header layout: single flex row with `gap >= 6px`, 32px chip height, tabular numerals in Courier Prime.
- Hotkeys: `Ctrl+K` (Palette), `T` (Teleop), `R` (Record), `Space` (Play/Pause), `?` (Shortcuts), `P` (Perf), `C` (Contact), `J` (Judge Mode), `1`-`4` (Camera Presets).
