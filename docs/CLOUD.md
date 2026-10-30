# Nebius Cloud Serverless AI & Storage Integration Architecture

> **Omni-Kinetic Sim-to-Real Embodied AI Studio** — Cloud Physics & Compute Spec

---

## 1. Overview & Cloud Hierarchy

Omni-Kinetic supports dual execution modes:
1. **Cloud Nebius Mode (`[CLOUD: NEBIUS L40S]`):** Headless, containerized simulation jobs running on NVIDIA L40S / H100 GPUs via Nebius Serverless Jobs. Trajectories stream to an S3-compatible Object Storage bucket in chunked JSONL format, which the Next.js server relays to the browser over SSE.
2. **Local Demo Mode (`[DEMO: LOCAL RUNNER]`):** Authoritative, zero-dependency browser-server physics engine grounded on the exact deterministic heightfield elevation profile, ensuring instantaneous presentation with 0 cold start.

---

## 2. API Endpoints & Authentication

- **Token Factory Base URL:** `https://api.tokenfactory.nebius.com/v1`
- **Object Storage Endpoint:** `https://storage.nemotron.nebius.cloud`
- **Authentication:** Server-side environment variables strictly (`NEBIUS_API_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). **Never exposed to client code.**

---

## 3. Serverless Job Container Specification

- **Base Image:** `cr.nemotron.nvidia.com/embodied-ai:latest`
- **GPU Accelerator:** 1x NVIDIA L40S (48GB Ada Lovelace)
- **Container Footprint:**
  - Python 3.10+
  - PyBullet 3.2.5+ / MuJoCo 3.1+
  - PyTorch 2.3+ (CUDA 12.2)
  - NumPy, SciPy, Gymnasium
- **Payload Limits:**
  - `EnvironmentSpec` JSON injection: `< 64 KiB`
  - Inline `reward.py` script: `< 64 KiB`
  - Inline `datagen.py` script: `< 64 KiB`

---

## 4. Cold-Start Lifecycle & UX

1. **Queued State:** Serverless container node is requested from the Nebius scheduler.
2. **Cold Start (5–12s):** Node pulls base container image and initializes CUDA / GPU context. UI displays the `ColdStartCard` with real-time countdown.
3. **Instant Fallback Action:** The developer can click `"Switch to Demo Local"` at any time during cold start to swap instantly to the deterministic local physics runner without reloading.
4. **Streaming State:** Container writes chunked JSONL (`30 frames/batch`) to bucket. SSE relays to viewer with `Last-Event-ID` resumption cursor.

---

## 5. Truth-in-UI Truth Table

| Condition | UI Badge | Underlying Engine |
| :--- | :--- | :--- |
| Live Nebius credentials configured | `[CLOUD: NEBIUS L40S]` | Nebius Serverless container + S3 chunked relay |
| S3 unconfigured or Demo Mode selected | `[DEMO: LOCAL RUNNER]` | Procedural heightfield physics engine (`local_runner.ts`) |
| Client disconnects & reconnects | Resumed seamlessly | Sequential `batchId` buffer replay with `Last-Event-ID` |
