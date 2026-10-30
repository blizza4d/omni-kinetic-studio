# Telemetry Pipeline & Decoupling Invariants (@telemetry-pipeline.md)

## 1. Zero Telemetry in React State Mandate
- **NEVER push high-frequency (60 Hz) telemetry frames into React state** (`useState` / `useReducer`).
- High-frequency telemetry updates trigger React reconciler churn, re-rendering large component subtrees (HUD, Shell, log pane, diff pane, viewer container).
- Telemetry frames must stream directly into an imperative `TelemetryStore` (ring buffer) outside React.
- React components subscribe to throttled telemetry snapshots at ≤ 10 Hz using `useSyncExternalStore` or scheduled animation frame readers.

## 2. Off-Thread Parsing & Worker Transfer
- SSE streams transporting chunked JSONL batches (20-60 frames) must be parsed in a dedicated worker or streamed directly into typed Float32Array buffers.
- Use transferable `ArrayBuffer` where possible to achieve zero-copy deserialization between web workers and the main thread.
- Deserialized frames must be validated with Zod at ingestion boundaries. Malformed frames increment `invalidFrames` counters and never reach the 3D scene graph.

## 3. Playback & Replay Scrubber
- History ring buffer stores the most recent 6,000 frames (100 seconds @ 60 FPS) in a preallocated typed circular buffer.
- Seeking and scrubber scrubbing reads from this buffer instantaneously without triggering React state cascade.
- Replay mode updates the visual robot pose via imperative refs (`robotGroupRef.current.position.set(...)`).
