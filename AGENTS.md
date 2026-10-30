# AGENTS.md — Omni-Kinetic System Specification (Iteration 5)

## 1. ARCHITECTURE SUMMARY & AGENT ROLES
Omni-Kinetic is a browser-native Sim-to-Real Embodied AI Studio with 7 specialized parallel engineering agents:
- **Agent A (Terrain & Debris):** Owns `/lib/world/terrain`, `/workers/terrain`, `/lib/world/debris`, `/contracts/terrain*`. Canonical 257x257 TerrainField v1, PCG craters & ridges, Poisson-disk debris, A* reachability corridor.
- **Agent B (Sim, Gait & Contact):** Owns `/sim`, `/lib/world/bounds`, `/app/api/jobs`. Trot gait with speed-proportional cadence, foot stance/swing logic, 2-link leg IK, boundary penalty & steering assist.
- **Agent C (Viewer & Render):** Owns `/components/viewer`, `/lib/world/render`, `/workers/physics`. Canonical mesh, slope-tinted regolith shader, draped boundary rim, critically damped spring camera, rendering invariants (I1–I8).
- **Agent D (Telemetry & Clock):** Owns `/lib/telemetry`, `/workers/telemetry`, `/lib/clock`. Target-time pacing, time-based batching ($\le 50\text{ ms}$), playhead clock with phase-locked soft resync, Hermite/slerp interpolation.
- **Agent E (Shell & UI):** Owns `/components/shell`, `/components/ui`, `/components/radar`, `/styles`. Single-row header, hillshaded canonical radar with debris dots and square bounds, Motion HUD in P panel, Run Summary & Replay.
- **Agent F (QA & Harness):** Owns `/tests`, `/lib/perf`, `/lib/debug`, `/scripts`, `/docs`, `/app/status`. Build stamp, Acceptance Matrix, golden-seed regression renders, visual invariant checks, CI regression gates.
- **Agent G (Architect & Tokens):** Owns `/lib/nebius`, `/lib/spec`, `/lib/safety`, `/app/api/architect`, `/app/api/logs`, `/app/api/usage`, `/sim/reward_sandbox`. 11-stage pipeline, Token Factory client & fallback, deterministic SpecCompiler, AST safety gate v2, sandbox.

## 2. STRICT GUARDRAILS & CORE INVARIANTS
- **BUILD STAMP MANDATE:** Every screenshot, log banner, report, and `/status` response carries the canonical `BuildStamp` (git SHA, branch, iteration tag, build type, GPU renderer, resolved model IDs). The banner text is generated strictly from the stamp.
- **LLM PROPOSES, COMPILER DISPOSES:** Raw LLM outputs NEVER reach the simulator. All specs pass through the deterministic `SpecCompiler` which clamps parameters to safe limits and logs every adjustment in the `SpecCompileReport`.
- **SINGLE TERRAIN SOURCE OF TRUTH:** Authoritative runner compiles canonical `TerrainField v1` (257x257 grid, Int16 mm, center origin). The viewer, radar, physics worker, and runner MUST read this identical grid. Zero independent generation from seeds.
- **AUTHORITATIVE CLOCK & CONTINUOUS PLAYHEAD:** Simulation runner owns sim time $t$. The viewer samples poses strictly at `playhead = latestSimT - renderDelay` using `performance.now()` deltas. Frames are NEVER stepped by arrival order or message count.
- **ZERO ROBOT POSE SMOOTHING IN VIEWER:** Viewport NEVER applies `lerp(pos, target, factor)` to the robot chassis, rotation, or joints. Smoothing applies strictly to the camera follow rig.
- **GROUND-CONTACT INVARIANTS:** Zero frames with any foot tip $> 1\text{ cm}$ below terrain surface; zero frames with hull bottom $> 2\text{ cm}$ below surface. Stance feet are pinned ($< 2\text{ cm}$ slip).
- **RENDERING INVARIANTS (I1–I8):**
  - **I1 No Ghost Shadows:** All visible shadow blobs must touch an active visible rock instance within 12 px.
  - **I2 No Stray Sprites:** Every viewport primitive belongs to a named scene object.
  - **I3 Surface-Draped Rim:** Arena boundary drawn strictly in terrain shader; zero floating polylines.
  - **I4 Smooth Horizon:** Horizon silhouette is a low-amplitude ridge with exponential fog; zero dome curvature.
  - **I5 Contact Visible:** Feet and lower leg segments are visible and planted above ground in default chase camera.
  - **I6 Legibility:** Body contrast $\ge 2.0:1$ and rock contrast $\ge 1.4:1$ relative to terrain background.
  - **I7 Relief Visible:** Contour lines ($0.25\text{m}$ subtle, $1.0\text{m}$ bold), craters, and slope shading clearly readable.
  - **I8 Rock Shapes:** Subdivided icosahedrons with noise displacement; zero octahedrons or pyramids.
