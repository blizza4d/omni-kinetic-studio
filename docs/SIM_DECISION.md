# SIM_DECISION.md — NVIDIA Foundation Models Feasibility & Architectural Decision

**Build Stamp:** `iteration-5-dev • 21842619 [main] • prod • NVIDIA RTX 3050`  
**Date:** `2026-10-31`  
**Status:** **AUTHORITATIVE DECISION: OPTION (C) — CLEAN ADAPTER STUB WITH DOCUMENTED 'NOT RUN' STATUS**  

---

## 1. Executive Context & Evaluation Mandate

Omni-Kinetic's brief mandates strict Truth-in-UI:
> *"Never claim GR00T, Cosmos, cloud execution, or learning improvement unless it actually happened and was measured. A judge who discovers one fake claim stops trusting everything."*

Section 2.2 (Q5) and Section 4.2 require an explicit evaluation of NVIDIA Isaac GR00T and NVIDIA Cosmos World Foundation Models (WFM) to choose between:
- **(a) Real integration**
- **(b) Thin real call** (e.g. Cosmos for synthetic visual augmentation)
- **(c) Clean adapter with documented 'not run' status**

---

## 2. Technical Evaluation of Models

### A. Project GR00T (Generalist Robot 00 Technology)
- **Domain:** Multimodal embodiment foundation model for humanoid/quadruped locomotion and manipulation.
- **Hardware Prerequisites:** Datacenter multi-GPU nodes (NVIDIA A100/H100 80GB SXM5), NVIDIA Isaac Sim / Isaac Lab (Omniverse Nucleus container stack), PyTorch 2.3+ distributed runtime.
- **Model Checkpoints:** Foundations span billions of parameters requiring tens of gigabytes of VRAM.
- **Feasibility Analysis:** Running GR00T locally in-browser or within a lightweight serverless cloud job during a hackathon demo is technically infeasible due to hardware requirements, long container spin-up times ($> 15\text{ minutes}$ for Isaac Sim Omniverse stack), and lack of open serverless API endpoints.

---

### B. NVIDIA Cosmos (World Foundation Models)
- **Domain:** Diffusion and autoregressive world foundation models (Cosmos Predict, Cosmos Transfer) designed for synthetic physical AI observation generation.
- **Model Checkpoints:** 4B to 14B parameter models requiring 24GB to 80GB VRAM (NVIDIA L40S / A100 / H100).
- **Execution Pipeline:** Requires TensorRT-LLM, PyTorch container with CUDA 12.4+, and multi-minute video diffusion rollouts.
- **Feasibility Analysis:** While Nebius offers NVIDIA L40S/H100 GPUs, deploying a full Cosmos inference pipeline for synthetic augmentation within a browser-interactive studio exceeds standard serverless job cold-start windows ($> 5\text{ minutes}$ container pull) and session cost budgets.

---

## 3. The Authoritative Decision: Option (c)

We adopt **Option (c): Clean, Typed SimAdapter with Documented 'Not Run' Status**:

1. **Typed Architecture:** We implement a clean, extensible `SimAdapter` interface in `/sim/adapters/interface.ts` with implementations:
   - `MuJoCoAdapter` (Canonical deterministic physics engine)
   - `GR00TAdapter` (Isaac Lab / GR00T embodiment foundation interface)
   - `CosmosAdapter` (Cosmos synthetic visual augmentation interface)
2. **Truthful UI Badge:** The UI, Job Cards, and Truth Table explicitly label GR00T and Cosmos adapters as `[NOT RUN IN THIS BUILD]`.
3. **No Fake Claims:** We never present synthetic augmentation as "Cosmos-generated" unless a live, measured inference call was completed and recorded with job ID, token usage, and latency.

---

## 4. Adapter Interface Contract

```typescript
export interface SimAdapter {
  id: 'mujoco' | 'groot' | 'cosmos';
  name: string;
  status: 'active' | 'not_run' | 'stub';
  hardwareRequirement: string;
  step(state: SimulationState, action: RobotAction): Promise<SimulationStepResult>;
  augmentObservations?(frames: TelemetryFrame[]): Promise<TelemetryFrame[]>;
}
```

---

## 5. Truth Table Alignment

| Component | Status in Iteration 6 | UI Badge | Documented Evidence |
| :--- | :---: | :---: | :--- |
| **Local Physics Runner** | **LIVE** | `[DEMO: LOCAL RUNNER]` | Deterministic 60 Hz TypeScript kinematics & 2-link IK |
| **Nebius Serverless Jobs** | **LIVE / CACHED** | `[CLOUD: NEBIUS L40S]` / `[CACHED CLOUD RUN]` | S3 chunked JSONL relay with `Last-Event-ID` |
| **NVIDIA Nemotron LLM** | **LIVE / FIXTURE** | `[LIVE: NEBIUS TOKEN FACTORY]` / `[FIXTURE]` | 11-stage visible Architect pipeline |
| **NVIDIA GR00T** | **NOT RUN** | `[NOT RUN IN THIS BUILD]` | Typed adapter stub in `/sim/adapters/groot.ts` |
| **NVIDIA Cosmos** | **NOT RUN** | `[NOT RUN IN THIS BUILD]` | Typed adapter stub in `/sim/adapters/cosmos.ts` |
