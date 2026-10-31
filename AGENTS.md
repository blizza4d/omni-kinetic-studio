# AGENTS.md — Omni-Kinetic System Specification (Iteration 6: "SHIP IT")

## 1. ARCHITECTURE SUMMARY & AGENT ROLES (9 Specialized Parallel Agents)
Omni-Kinetic is a browser-native Sim-to-Real Embodied AI Studio for the Physical AI track with 9 parallel engineering agents:
- **Agent A (World):** Owns `/lib/world/terrain`, `/workers/terrain`, `/lib/world/debris`, `/contracts/terrain*`. Canonical 257x257 TerrainField v1, PCG craters, Poisson debris, rendering invariants I1–I8. [@terrain-contract.md](.agents/rules/terrain-contract.md)
- **Agent B (Controller, Sim, Learning):** Owns `/sim`, `/lib/controller-core`, `/lib/world/bounds`, `/lib/learning`, `/workers/learning`. Shared controller core, 2-link leg IK, trot gait, Takeover Sandbox, residual MLP training, held-out evaluation. [@controller-core.md](.agents/rules/controller-core.md) [@learning.md](.agents/rules/learning.md) [@eval.md](.agents/rules/eval.md)
- **Agent C (Viewer & Takeover Render):** Owns `/components/viewer`, `/lib/world/render`, `/workers/physics`, `/components/takeover`. Three.js spring camera, takeover framing, ghost policy visualization (v1 cream vs v2 sage). [@frontend-3d.md](.agents/rules/frontend-3d.md)
- **Agent D (Telemetry, Clock, Relay):** Owns `/lib/telemetry`, `/workers/telemetry`, `/lib/clock`, `/app/api/relay`. Playhead clock, chunked S3 telemetry relay with `Last-Event-ID`, gap detection, backpressure. [@relay.md](.agents/rules/relay.md)
- **Agent E (Shell, UI, Judge Mode):** Owns `/components/shell`, `/components/ui`, `/components/radar`, `/components/judge`, `/styles`. Single-row header (48px), hillshade radar, Latency HUD, Dataset panel, Evaluation comparison, Judge Mode (`J`). [@judge-mode.md](.agents/rules/judge-mode.md) [@design-system.md](.agents/rules/design-system.md) [@a11y.md](.agents/rules/a11y.md)
- **Agent F (QA, Release, Docs):** Owns `/tests`, `/lib/perf`, `/lib/debug`, `/scripts`, `/docs`, `/app/status`. Build stamp, Acceptance Matrix, golden seed renders, fake-camera CI, soak tests, submission manifest. [@testing.md](.agents/rules/testing.md) [@release.md](.agents/rules/release.md)
- **Agent G (Architect & Tokens):** Owns `/lib/nebius`, `/lib/spec`, `/lib/safety`, `/app/api/architect`, `/app/api/logs`, `/app/api/usage`, `/sim/reward_sandbox`. 11-stage visible pipeline, deterministic SpecCompiler, Python AST Safety Gate v2, Reward Sandbox, Training Plan stage. [@architect.md](.agents/rules/architect.md) [@spec-compiler.md](.agents/rules/spec-compiler.md) [@safety-gate.md](.agents/rules/safety-gate.md) [@reward-sandbox.md](.agents/rules/reward-sandbox.md)
- **Agent H (Cloud & Deploy):** Owns `/sim/adapters`, `/sim/worker`, `/app/api/jobs`, `/lib/cloud`, deployment configs, `Dockerfile`s. Nebius Serverless Jobs runner, S3 storage layout, cold-start card, SimAdapters (`mujoco`, `groot`, `cosmos`). [@cloud.md](.agents/rules/cloud.md) [@deploy.md](.agents/rules/deploy.md)
- **Agent I (Vision & Teleop):** Owns `/components/teleop`, `/workers/vision`, `/lib/teleop`, `/lib/dataset`, `/public/models`. MediaPipe Tasks Vision Web Worker, WebGPU delegate + WASM fallback, 5s calibration, One Euro filter, privacy enforcement. [@teleop.md](.agents/rules/teleop.md) [@privacy.md](.agents/rules/privacy.md)

---