- **WORLD-BOUNDS INVARIANTS:** Arena: `halfExtent: 18m`, `softMargin: 2m`, `hardMargin: 20m`. Catch plane at `y = -5.0m`.
- **PERFORMANCE BUDGET:** Frame time p50 $\le 12\text{ ms}$, p95 $\le 20\text{ ms}$. Terrain shader $\le 1.0\text{ ms}$. Radar $\le 1.5\text{ ms}$. React commits $\le 10/\text{s}$.
- **TRUTHFUL UI MANDATE:** Honest FPS badge with p50/p95, tier, and labeled warning badge. Source labels: `[LIVE: NEBIUS L40S]`, `[CACHED LIVE RUN]`, `[RECORDED FIXTURE]`, `[DEMO: LOCAL RUNNER]`, `[SIMULATED IMPROVEMENT]`.
- **REGRESSION GUARD:** Baseline metrics recorded before every package. Any regression in hotkeys, logs, radar, or bounds must be resolved before proceeding.

## 3. DESIGN TOKENS ("Analog AI")
- `--charcoal: #2A2A2A` (Workspace base and viewport canvas)
- `--charcoal-deep: #1F1F1F` (Recessed panels and docks)
- `--sage: #6B705C` (Success, reward curves, low flat terrain tint, stance contact)
- `--brick: #B83B2F` (Collisions, boundary rim warnings, safety alerts)
- `--cream: #FDFBF7` (Primary text, dials, high-contrast labels)
- `--cream-dim: rgba(253, 251, 247, 0.62)` (Secondary labels, contour lines, swing feet)
- `--hairline: rgba(253, 251, 247, 0.08)` (Subtle glass borders)
- `--robot-body: #3A3A3A`, `--rock-top: #4A4A44` (Visual contrast tokens)
- Glassmorphism: `background: rgba(42,42,42,0.55)`, `backdrop-filter: blur(14px) saturate(120%)`. Max 3 surfaces over canvas.
- Hotkeys: `Ctrl+K` (Palette), `T` (Teleop), `Space` (Play/Pause), `?` (Shortcuts), `Q` (Quality Tier), `B` (Boundary Rim), `P` (Perf Panel), `C` (Contact Debug), `S` (Stage Rail Focus), `D` (Debug Render), `A/E/X` (Review Actions), `1`-`4` (Camera Presets).

## 4. VERSIONED DATA CONTRACTS (/contracts)
- **BuildStamp v1:** `sha`, `branch`, `iterationTag`, `buildType`, `contractVersions`, `gpuRenderer`, `modelIds`, `createdAt`.
- **AcceptanceMatrix v1:** entries of `{testId, iteration, status: passed|failed|not_implemented|regressed, evidence[], notes}`.
- **VisualReport v1:** invariant results I1 to I8 per golden seed with measured deviations and image links.
- **EnvironmentSpec v4:** `taskId`, `taskName`, `description`, `gravity`, `terrainRecipe`, `debris`, `arena`, `spawn`, `goal`, `robot`, `motion`, `episodeLength`, `successCriteria`, `rationale`.
- **CompiledSpec v1:** clamped spec parameters, `specHash`, `seed`, `attempt`, `path`.
- **SpecCompileReport v1:** `adjustments[{field, from, to, reason}]`, `reachability`, `attempts`, `terrainStats`, `warnings`.
- **TelemetryFrame v4:** `t`, `seq`, `dt`, `episode`, `bodies[{id, pos[3], quat[4], vel[3]}]`, `joints[{name, angle, velocity}]`, `feet[{id, pos[3], contact}]`, `bodyHeightAboveGround`, `slopeUnderBody`, `gait{phase, speed, cmdSpeed}`, `reward`, `rewardComponents{}`, `collisions[...]`, `boundary{state, distanceToEdge}`, `valid`, `episodeEvent?`, `status`.
- **TerrainField v1:** canonical 257x257 heights Int16 mm, origin center, spacing 0.1875, fixed a-d triangulation, SHA-256 hash.
- **RewardSpec v2:** entrypoint, component names, weights, summary, sandbox limits, fixture results.
- **RunSummary v3:** success, distance, mean reward, collisions, boundary events, stalls, energy, duration, tokens, cost, source labels, build stamp.
