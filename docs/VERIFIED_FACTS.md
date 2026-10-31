# Verified Facts & Cloud Constraints Reference

**Build Stamp:** `iteration-5-dev • 21842619 [main] • prod • NVIDIA RTX 3050`  
**Date:** `2026-10-31`  
**Location:** `/docs/VERIFIED_FACTS.md` and Artifacts  

---

## 1. Nebius Serverless AI & Cloud Infrastructure

### A. Nebius Token Factory
- **API Endpoint:** `https://api.tokenfactory.nebius.com/v1`
- **Protocol:** OpenAI-compatible REST API (`v1/chat/completions`, `v1/models`).
- **Authentication:** Bearer token via HTTP header `Authorization: Bearer $NEBIUS_API_KEY`.
- **Active Model Tiers:**
  - *Reasoning / Ultra:* `nvidia/Nemotron-3-Ultra-550b-a55b` ($550\text{B}$ MoE, 55B active). Used for high-level intent interpretation, physical task specification, and critique.
  - *Mid / Super:* `nvidia/nemotron-3-super-120b-a12b` ($120\text{B}$ MoE, 12B active). Used for reward script drafting and demonstration training plan synthesis.
  - *Fast / Nano:* `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` ($30\text{B}$ MoE, 3B active). Used for real-time error translation and telemetry explanations.
- **Model Lifecycle Rule:** Model snapshots are retired periodically. The system resolves live IDs dynamically at runtime using `client.models.list()` with a 10-minute cache TTL, falling back to configured defaults only if unauthenticated.
- **Token Caps:** Default session budget capped at 200,000 tokens / \$5.00 spend.

---

### B. Nebius Serverless Jobs
- **Scheduler Protocol:** Asynchronous batch execution via container runner API.
- **Payload Limits:** Direct command and environment variable injection is strictly limited to **$< 64\text{ KiB}$**.
  - *Architecture Invariant:* Heavy assets (mesh buffers, binary terrain heightfields, PyTorch weights) MUST be passed via Object Storage object keys, never via shell arguments.
- **GPU Accelerators:** NVIDIA L40S (48GB Ada Lovelace) and NVIDIA H100 SXM5 (80GB Hopper).
- **Cold Start:** 45 to 90 seconds typical for container image pull and CUDA driver initialization.
  - *UX Invariant:* Cold start must be transparently displayed via `ColdStartCard` with an unblocking "Switch to Demo Local" button.

---

### C. Nebius Object Storage (S3-Compatible)
- **Endpoint:** `https://storage.nemotron.nebius.cloud` (or `https://storage.nebius.ai`).
- **Protocol:** AWS S3 REST API (SigV4 authentication).
- **Bucket Layout:**
  - `runs/<jobId>/input/compiled_spec.json`: Clamped specification.
  - `runs/<jobId>/input/terrain.bin`: Canonical 257x257 Int16 binary heightfield.
  - `runs/<jobId>/input/reward.py`: Validated Python step reward script.
  - `runs/<jobId>/telemetry/part-000001.jsonl`: 30-frame chunked telemetry batches.
  - `runs/<jobId>/summary.json`: Final `RunSummary` object with metrics.
  - `runs/<jobId>/heartbeat`: Updated every 3 seconds to indicate job liveness.

---

## 2. Client-Side Computer Vision & WebGPU

### A. MediaPipe Tasks Vision
- **Hand Landmarker:** 21 3D hand landmarks per hand, handedness score, palm openness, pinch distance. Model size: ~9.8 MB (`hand_landmarker.task`).
- **Face Landmarker:** 478 3D landmarks, face orientation (yaw, pitch, roll), eye gaze vectors. Model size: ~3.7 MB (`face_landmarker.task`).
- **License:** Apache 2.0.
- **Execution Delegates:**
  1. *GPU Delegate (WebGPU):* Zero-copy WebGL/WebGPU texture evaluation, $> 30\text{ FPS}$ on dedicated GPUs.
  2. *WASM SIMD Delegate:* CPU WebAssembly fallback via `vision_wasm_internal.wasm`, achieving $15\text{--}25\text{ FPS}$ on multi-core CPUs.
- **Offline Guarantee:** Model weights vendored under `/public/models/` and WASM runtimes bundled in `@mediapipe/tasks-vision/wasm/` ensure zero network dependence during demos.

---

### B. Local Demo Machine Hardware
- **Operating System:** Windows 10/11 x64.
- **GPU:** NVIDIA GeForce RTX 3050 Laptop GPU (Ampere architecture, 4GB VRAM, Direct3D 11 via ANGLE).
- **WebGPU Support:** Verified active via Chrome 157 (`navigator.gpu` returns `{ vendor: "nvidia", architecture: "ampere" }`).
- **Rendering Performance:** 6.9 ms p50 / 7.3 ms p95 frame time ($> 135\text{ FPS}$ unthrottled, vsync-locked at 60 Hz).

---

## 3. NVIDIA Isaac Foundation Models (GR00T & Cosmos)

### A. Project GR00T (Generalist Robot 00 Technology)
- **Target Domain:** Multimodal humanoid and quadruped embodiment foundation models.
- **Runtime Dependencies:** NVIDIA Isaac Lab / Isaac Sim, Omniverse Nucleus, PyTorch distributed, multi-GPU datacenter cluster (A100/H100 80GB).
- **Hackathon Feasibility:** Infeasible for in-browser client execution or serverless single-GPU jobs within short runtime bounds.
- **Architectural Action:** Implement clean typed `SimAdapter` with honest "Not run in this build" status.

---

### B. NVIDIA Cosmos (World Foundation Models)
- **Target Domain:** Diffusion and autoregressive physical AI world simulators for visual synthetic data generation.
- **Model Sizes:** 4B to 14B parameters.
- **Compute Footprint:** Requires 24GB–80GB VRAM, TensorRT-LLM, and dedicated multi-minute inference pipelines.
- **Architectural Action:** Implement clean synthetic data generation adapter stub (`CosmosAdapter`) in `/sim/adapters` with clear labeling in the Truth Table.
