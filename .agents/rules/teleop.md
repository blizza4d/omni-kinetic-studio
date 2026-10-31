# Teleoperation Rules — Computer Vision & Gesture Mapping

- **Worker Thread Execution:** Vision processing (MediaPipe Tasks Vision) runs strictly inside a dedicated Web Worker (`workers/vision/vision.worker.ts`) using OffscreenCanvas or transferable ImageBitmaps. Main-thread execution cost must remain $\le 1.0\text{ ms}$.
- **WebGPU Delegate with WASM Fallback:** WebGPU delegate is prioritized for $\ge 30\text{ FPS}$ on dedicated GPUs; automatic fallback to vendored WASM SIMD runtime ($\ge 15\text{ FPS}$) when WebGPU is unavailable.
- **Latency HUD Invariant:** End-to-end latency (capture + inference + mapping + render) must maintain p50 $\le 100\text{ ms}$. The readout turns brick above $150\text{ ms}$.
- **One Euro Tremor Filtering:** All raw landmark coordinates pass through a One Euro filter ($\beta = 0.007$, $minCutoff = 1.0$) to eliminate hand tremor without latency penalty.
- **First-Class Fallbacks:** Complete, ergonomic keyboard teleoperation (`WASD` body, `IJKL` leg IK, `1`-`4` limb select, `R` record, `Enter` commit, `Esc` release) and `ReplayProvider` fixture playback must always work without a camera.
