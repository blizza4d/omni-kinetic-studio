# CV Teleoperation Rules

1. **Client-Side Privacy & Threading:**
   - Video frames NEVER leave the client browser.
   - Run MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) exclusively inside a dedicated Web Worker (`/workers/vision/vision.worker.ts`).
   - Transfer webcam frames using `ImageBitmap` zero-copy transfer (`postMessage({ frame }, [frame])`) and close frames immediately in the worker.

2. **Acceleration & Fallbacks:**
   - Attempt `delegate: "GPU"` first.
   - If WebGL2/WebGPU context creation fails, smoothly catch the error and fallback to `delegate: "CPU"` (WASM) without crashing the application.
   - Provide an on-screen hardware status badge.

3. **Temporal Filtering & Latency:**
   - Keep glass-to-joint end-to-end latency below 100 ms.
   - Apply the One Euro filter (`/lib/filters/one_euro.ts`) to raw landmark vectors to remove jitter without introducing phase lag.
   - Strictly respect monotonic increasing timestamps in `detectForVideo(imageBitmap, timestamp)`.

4. **Biomechanical IK & Demonstration Harvest:**
   - Map index fingertip target to the quadruped leg end-effector using the FABRIK solver (`/lib/ik/fabrik.ts`).
   - Map face yaw and pitch to Three.js camera orbital navigation.
   - Record `(obs, action, t)` tuples during active teleoperation sessions and export DAgger demonstration episode payloads.
