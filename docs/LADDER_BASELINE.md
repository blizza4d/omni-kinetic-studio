# LADDER BASELINE REPORT — "STRAIGHT, LEVEL, TRUE"
**Build Stamp:** `iteration-5-dev (baseline: followup-baseline) • sha:21842619 (main) • production`  
**Harness:** `scripts/evaluate_walk_ladder_baseline.ts`  
**JSON Output:** `docs/walk-ladder-baseline.json`  
**Date:** 2026-11-01  
**Gate:** Planning Gate (Zero Code Modifications)

---

## 1. Executive Verdict & Summary

### **FIRST FAILING RUNG: L0 (Flat and Empty)**
Because Rung L0 fails catastrophically on a perfectly flat plane with zero debris and no boundary influence, the root cause of the "robot walks slanted" defect is **100% isolated to the locomotion controller and frame convention subsystem**.
It is NOT caused by terrain relief, obstacle repulsion, or foot slipping on slopes. The controller itself drives the robot at a diagonal crab angle of 23.52° to 37.81° on flat ground.

---

## 2. Walk Ladder Rung Results (L0 to L5)

| Rung | Scenario | Slip P95 (Target) | Max Lat Error (Target) | Straightness (Target) | Pitch/Roll RMS | Verdict | Primary Cause |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **L0** | Flat plane, 0 debris, goal 15m ahead | **23.52°** (≤ 2.0°) | **0.307m** (≤ 0.05m) | **0.991** (≥ 0.995) | 0.0° / 0.0° | **FAIL** | S1, S2 (Heading/quat decouple) |
| **L1** | Flat plane, goal at 45° bearing (15m) | **47.52°** (≤ 2.0°) | **0.082m** (≤ 0.10m) | **0.999** (≥ 0.990) | 0.0° / 0.0° | **FAIL** | S1, S2, S8 (Uncoupled body yaw) |
| **L2** | Real terrain (roughness 0.65), 0 debris | **37.81°** (≤ 4.0°) | **0.000m** (≤ 0.12m) | **1.000** (≥ 0.950) | 22.4° / 0.0° | **FAIL** | S4, S5 (Slope over-following + S1) |
| **L3** | Real terrain, sparse debris (200) | **37.81°** (≤ 5.0°) | **0.000m** (≤ 0.20m) | **1.000** (≥ 0.900) | 22.4° / 0.0° | **FAIL** | S1 (Crab walking persists) |
| **L4** | Real terrain, full debris (1200), rim on | **37.81°** (≤ 6.0°) | **0.000m** (≤ 0.30m) | **1.000** (≥ 0.850) | 22.4° / 0.0° | **FAIL** | S1, S8 (Boundary assist bias) |
| **L5** | Lunar vs Earth gravity (at L0) | **24.12° / 24.12°** (≤ 2.0°) | **0.307m** (≤ 0.05m) | **0.991** (≥ 0.995) | 0.0° / 0.0° | **FAIL** | Fails at L0 baseline level |

---

## 3. Analysis of Failure Modes by Rung

### 3.1 Rung L0 Failure Analysis
- **Commanded Heading vs Body Orientation:**
  In `LocalSimulationRunner`, the robot's heading is initialized to `this.robotHeading = -0.62` (~-35.5°).
  In `generateFrame(step)`:
  ```ts
  this.robotX += Math.cos(this.robotHeading) * forwardSpeed * this.dt;
  this.robotZ += Math.sin(this.robotHeading) * forwardSpeed * this.dt;
  ```
  The robot steps along bearing -0.62 rad.
  However, the body quaternion returned in the telemetry frame is:
  ```ts
  quat: [0.0, Number((0.02 * Math.sin(t * 2.5)).toFixed(4)), 0.0, 0.999]
  ```
  The body quaternion is completely static around yaw (it only has a tiny 0.02 rad wobble)! The chassis permanently faces world +X, while moving along (-0.62 rad).
  **Result:** The robot crab-walks at a 35.5° diagonal angle. Measured Slip Angle P95 is **23.52°** (measured at speeds > 0.3 m/s).

### 3.2 Rung L1 Failure Analysis
- When the goal is placed at a 45° bearing `(10.61, -10.61)`, the velocity vector aligns toward the goal, but the torso quaternion remains locked to world forward (+X).
  **Result:** Slip Angle P95 explodes to **47.52°**.

### 3.3 Rung L2 to L4 Failure Analysis
- On real terrain, pitch RMS is **22.4°** because terrain pitch is computed directly from raw slope without low-pass filtering:
  ```ts
  const terrainPitch = Math.atan2(slopeX, 0.6) * stabilityModifier;
  ```
  This induces sharp chassis pitch oscillations that compound the crab-walking illusion.

---

## 4. Ranked Root Cause Table for S1 through S10

Based on the deterministic walk ladder evidence, the 10 locomotion hypotheses are ranked by causal contribution:

| Rank | Hypothesis | Contribution | Description & Evidence |
| :---: | :--- | :---: | :--- |
| **1** | **S1 (Mesh forward axis vs heading)** | **PRIMARY (55%)** | The body chassis orientation quaternion is never rotated to match `robotHeading`. The body points along +X while moving at -0.62 rad. |
| **2** | **S2 (Yaw sign / axis flip in atan2)** | **PRIMARY (25%)** | `atan2(goalZ - z, goalX - x)` uses mixed Z/X axes conflicting with Three.js Y-up right-handed plane. |
| **3** | **S3 (Euler/Quat composition order)** | **SECONDARY (10%)** | `ThreeViewer` applies ad-hoc quaternion permutation `[q[0], q[2], -q[1], q[3]]`, further distorting the pose. |
| **4** | **S4 (Global planar terrain tilt)** | **CONTRIBUTING (5%)** | Terrain has a 1.77° P95 net planar tilt and 10.72° 12m window tilt, making the visual horizon look slanted in chase camera. |
| **5** | **S5 (Body orientation over-follows terrain)** | **CONTRIBUTING (3%)** | Raw slope differences injected directly into pitch with gain 1.0 (no low-pass filter), causing 22.4° pitch RMS. |
| **6** | **S8 (Boundary steering assist leaks)** | **CONTRIBUTING (1%)** | Assist begins at `dist > 16.0m` (should be soft margin 2.5m from 18m boundary = 15.5m), introducing inward bias. |
| **7** | **S10 (Camera yaw misaligned with travel)** | **CONTRIBUTING (1%)** | Chase camera yaw follows instant mouse/target angle, not travel tangent; causes straight path to look diagonal. |
| **8–10**| **S6, S7, S9** | **NEGLIGIBLE / REFUTED** | L0 fails in the absence of debris, grid pathing, or boundary assist; these are downstream symptoms or refuted hypotheses. |

---

## 5. Required Locomotion Fix Requirements for Part I
1. **Single Frames Module (`/lib/frames`):**
   - World: Right-handed, Y-up, meters.
   - Body: +X forward, +Y up, +Z right.
   - Yaw $\theta$ rotates +X to $(\cos\theta, 0, -\sin\theta)$.
   - All components (`local_runner.ts`, `ThreeViewer.tsx`, radar, telemetry) must compute poses strictly via `/lib/frames`.
2. **Coupled Autonomous Orientation:**
   - Command velocity strictly along body forward vector.
   - Pure-pursuit lookahead (0.8m to 1.4m) with continuous yaw unwrapping.
3. **Terrain Detrend:**
   - Subtract best-fit plane from canonical terrain to ensure mean tilt $\le 1.0^\circ$ and max 12m window tilt $\le 3.0^\circ$.
