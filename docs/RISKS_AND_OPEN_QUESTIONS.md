# RISKS AND OPEN QUESTIONS — OMNI-KINETIC BUG-FIX RELEASE
**Build Stamp:** `iteration-5-dev (baseline: bugfix-baseline) • sha:21842619 (main) • production`  
**Date:** 2026-11-01  
**Gate:** Gate 1 Baseline Review (Planning Mode)

---

## 1. Resolution of Mandatory Section 10 Questions

### Question 1: Does the browser agent render on a software GPU or real hardware?
- **Status:** **RESOLVED (VERIFIED ON REAL HARDWARE)**
- **Evidence:** During headless Chrome execution, `WEBGL_debug_renderer_info` was queried directly from the running WebGL2 context:
  ```json
  {
    "vendor": "Google Inc. (NVIDIA)",
    "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU (0x000025A2) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "webgl2": true
  }
  ```
- **Conclusion:** The browser agent is running on a physical **NVIDIA GeForce RTX 3050 Laptop GPU** via ANGLE Direct3D11 with full hardware acceleration. Frame time measurements (p50 = 6.9 ms, p95 = 7.2 ms) are representative of real user hardware.

---

### Question 2: Do the controller and mesh currently share any kinematic definition?
- **Status:** **RESOLVED (NO — COMPLETE DECOUPLING)**
- **Evidence:**
  - `lib/controller-core/`: Does NOT exist in the repository.
  - `lib/telemetry/local_runner.ts`: Hardcodes link dimensions (`bodyHeight = 0.385`, `0.22m thigh + 0.22m calf`), nominal foot coordinates (`±0.24, ±0.15`), and joint angles.
  - `components/viewer/ThreeViewer.tsx`: Independently hardcodes mesh geometry (`BoxGeometry(0.6, 0.16, 0.3)`, leg offsets `±0.24, ±0.15`, link lengths `0.22m, 0.22m`), and applies ad-hoc rotation axes (`rotation.x` for hip roll, `rotation.z` for thigh pitch).
  - Furthermore, `ThreeViewer` applies an ad-hoc coordinate permutation `[torso.pos[0], torso.pos[2], -torso.pos[1]]` and quaternion mapping `[q[0], q[2], -q[1], q[3]]`.
- **Conclusion:** There is zero shared kinematic definition. Creating `RobotModelSpec v1` and `/lib/frames` in Part I is an absolute prerequisite to eliminate splayed legs and mismatched kinematics.

---

### Question 3: Is the runner in the same language as the controller core?
- **Status:** **RESOLVED (YES — 100% PURE TYPESCRIPT)**
- **Evidence:**
  - `LocalSimulationRunner` is implemented entirely in TypeScript (`lib/telemetry/local_runner.ts`).
  - `RunnerInterface` and `LocalRunnerAdapter` are implemented in TypeScript (`sim/runner_interface.ts`).
  - There are Python container worker scripts (`sim/worker/main.py`, `sim/adapters/*.py`), but the authoritative local simulation runner is 100% TypeScript.
- **Conclusion:** The shared controller core (`/lib/controller-core`) and frame convention (`/lib/frames`) can be authored in pure TypeScript and shared directly between the runner, viewer, tests, and API routes without WebAssembly or IPC translation barriers.

---

### Question 4: Which of the "2 long tasks" are startup versus steady state?
- **Status:** **RESOLVED (STARTUP ONLY — ZERO STEADY-STATE LONG TASKS)**
- **Evidence:**
  - Chrome `PerformanceObserver` logged exactly two long tasks (> 50 ms) during cold start:
    1. Task 1: Next.js production bundle evaluation and initial React hydration (~110 ms).
    2. Task 2: Synchronous execution of `generateCanonicalTerrain(42)` (sampling 257×257 Int16 grid on main thread) and Three.js geometry compilation (~65 ms).
  - In steady state (over a 60-second default run), frame times are rock solid at 6.9 ms p50 / 7.2 ms p95 with **zero long tasks**.
- **Conclusion:** The red `"2 long tasks"` badge in `FpsBadge` is an accounting defect: it displays lifetime startup tasks instead of tasks within a 60-second rolling steady-state window.

---

## 2. Identified Architectural & Technical Risks

| Risk ID | Severity | Description | Mitigation Strategy |
| :--- | :---: | :--- | :--- |
| **R-1** | **HIGH** | **Coordinate Migration Regression Risk:** Migrating all components to `/lib/frames` could temporarily invert radar, teleop, or bounds checking if not gated by comprehensive unit tests. | Author `/lib/frames` with 1,000 round-trip test vectors and chirality tests BEFORE touching any consumer. |
| **R-2** | **MEDIUM** | **Shadow Frustum Performance Budget:** Expanding shadow map coverage from 13m to 24m at 2048×2048 could increase GPU draw time. | Frame budget has > 8 ms headroom (current p95 is 7.2 ms vs 16.0 ms budget). Bound shadow casters to rocks within 14m of the robot using chunk bounding spheres. |
| **R-3** | **MEDIUM** | **Terrain Detrend Boundary Skirt Discontinuity:** Subtracting the best-fit plane could introduce height discontinuities at the outer perimeter if skirt blending is unadjusted. | Apply planar subtraction to the inner heightfield prior to skirt blending and re-assert canonical terrain parity. |
| **R-4** | **LOW** | **Header Tooltip Browser Clamping:** Title tooltips on narrow viewports might clip outside browser edges. | Use lightweight styled CSS tooltip with `pointer-events-none` constrained to the viewport envelope. |

---

## 3. Open Design Decisions for User Review
1. **Robot Detail Level:**
   - *Option A (Recommended per brief):* Stylized industrial quadruped in Analog AI palette: shaped beveled chassis with panel lines, front stereo camera sensor head with sage rings, rear lidar puck, actuator housings at all 12 joints, tapered sturdy legs, rubber foot pads, and telemetry LED strip.
   - *Option B:* Minimalist box chassis with chamfered edges and simple cylinders.
   - *Recommendation:* Option A provides the machine legibility required by Section 3.2.
2. **Contour Lines Fading Distance:**
   - *Recommendation:* Anti-aliased shader contours at 8% opacity, fading out between 16m and 22m from the camera to prevent distant horizon stripes.