## 2. STRICT GUARDRAILS & CORE INVARIANTS
- **DEMO LOCAL IS SACRED:** The offline Demo Local path (runner, viewer, Architect fixtures, keyboard teleop, Judge Mode) must ALWAYS function end-to-end without network, cloud credentials, or a camera.
- **BUILD STAMP MANDATE:** Every screenshot, log banner, report, and `/status` response carries the canonical `BuildStamp` (git SHA, branch, iteration tag, build type, GPU renderer, resolved model IDs). Banner text is generated strictly from the stamp.
- **LLM PROPOSES, COMPILER DISPOSES:** Raw LLM outputs NEVER reach the simulator. All specs pass through the deterministic `SpecCompiler` which clamps parameters to safe limits and logs every adjustment in the `SpecCompileReport`.
- **PRIVACY MANDATE:** Webcam frames NEVER leave the browser and are NEVER persisted or transmitted. Only normalized landmarks are recorded, and only after the user presses `R`.
- **SHARED CONTROLLER CORE:** A single pure TypeScript module (`/lib/controller-core`) executes locomotion, kinematics, IK, bounds, and terrain sampling across the browser viewer, takeover sandbox, Node.js server, and container worker.
- **SINGLE TERRAIN SOURCE OF TRUTH:** Authoritative runner compiles canonical `TerrainField v1` (257x257 grid, Int16 mm, center origin). The viewer, radar, physics worker, and runner MUST read this identical grid. Zero independent generation from seeds.
- **AUTHORITATIVE CLOCK & CONTINUOUS PLAYHEAD:** Simulation runner owns sim time $t$. The viewer samples poses strictly at `playhead = latestSimT - renderDelay` using `performance.now()` deltas. Frames are NEVER stepped by arrival order or message count.
- **ZERO ROBOT POSE SMOOTHING IN VIEWER:** Viewport NEVER applies `lerp(pos, target, factor)` to the robot chassis, rotation, or joints. Smoothing applies strictly to the camera follow rig.
- **GROUND-CONTACT INVARIANTS:** Zero frames with any foot tip $> 1\text{ cm}$ below terrain surface; zero frames with hull bottom $> 2\text{ cm}$ below surface. Stance feet are pinned ($< 2\text{ cm}$ slip).
- **RENDERING INVARIANTS (I1–I8):**
  - **I1 No Ghost Shadows:** Visible shadow blobs must touch an active visible rock instance within 12 px.
  - **I2 No Stray Sprites:** Every viewport primitive belongs to a named scene object.
  - **I3 Surface-Draped Rim:** Arena boundary drawn strictly in terrain shader; zero floating polylines.
  - **I4 Smooth Horizon:** Horizon silhouette is a low-amplitude ridge with exponential fog; zero dome curvature.
  - **I5 Contact Visible:** Feet and lower leg segments are visible and planted above ground in default chase camera.
  - **I6 Legibility:** Body contrast $\ge 2.0:1$ and rock contrast $\ge 1.4:1$ relative to terrain background.
  - **I7 Relief Visible:** Contour lines ($0.25\text{m}$ subtle, $1.0\text{m}$ bold), craters, and slope shading clearly readable.
  - **I8 Rock Shapes:** Subdivided icosahedrons with noise displacement; zero octahedrons or pyramids.
- **PERFORMANCE BUDGET:** Frame time p50 $\le 12\text{ ms}$, p95 $\le 20\text{ ms}$ (vsync 16.7 ms). With CV running, p95 $\le 22\text{ ms}$. Teleop latency p50 $\le 100\text{ ms}$, p95 $\le 150\text{ ms}$.
- **TRUTHFUL UI MANDATE:** Every number on screen is real. Honest source badges: `[LIVE: NEBIUS L40S]`, `[CACHED CLOUD RUN]`, `[RECORDED FIXTURE]`, `[DEMO: LOCAL RUNNER]`, `[SIMULATED IMPROVEMENT]`. Never claim GR00T, Cosmos, cloud execution, or learning improvement unless actually measured.

---

## 3. FEATURE FLAGS & RELEASE PROCESS
| Flag | Description | Default (Local) | Default (Public Demo) |
| :--- | :--- | :---: | :---: |
| `CLOUD_ENABLED` | Nebius Serverless Jobs cloud execution | `true` | `false` (requires key) |
| `LIVE_LLM_ENABLED` | Live Nebius Token Factory generation | `true` | `false` (requires key) |
| `VISION_ENABLED` | Web camera computer vision tracking | `true` | `true` |
| `ONNX_PROVIDER_ENABLED` | Optional ONNX Runtime Web WebGPU provider | `false` | `false` |
| `LEARNING_ENABLED` | Residual policy demonstration training | `true` | `true` |
| `JUDGE_MODE_ENABLED` | Scripted 3-minute offline tour (`J`) | `true` | `true` |
| `DEBUG_ENABLED` | Debug HUD, render modes, takeover overrides | `true` | `false` |

**Release Progression:** `rc1` (stable base) $\rightarrow$ `rc2` (+cloud) $\rightarrow$ `rc3` (+teleop) $\rightarrow$ `rc4` (+learning) $\rightarrow$ `rc-final`.  
**Cut-lines:** (1) Cut ONNX WebGPU, (2) Cut live GR00T/Cosmos (keep SimAdapter stubs), (3) Cut cloud training, (4) Cut DAgger v3 loop, (5) Cut mapping gain UI, (6) 1 cloud run + cached fixture, (7) Cut Hermite polish.  
**Never Cut:** Truthful UI badges, Demo Local, keyboard teleop, Judge Mode, evaluation honesty, README, demo script, and final video recording.

---

## 4. DESIGN TOKENS ("Analog AI")
- `--charcoal: #2A2A2A`, `--charcoal-deep: #1F1F1F`, `--sage: #6B705C`, `--brick: #B83B2F`, `--cream: #FDFBF7`, `--cream-dim: rgba(253, 251, 247, 0.62)`, `--hairline: rgba(253, 251, 247, 0.08)`, `--robot-body: #3A3A3A`, `--rock-top: #4A4A44`.
- Glassmorphism: `background: rgba(42,42,42,0.55)`, `backdrop-filter: blur(14px) saturate(120%)`. Max 3 surfaces over canvas.
- Hotkeys: `Ctrl+K` (Palette), `T` (Takeover/Teleop), `Shift+T` (Recalibrate), `R` (Record), `Enter` (Commit), `Esc` (Release), `Space` (Play/Pause), `?` (Shortcuts), `Q` (Tier), `B` (Boundary), `P` (Perf), `C` (Contact), `S` (Stage Rail), `D` (Debug), `A/E/X` (Review Actions), `J` (Judge Mode), `G` (Ghost Overlay), `L` (Cycle Limb), `1`-`4` (Camera Presets / Limb Select).
