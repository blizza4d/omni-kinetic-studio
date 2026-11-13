# Omni-Kinetic Droid Animation Diagnosis & Baseline Audit

**Date:** 2026-11-13  
**Status:** Pre-Rebuild Diagnostic Audit (Phase F0)  
**Target:** Droid Locomotion, Kinematics, Frame Pacing, and Camera Pipeline  

---

## 1. Droid Morphology & Pipeline Discovery (Section 0.2)

### 1.1 Morphology
- **Form Factor:** 12-DOF Quadruped Droid ("Nova")
- **Chassis Body:** Beveled box geometry `(0.60m x 0.16m x 0.30m)` with cream high-contrast dorsal stripe and lower highlight bevel.
- **Leg Kinematics:** 4 symmetric limbs (`FL`, `FR`, `RL`, `RR`) at hip offsets:
  - `FL`: $[+0.24, 0.0, -0.15]\text{ m}$ (Front-Left)
  - `FR`: $[+0.24, 0.0, +0.15]\text{ m}$ (Front-Right)
  - `RL`: $[-0.24, 0.0, -0.15]\text{ m}$ (Rear-Left)
  - `RR`: $[-0.24, 0.0, +0.15]\text{ m}$ (Rear-Right)
- **Link Lengths:** Thigh length $L_1 = 0.22\text{ m}$, Calf length $L_2 = 0.22\text{ m}$. Standing hip height $H \approx 0.385\text{ m}$. Maximum reach $L_{\text{reach}} = 0.44\text{ m}$.
- **Joint Axes:** 3 DOF per leg:
  - Hip Joint (`${leg}_hip_joint`): Coronal lateral roll (rotation around $X$)
  - Thigh Joint (`${leg}_thigh_joint`): Sagittal pitch swing (rotation around $Z$)
  - Calf Joint (`${leg}_calf_joint`): Sagittal knee flexion (rotation around $Z$)

### 1.2 Rendering Path
- **Engine:** Three.js `WebGLRenderer` mounted in `components/viewer/ThreeViewer.tsx`.
- **Canvas Lifecycle:** Dedicated animation loop running on `requestAnimationFrame(animate)`.
- **Mesh Structure:** Rigid hierarchy of `THREE.Group` nodes (`robotGroup -> hipGroup -> thighGroup -> calfGroup`). Non-skinned mesh hierarchy.

### 1.3 Animation Driver & Timing Source
- **Telemetry Streaming:** Server-Sent Events (`/api/jobs/stream`) emits batches of 30 frames at $60\text{ Hz}$ every $500\text{ ms}$ (`batchIntervalMs = 500`).
- **Client Ingestion:** `components/shell/Shell.tsx` ingests batches via `TelemetryStore.ingestBatch(batch.frames)`.
- **Viewer Sampling:** `ThreeViewer.tsx` samples `store.getLatestFrame()`.
- **Camera Follow:** `camera.lookAt(clampedLookX, robotPos.y + 0.2, clampedLookZ)` with frame-rate dependent easing: `angle += (target - angle) * 0.12`.

---

## 2. Diagnosis Checklist (Section 1)

