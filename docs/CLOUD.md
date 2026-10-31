# Nebius Cloud Serverless AI & Storage Integration Architecture

> **Omni-Kinetic Sim-to-Real Embodied AI Studio** — Cloud Physics, Relay & Storage Specification (Iteration 6)

---

## 1. Cloud Hierarchy & Dual Execution Engine

Omni-Kinetic provides two parallel, fully decoupled execution engines behind the shared `RunnerInterface`:

1. **Cloud Nebius Mode (`[CLOUD: NEBIUS L40S]`):**
   - Headless, containerized simulation jobs running on 1x NVIDIA L40S (48GB Ada Lovelace) via Nebius Serverless Jobs.
   - Outputs chunked JSONL telemetry (`part-*.jsonl`, 30 frames per part) to an S3-compatible Object Storage bucket.
   - Telemetry streams to the browser via the `/app/api/relay` Server-Sent Events relay with `Last-Event-ID` resumption.
2. **Local Demo Mode (`[DEMO: LOCAL RUNNER]`):**
   - Pure, deterministic in-browser/server kinematics engine (`/lib/controller-core`) grounded on the exact canonical `TerrainField v1` (257x257 Int16 mm grid).
   - Zero network latency, zero cold start, 100% offline capability.

---

## 2. API Endpoints & Server-Side Credentials

- **Token Factory Base URL:** `https://api.tokenfactory.nebius.com/v1`
- **Object Storage Endpoint:** `https://storage.nemotron.nebius.cloud`
- **Authentication Environment Variables (Server-Only):**
  - `NEBIUS_API_KEY`: Token Factory Bearer token.
  - `S3_ENDPOINT`: S3 Object Storage endpoint.
  - `S3_ACCESS_KEY_ID`: Storage access key.
  - `S3_SECRET_ACCESS_KEY`: Storage secret key.
  - `S3_BUCKET_NAME`: Target bucket (e.g., `omni-kinetic-jobs`).
  - `S3_REGION`: Storage region (e.g., `eu-north1`).
- **Security Rule:** **Credentials NEVER reach client bundles.** All client interaction with Object Storage is proxied through the authenticated `/app/api/relay` or short-lived presigned URLs.

---

## 3. Serverless Job Container & Storage Layout

### Storage Layout (`s3://$S3_BUCKET_NAME/runs/<jobId>/`)
```text
runs/<jobId>/
├── input/
│   ├── compiled_spec.json       # Clamped EnvironmentSpec v4 with specHash
│   ├── terrain.bin               # Canonical 257x257 Int16 binary heightfield
│   ├── reward.py                 # Validated Python step reward script
│   └── policy.json               # Optional PolicyCheckpoint v1 weights
├── telemetry/
│   ├── manifest.json             # Frame ranges, chunk indices, SHA-256 checksums
│   ├── part-000001.jsonl         # Frames 0-29 (TelemetryFrame v4)
│   ├── part-000002.jsonl         # Frames 30-59
│   └── ...
├── summary.json                  # Final RunSummary v3 metrics and buildStamp
└── heartbeat                     # Liveness beacon timestamp (updated every 3s)
```

### Serverless Job Container (`/sim/worker/Dockerfile`)
- Base Image: `python:3.10-slim`
- Dependencies: PyTorch 2.3+ (CUDA 12.2), NumPy, SciPy, Boto3
- Direct payload injection is capped at $< 64\text{ KiB}$; the job launch command passes only the `jobId` and S3 bucket key prefix.
- The worker downloads inputs from S3, verifies `specHash` and `terrainHash`, executes headless simulation, and streams chunked telemetry parts.

---

## 4. Telemetry Relay Protocol (`/app/api/relay`)

1. **Chunk Listing & Streaming:** The relay polls the S3 prefix for newly written `part-*.jsonl` chunks using cursor backoff ($250\text{ms}$ start, $2.0\text{s}$ cap).
2. **SSE Resumption:** Each SSE message contains `event: telemetry_chunk` and `id: <chunkIndex>`. On client reconnection, the `Last-Event-ID` header allows the relay to immediately resume from the exact last acknowledged chunk without losing or duplicating frames.
3. **Gap Detection & Buffering:** Monotonic frame sequence numbers (`seq`) are checked. If client consumption lags behind server production by $> 2.0\text{ seconds}$, the relay applies backpressure and signals a `"Buffering"` status.
4. **Heartbeat & Liveness:** The relay inspects the `runs/<jobId>/heartbeat` timestamp. If the heartbeat is stale by $> 10\text{ seconds}$, the relay marks the job as stalled or failed.

---

## 5. Cold-Start Lifecycle & UX

1. **Queued State:** Job submitted to Nebius Serverless Jobs scheduler.
2. **Cold Start (45–90s):** GPU node container pull and CUDA initialization. UI renders `ColdStartCard` with real-time timer.
3. **Instant Switch to Demo Local:** The developer can click `"Switch to Demo Local"` at any time during cold start. The exact compiled spec, seed, and terrain are seamlessly transferred to the local runner with 0 delay.
4. **Streaming State:** Real-time telemetry chunks stream through the relay.
5. **Completed State:** Telemetry, summary, and dataset manifest are cached in IndexedDB for offline replay.

---

## 6. Truth-in-UI Source Badges

| Execution Mode | Header Badge | Logs / Summary Label | Underlying Engine |
| :--- | :--- | :--- | :--- |
| **Live Cloud Job** | `[CLOUD: nebius-eu-north1]` | `nebius_serverless_jobs` | Nebius L40S container + S3 relay |
| **Cached Cloud Run** | `[CACHED CLOUD RUN]` | `cached_nebius_run` | Replayed S3 chunk fixture |
| **Local Demo** | `[DEMO: LOCAL RUNNER]` | `local_demo` | Pure TypeScript `/lib/controller-core` |
| **Recorded Fixture** | `[RECORDED FIXTURE]` | `recorded_fixture` | Bundled golden JSONL fixture |
| **Simulated Learning**| `[SIMULATED IMPROVEMENT]` | `simulated_improvement` | Surrogate learning baseline |
