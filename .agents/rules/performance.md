# Performance & Graphics Rules (@performance.md)

## 1. Frame Budget (Production build on 1080p mid-range hardware)
- **Frame time:** p50 ≤ 12 ms, p95 ≤ 20 ms, p99 ≤ 33 ms over 5 minutes.
- **Long tasks (>50 ms):** Zero in steady state; none >100 ms at any time except initial load.
- **Main-thread scripting:** ≤ 6 ms per frame.
- **Telemetry ingest:** ≤ 1 ms per frame.
- **Radar update:** ≤ 1.5 ms per tick at 10–20 Hz.
- **Draw calls & Triangles:** Draw calls ≤ 150, triangles ≤ 400k at default tier.
- **React commits:** ≤ 10 per second during active simulation run. Viewer subtree must never re-render from telemetry.
- **Input latency:** Keyboard shortcuts (Ctrl+K, T, ?, Space, Q, B, P) respond in < 100 ms.
- **Heap stability:** Heap growth < 10% over 5 minutes; zero sawtooth GC pauses > 16 ms.

## 2. Rendering & Graphics Policies
- **Pixel ratio & MSAA:** Cap DPR to 1.5 (or 1.0 in Low/Potato tiers); configure `powerPreference: 'high-performance'`.
- **Shadow Camera:** Tight following shadow frustum centered on robot (`[-6, 6] x [-6, 6]`), not spanning the whole 40x40m world. Update shadow map on demand or at throttled 30 Hz.
- **Debris Chunking & Culling:** Partition 1,800 debris instances into 4x4 spatial chunks with individual bounding spheres so Three.js frustum culling skips off-screen chunks. Use shared geometries and static instance matrix buffers.
- **Dust Particles:** Driven via GPU vertex shader (or static drift buffer), eliminating CPU `Float32Array` mutation and per-frame GPU buffer re-upload.
- **Terrain Skirt & Grid:** Add downward skirts to terrain edges to seal gaps. Replace floating `GridHelper` with a terrain-conforming grid shader.
- **Motion Trail:** Preallocated circular buffer of points; update draw range dynamically without `array.splice()` reallocations.

## 3. Honest FPS Badge & Quality Governor
- Never display a naive raw rAF counter.
- Report rolling 5-second window: p50 and p95 frame times, long task counts, and active tier.
- Five distinct quality tiers: Ultra, High, Medium, Low, Potato.
- Step down tier after 3 seconds of sustained frame drops; restore after 15 seconds of recovery (hysteresis protection).