| Item | Diagnosis Check | Status | Evidence | Root Cause & Planned Fix |
|---|---|---|---|---|
| **1.1.1** | No interpolation between sim steps | **CRITICAL DEFECT** | `ThreeViewer.tsx` calls `store.getLatestFrame()` directly. When 30-frame batches arrive at $500\text{ ms}$, the store overwrites `latestFrame` to frame 30. Droid remains static for 29 frames, then teleports $0.475\text{ m}$ in 1 frame. Jerk RMS: **$244,787\text{ m/s}^3$**. | Implement `FixedStepLoop` with `prev` and `curr` snapshot interpolation using fractional accumulator `alpha`. |
| **1.1.2** | Variable delta time driving animation | **PRESENT** | Raw `(now - lastTimestamp)` passed directly to camera and shaders without pacer snapping or clamping. Jitter induces speed wobble. | Implement `FramePacer` to detect display refresh (60, 75, 90, 120, 144 Hz) and snap stable deltas within $12\%$. |
| **1.1.3** | Frame-time spikes & GC pauses | **PRESENT** | In `ThreeViewer.tsx` line 434: `new THREE.Vector3(0, 0.45, 0)` allocated every rendered frame ($60\text{ allocations/sec}$). | Enforce zero-allocation invariant with preallocated vectors, matrices, and reusable scratch objects. |
| **1.1.4** | Two independent loops | **PRESENT** | Simulation batch generation in API route runs on `setInterval(500ms)`, while viewer runs on browser `requestAnimationFrame`. | Unify client rendering around a single RAF loop driving a fixed-timestep simulator (`step = 1/120s`). |
| **1.1.5** | Update order & relative jitter | **PRESENT** | Camera calculates look-at directly from un-interpolated `robotPos` while smoothing angle with `0.12`. Camera relative jitter: **$260.66\text{ px}$**. | Enforce strict update order: Input -> Fixed Sim -> Alpha Interpolate -> Camera Follow -> HUD -> Render. |
| **1.1.6** | Tab throttling & accumulator explosion | **PRESENT** | Switching tabs or backgrounding window causes accumulation burst upon return. | Detect `document.visibilityState`; reset accumulator and clamp frame deltas to $0.1\text{ s}$ max. |
| **1.1.7** | Time-driven gait sliding | **RESOLVED** | Distance-driven phase tracking implemented in `GaitPhaseTracker`, but rendered poses lacked sub-frame interpolation. | Maintain distance-driven phase while feeding interpolated state to visual rig. |
| **1.1.8** | Sine-wave limbs without weight | **RESOLVED** | Analytical 2-bone IK in place, but transitions lacked dynamic spring settling. | Integrate minimum-jerk swing profiles and quintic polynomial foot trajectories. |
| **1.1.9** | Snapping state changes | **PRESENT** | State transitions (walk -> stop, turn -> walk) switch states discontinuously without offset decay. | Implement `OffsetScalar` and `OffsetQuat` inertialization springs (half-life $0.08\text{–}0.15\text{s}$). |
| **1.1.10** | Linear easing or frame-rate dependent lerp | **PRESENT** | Camera angles update with `current += (target - current) * 0.12`. Runs $>2\times$ faster on 144 Hz displays than 60 Hz. | Replace all ad-hoc lerps with critically damped analytic springs (`springDamper`) and `halfLifeAlpha`. |
| **1.1.11** | Euler-angle interpolation | **PRESENT** | Joint angles in `ThreeViewer.tsx` set via `group.rotation.x = j.angle; group.rotation.z = -j.angle`. | Maintain quaternion-based bone orientation and shortest-path slerp interpolation. |
| **1.1.12** | IK popping at extension limits | **PARTIAL** | Hard clamp at $0.4378\text{ m}$ prevented NaNs, but sudden acceleration near limits produced visual stiffness. | Implement exponential soft extension limiting in `solveTwoBone` with pole vector perpendicularity. |
| **1.1.13** | No secondary motion | **PRESENT** | Chassis and sensor masts move as single rigid solid without inertia, anticipation, or lag. | Add secondary motion springs for antenna/cables and torso counter-rotation ($2^\circ\text{–}4^\circ$). |
| **1.1.14** | No weight / settle / anticipation | **PRESENT** | Droid stops abruptly when command drops to 0; no landing compression on touchdown after low-gravity flight. | Add landing absorption spring (`k * landingVelocity`) and stop settle bounce ($< 5\%$ leg length). |
| **1.1.15** | Streamed poses applied directly | **CRITICAL DEFECT** | Incoming SSE batches applied without local jitter buffer, causing discrete jumps every $500\text{ ms}$. | Implement local client jitter buffer ($100\text{ ms}$) with velocity-driven interpolation. |
| **1.1.16** | Physics contact solver jitter | **ABSENT** | Procedural kinematics used for visual model; no contact solver chatter present. | Keep visual pose isolated from raw physics solver chatter. |
| **1.1.17** | Camera follow without delta-time smoothing | **PRESENT** | Camera smoothing uses constant $0.12$ multiplier per frame without delta time. | Implement critically damped camera spring with $0.18\text{ s}$ position and $0.12\text{ s}$ look-at half-lives. |
| **1.1.18** | React re-renders at frame rate | **RESOLVED** | `TelemetryStore` decoupled from React state; throttled to $10\text{ Hz}$ subscriber notifications. | Retain mutable ref architecture for all render-loop observables. |
| **1.1.19** | Quality tier popping | **PRESENT** | Shadow maps and particle counts can drop abruptly across frame rate fluctuations. | Add hysteresis thresholds and opacity cross-fading for tier adjustments. |

---

## 3. Baseline Quantitative Measurements (Phase F0)

Measurements captured using `scripts/record_baseline_trace.ts` over $20.0\text{ s}$ of continuous locomotion at $60\text{ Hz}$ display refresh rate:

```
[Baseline Pacing Metrics]
- Median Frame Delta: 0.016667 s (60.0 FPS)
- P95 Frame Delta: 0.016667 s
- Detected Refresh Period: 0.016667 s (60 Hz)
- Judder Index: 0.0000 (Synthetic timer)
- Stutter Count: 0.00 / min

[Baseline Motion Smoothness Metrics]
- Root Jerk RMS: 244,787.30 m/s³   (Target: < 150.0 m/s³)
- Peak Root Jerk: 6,798,197.13 m/s³
- Velocity Continuity Violations: 78 frames (Discontinuous teleport jumps)
- Stance Foot Slip (Max): 0.000000 m (Locally locked)
- Camera Relative Jitter: 260.661 px (Target: < 0.15 px)
```

---

## 4. Top Three Causes of Non-Fluidity (Ranked by Measured Impact)

1. **Absence of Sub-Frame Interpolation on 500ms Discrete Batch Delivery:**  
   Because telemetry arrives in chunks of 30 frames every $500\text{ ms}$ and `ThreeViewer.tsx` samples `store.getLatestFrame()`, the visual mesh freezes for 29 frames and jumps $0.475\text{ m}$ forward in a single frame. This produces massive jerk ($244,787\text{ m/s}^3$) and 78 severe velocity discontinuities.
2. **Frame-Rate Dependent Camera Follow on Discrete Root Transforms:**  
   The camera easing uses raw `angle += (target - angle) * 0.12` and looks directly at the jumping `robotPos`. The combination of un-interpolated target jumps and frame-rate dependent camera smoothing produces **$260.66\text{ px}$ of relative visual jitter**, making the droid vibrate violently against the terrain background.
3. **Absence of Inertialized State Transitions & Continuous Spring Smoothing:**  
   State transitions (standing to walking, stopping, turning) occur without inertialized offset decay, causing abrupt angular kicks in chassis pitch and roll.
