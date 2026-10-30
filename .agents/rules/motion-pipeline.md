# Motion Pipeline & Authoritative Clock Rules

## 1. CLOCK & PLAYHEAD MODEL
- **Authoritative Sim Time**: Telemetry frame timestamps $t$ and sequence numbers `seq` emitted by the simulation runner are the sole source of truth for simulation time.
- **Continuous Playhead**: The viewer maintains an internal `playhead = latestSimT - renderDelay`. The playhead advances continuously by `performance.now()` elapsed wall-time deltas multiplied by playback speed.
- **Never Step by Arrival**: Poses are NEVER applied by arrival order, frame-by-frame consumption, or event-driven ticks.
- **Phase-Locked Soft Resync**: When the jitter buffer deviates from target depth (default 100 ms), adjust the playhead rate smoothly by $\text{clamp}(k \times (targetBufferMs - bufferMs), -5\%, +5\%)$. Snap only on discontinuities $> 1.0\text{s}$.

## 2. PRODUCER PACING & BATCHING
- **Target-Time Scheduling**: Simulation runner paces steps using monotonic deadlines (`startTime + step * dt`), never drifting `sleep(dt)` calls.
- **Telemetry Frequency**: Emitted at 60 Hz (minimum 30 Hz) for robot state; 20 Hz for debris reactions.
- **Time-Based Batching**: SSE transport batches frames by time interval ($\le 50\text{ ms}$ or 8 frames max), eliminating large 500ms multi-frame bursts.
- **Buffering Over Slowdown**: If the runner lags, the UI explicitly flags "Buffering" instead of playing in silent slow motion.

## 3. INTERPOLATION & EXTRAPOLATION
- **Continuous Sampling**: Poses at the playhead are sampled via cubic Hermite spline interpolation for positions and spherical linear interpolation (`slerp`) for quaternions.
- **Bounded Extrapolation**: When data arrives late, extrapolate forward for at most 100 ms using the last linear velocity vector, flag "extrapolating" in the diagnostic panel, then hold state and display "Buffering".
- **Zero Viewer Pose Smoothing**: Per-frame `lerp(pos, target, factor)` on the robot's position, rotation, and joints is strictly prohibited. Smoothing applies strictly to camera follow rigs.

## 4. CAMERA RIG
- **Critically Damped Spring**: Camera follow damping uses frame-rate independent exponential smoothing ($\alpha = 1 - \exp(-k \times dt)$) with a small velocity look-ahead.
- **Containment Envelope**: Camera position and look-at targets are clamped to `arena + 1.0m`.
