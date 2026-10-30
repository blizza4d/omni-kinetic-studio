# Omni-Kinetic: Sim-to-Real Embodied AI Studio
## Architecture & Technical Deep Dive

Omni-Kinetic bridges the gap between high-level natural language task specifications and physical AI execution in a zero-install, browser-native studio.

---

## 1. System Topology

```
+-----------------------------------------------------------------------------------------+
|                                    BROWSER CLIENT                                       |
|                                                                                         |
|   +-----------------------+     +------------------------+    +---------------------+   |
|   |   Command Palette     |     |   3D Spatial Viewer    |    |  CV Teleop Overlay  |   |
|   |  (Cmd/Ctrl+K Hotkey)  |     |   (Three.js, 60 FPS)   |    |    (WebGPU/WASM)    |   |
|   +-----------+-----------+     +-----------^------------+    +----------^----------+   |
|               |                             |                            |              |
|               | Task Prompt                 | Authoritative Telemetry    | Hand/Face IK |
+---------------|-----------------------------|----------------------------|--------------+
                |                             |                            |
                v                             |                            |
+------------------------------------+        |                            |
|          NEXT.JS BACKEND           |        |                            |
|                                    |        |                            |
|  /api/architect/stream (SSE)       |        |                            |
|  - Nemotron-3 Reasoning Prompt     |        |                            |
|  - Python AST Safety Gate          |        |                            |
|                                    |        |                            |
|  /api/jobs/stream (SSE Relay)      |--------+                            |
|  - Batched Frame Relay (30 f/msg)  |                                     |
|  - Cloud S3 / Local Runner Arbiter |                                     |
|                                    |                                     |
|  /api/logs/translate (POST)        |                                     |
|  - Fast Nemotron Error Translation |                                     |
+-----------------+------------------+                                     |
                  |                                                        |
                  v                                                        v
+------------------------------------+                 +----------------------------------+
|      PHYSICS & COMPUTE ENGINES     |                 |       CLIENT VISION WORKER       |
|                                    |                 |                                  |
|  [Cloud Mode: Nebius Serverless]   |                 |  @mediapipe/tasks-vision (WASM)  |
|  - Docker Container on L40S GPU    |                 |  - OffscreenCanvas & ImageBitmap |
|  - GR00T & Cosmos Foundation Model |                 |  - One Euro Temporal Filter      |
|    Adapters (/sim/adapters/)       |                 |  - FABRIK Inverse Kinematics     |
|                                    |                 |  - DAgger Demonstration Recorder |
|  [Demo Mode: Local Runner]         |                 +----------------------------------+
|  - Authoritative 60 FPS Generator  |
|  - Pre-recorded Fixture Replay     |
+------------------------------------+
```

---

## 2. Layer 1: Agentic Simulation Architect
- **Model Dynamic Discovery:** Queries Nebius Token Factory `GET /models` at startup to resolve active Nemotron reasoning models (`nvidia/Nemotron-3-Ultra-550b-a55b` or verified active reasoning equivalents) and fast inference models (Nemotron Nano/Super).
- **Prompt Chain:**
  1. `Interpret Task`: Physical decomposition (gravity vector, morphology, terrain roughness).
  2. `Design Environment`: Emits structured `EnvironmentSpec` adhering to Zod schema.
  3. `Reward Function`: Generates vectorized `compute_step_reward` in NumPy/Torch.
  4. `Synthetic Data`: Generates domain-randomized rollout script `datagen.py`.
  5. `Safety Gate`: Parses Python AST in `ast_checker.py`, strictly enforcing scientific whitelists (`numpy`, `torch`, `scipy`) and forbidding `os`, `sys`, `subprocess`, `socket`, `eval`, and file/network I/O.

---

## 3. Layer 2: Compute Jobs & Physics Adapters
- **Nebius Serverless Batch Engine:** Packages simulation runs inside `sim/worker/Dockerfile` targeting Linux CUDA nodes.
- **Unified Adapter Architecture (`/sim/adapters/`):**
  - `SimulationAdapter` base interface (`step`, `reset`, `get_state`, `get_telemetry_frame`).
  - `Gr00tAdapter`: NVIDIA Isaac GR00T foundation policy adapter.
  - `CosmosAdapter`: NVIDIA Cosmos World Foundation Model adapter.
  - `LocalSimulationRunner`: Client/local zero-latency physics generator with bundled pre-recorded trajectories (`low_gravity_quadruped.jsonl`).
- **Telemetry Ingestion Protocol:**
  - Batched 30 frames per message (500 ms chunks) over Server-Sent Events to minimize event loop overhead.
  - Standardized `TelemetryFrame` schema tracking 12 quadruped joints, rigid body transforms, and contact points.

---

## 4. Layer 3: Spatial Visualizer
- **Imperative Three.js Lifecycle:** Dedicated WebGL canvas with decoupled animation loop ensuring zero React re-render penalties during high-frequency telemetry updates.
- **Procedural Terrain:** Seeded mathematical elevation field with instanced debris boulders (`THREE.InstancedMesh`).
- **Visual Telemetry Cues:**
  - Collision pulses in brick-red (`#B83B2F`).
  - Upright/forward reward glows in sage-green (`#6B705C`).
  - Decaying ribbon motion trail following center of mass.
  - 2D orthographic radar minimap and frame time counter.

---

## 5. Layer 4: CV Teleoperation & DAgger Loop
- **Zero-Copy Video Pipeline:** Webcam frames converted to `ImageBitmap` and transferred to a dedicated Web Worker via transferable objects (`[imageBitmap]`).
- **Filtering & IK:**
  - One Euro Filter dampens high-frequency jitter without introducing lag.
  - FABRIK 3D inverse kinematics solver computes hip, thigh, and calf angles.
  - Pinch gesture modulates foot stiffness.
  - Head pose from face mesh orbits the camera view.
- **DAgger Corrective Learning:** Teleop recordings capture `(observation, action, timestamp)` tuples, exportable as JSON datasets for iterative policy refinement.
