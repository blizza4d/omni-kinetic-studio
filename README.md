# Omni-Kinetic — Sim-to-Real Embodied AI Studio

> **Physical AI Hackathon Track**  
> A browser-native robotics training studio combining NVIDIA Nemotron physical reasoning, headless cloud physics streaming, a Three.js spatial visualizer, and client-side WebGPU/WASM computer-vision teleoperation.

---

## 3-Minute Hackathon Demo Script

Follow this exact flow during live judging or recorded demonstration:

### [0:00 - 0:45] The Problem & The Solution
1. Open the studio at `http://localhost:3000`.
2. Point to the **Analog AI** linear-inspired interface: notice the workspace tokens (`--charcoal`, `--cream`, Courier Prime monospace telemetry readouts, top status badges).
3. Explain the problem: *Bridging natural language to embodied physical robotics traditionally requires hours of writing URDF files, reward functions, and setting up complex cloud simulation clusters.*
4. Press `Cmd/Ctrl+K` to open the Command Palette. Select or type:  
   `"Train a 12-DOF quadruped to navigate a low-gravity cratered debris field with obstacle avoidance"` and hit **Enter**.

### [0:45 - 1:45] The Agentic Simulation Architect & Safety Gate
1. Watch the **Analog Log Streamer** stream in real-time via Server-Sent Events (SSE).
2. Show Nemotron decomposing the task into:
   - Physical gravity vector ($[0, 0, -1.62]$ for Moon/Asteroid).
   - Structured `EnvironmentSpec` JSON defining crater roughness, bounds, and debris density.
   - Vectorized `reward.py` function balancing forward velocity, stability, and collision penalties.
   - Domain-randomized `datagen.py` synthetic data generation script.
3. Switch tabs in the left pane to view the generated code diff.
4. Highlight the **Static AST Safety Gate** badge: point out that the safety gate verified that only approved scientific modules (`numpy`, `torch`, `math`) are permitted, while dangerous system primitives (`os`, `subprocess`, `socket`, `eval`) are strictly blocked.
5. Click **"Approve & Deploy Job"**.

### [1:45 - 2:30] Spatial Visualization & Live Telemetry
1. The 3D Three.js viewer fills the screen running at rock-solid **60 FPS**.
2. Explain the procedural world: terrain elevation is seeded from the `EnvironmentSpec`, and hundreds of debris boulders are rendered via `THREE.InstancedMesh` with minimal draw calls.
3. Observe the articulated 12-DOF quadruped traversing the cratered surface.
4. When the robot contacts a boulder, note the **brick-red collision pulse** flashing across the workspace and the contact marker. As progress improves, note the **sage-green reward glow** pulsating around the chassis.
5. Point out the top-right HUD: real-time FPS/frame time and the 2D orthographic radar minimap.

### [2:30 - 3:00] Human-in-the-Loop Teleoperation & DAgger Loop
1. When the robot stalls or encounters tricky terrain, press `T` to activate **Teleop Mode**.
2. The webcam activates inside a floating Picture-in-Picture window running MediaPipe Tasks Vision fully client-side inside a Web Worker. Video frames never leave the browser.
3. Move your hand: the index fingertip position is solved via **FABRIK Inverse Kinematics** to drive the quadruped's hip, thigh, and calf joints in real-time. Pinching thumb and index finger adjusts foot stiffness. Rotating your head orbits the Three.js camera.
4. Point out the latency readout: **glass-to-joint latency is under 50 ms** (well below the 100 ms requirement).
5. Click **"Record Correction"** to record human demonstration tuples `(observation, action, timestamp)`.
6. Click **"DAgger Export"** to harvest the demonstration episode dataset ready for the next cloud training rollout.

---

## Architecture at a Glance

| Layer | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Layer 1: Architect** | Nebius Token Factory + NVIDIA Nemotron | Multi-step prompt chain, dynamic model discovery, AST safety gate, SSE streaming |
| **Layer 2: Compute** | Nebius Serverless Jobs + Local Runner | S3-compatible chunked telemetry (20–60 frames/batch), GR00T & Cosmos adapters, bundled fixtures |
| **Layer 3: Visualizer** | Next.js 14 + Three.js + Cannon-es | 60 FPS imperative render loop, 12-DOF articulated quadruped, procedural terrain, minimap |
| **Layer 4: Teleop** | MediaPipe Tasks Vision (WebGPU / WASM) | Zero-copy ImageBitmap, One Euro filter, FABRIK IK solver, DAgger episode recorder |

---

## Keyboard Shortcuts

- `Cmd/Ctrl + K` — Open Command Palette (Task Prompts & Quick Actions)
- `T` — Toggle CV Teleoperation Mode (Webcam Hand & Face Tracking)
- `Space` — Pause / Resume physics simulation playback
- `Esc` — Close overlays and modals

---

## Quick Start & Installation

### 1. Prerequisites
- Node.js v18+ (tested on Node v22)
- Python 3.10+ (for AST verification and local physics worker)

### 2. Setup
```bash
# Clone and enter workspace
git clone <repo-url>
cd omni-kinetic

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
```

### 3. Run Development Server
```bash
npm run dev
# Open http://localhost:3000
```

### 4. Run Unit & Acceptance Tests
```bash
npm test
# Or run with tsx:
npx tsx --test test/*.test.ts
```
# omni-kinetic-studio
# omni_loco_ai
# omni-kinetic-studio
