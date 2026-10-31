# Telemetry Relay Rules — /app/api/relay

- **Idempotent Chunking:** Cloud jobs and local runners write chunked telemetry in 30-frame parts (`runs/<jobId>/telemetry/part-000001.jsonl`) with sequential index ranges and SHA-256 manifests.
- **Last-Event-ID Resumption:** The Server-Sent Events relay supports seamless reconnection using `Last-Event-ID`. Upon reconnect, client resumes without duplicate frames or gaps.
- **Client-Side Deduplication & Gap Detection:** Relay ordering tracks monotonic frame sequence IDs (`seq`). Gaps are logged and backpressure triggers a "Buffering" notice if client lag exceeds 2 seconds.
- **Zero Server Frame Parsing:** Relay proxies chunk manifests and raw payload lines to minimize server CPU overhead. Frame validation is performed in the client telemetry worker.
