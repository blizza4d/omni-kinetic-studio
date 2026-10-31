# Cloud Rules — Nebius Serverless Jobs & Object Storage

- **Storage-First Payload Constraint:** Nebius Serverless Jobs payload injection is strictly capped at $< 64\text{ KiB}$. All heavy assets (compiled specs, binary terrain fields, weights) must be passed via S3 Object Storage keys (`runs/<jobId>/input/`).
- **Unblocking Cold-Start UX:** When scheduling a cloud GPU node (45–90s), UI displays `ColdStartCard` with real-time timer and instant "Switch to Demo Local" fallback.
- **Truthful Cloud Source Badging:** The header and run summary only display `[CLOUD: <region>]` when telemetry is actively arriving from an authenticated cloud runner. Offline cached replays are strictly badged `[CACHED CLOUD RUN]`.
- **Hard Spend Caps:** Hard limit of $5.00 spend per session and 200,000 LLM tokens enforced server-side. Exceeding caps triggers immediate refusal with plain-English explanation.
- **SimAdapter Transparency:** NVIDIA GR00T and Cosmos adapters in `/sim/adapters` carry explicit "Not run in this build" status badges unless live-measured inference is executed.
