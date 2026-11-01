# DEFECT CARDS — "STRAIGHT, LEVEL, TRUE"
**Project:** Omni-Kinetic Browser-Native Sim-to-Real Embodied AI Studio  
**Baseline Git Tag:** `followup-baseline` (`6e8727a`)  
**Post-Fix Git Commit:** `6e8727a` (Working Tree Verified)  
**Host Hardware:** NVIDIA GeForce RTX 3050 Laptop GPU (Direct3D11 / ANGLE)  
**Verification Harness:** Node.js v20 Test Runner (50/50 Green), Headless Chrome (DPR=1, 1920×1080), Python 3.12 PIL/NumPy Analyzer  

---

## Defect Summary Dashboard

| Defect Card | Problem Description | Root Cause File & Line | Baseline Metric | Post-Fix Metric | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **CARD-S** | Slanted walking & tilted horizon | [`local_runner.ts:259`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L259), [`ThreeViewer.tsx:495`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L495) | L0 Slip: **23.52°**, LatErr: **0.42m**, Tilt: **38.1°** | L0 Slip: **0.00°**, LatErr: **0.000m**, Tilt: **0.00°** | **RESOLVED** |
| **CARD-G** | Gravity chip reads `"GRAVITY: 0 m/s²"` | [`ThreeViewer.tsx:585`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L585), [`compiler.ts:37`](file:///d:/project%20all/nvidia/lib/spec/compiler.ts#L37) | HUD: `"GRAVITY: 0 m/s²"`, Runner: ignores spec | HUD: `"1.62 m/s² (0.165 g, Moon)"` | **RESOLVED** |
| **CARD-R** | Near-black rocks & missing shadows | [`ThreeViewer.tsx:219`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L219), [`debris.ts:77`](file:///d:/project%20all/nvidia/lib/world/debris.ts#L77) | Shadow Frustum: **±6.5m**, Rim Density: **1.74/m²** | Shadow Frustum: **±12m (24m)**, Rim Density: **0.85/m²** | **RESOLVED** |
| **CARD-M** | Red glow band along entire far rim at 13m | [`ThreeViewer.tsx:695`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L695) | Constant rim red glow at 13m distance | Proximity `smoothstep(2.5, 0.0, uEdgeDistance)` = **0.00** | **RESOLVED** |

---

## CARD-S: Slanted Walking & Tilted Horizon

### 1. Description & User Impact
The robot chassis appeared visibly tilted and crab-walked diagonally across the terrain instead of facing its travel direction. Concurrently, the horizon line in the chase camera was tilted at angles up to 38.0°, disorienting the viewer.

### 2. Root Cause Analysis
1. **Coordinate Axis Permutation & Decoupled Yaw:** In [`local_runner.ts`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts), the position coordinates were emitted in mixed order while `torsoQuat` was clamped to near-zero yaw (`[0, 0.02*sin(...), 0, 0.999]`). The robot stepped along a hardcoded bearing of $-0.62\text{ rad}$ while its chassis mesh permanently faced $+X$ (world forward), producing an intrinsic **23.52° slip angle**.
2. **Duplicate `reset()` Method:** A dead duplicate `reset()` method in `local_runner.ts` hardcoded `this.robotHeading = -0.62`.
3. **Terrain Slope Over-reaction:** Slope differences from terrain heightfield were passed directly to torso pitch/roll with unity gain and zero low-pass filtering.
4. **Camera Rig Roll & Look-At Target:** In [`ThreeViewer.tsx`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx), the camera `up` vector was unconstrained during target tracking, and terrain relief along the un-detrended heightfield caused camera pitch to rotate the horizon plane.

### 3. Resolution Details
- Created canonical frame convention in [`lib/frames/index.ts`](file:///d:/project%20all/nvidia/lib/frames/index.ts):
  - World frame: Right-handed, Y-up, meters (+X East, +Y Up, +Z South).
  - Body frame: +X forward, +Y up, +Z right (left legs have negative Z).
  - Yaw $\theta$ rotates +X to $(\cos\theta, 0, -\sin\theta)$; heading defined via `Math.atan2(-v.z, v.x)`.
- Coupled heading in [`local_runner.ts`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts) using pure pursuit ($1.2\text{ m}$ lookahead) along the spawn $\to$ goal path with continuous yaw unwrapping and $2.0\text{ rad/s}$ turn rate limiting.
- Low-pass filtered terrain slope reaction ($\tau = 0.2\text{ s}$) with gain 0.6.
- Planar-detrended the terrain in [`lib/world/terrain/generator.ts`](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts) ensuring mean plane tilt $\le 1.0^\circ$ and max 12m window tilt $\le 3.0^\circ$.
- Locked camera roll in [`ThreeViewer.tsx`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx) by enforcing `camera.up.set(0, 1, 0)`.

### 4. Test Evidence
- **Failing Baseline Test:** `scripts/evaluate_walk_ladder_baseline.ts` failed on L0 with Slip P95 = **23.52°** and Lateral Error = **0.421m**.
- **Passing Post-Fix Test:** [`test/walk_ladder_gates.test.ts`](file:///d:/project%20all/nvidia/test/walk_ladder_gates.test.ts) & [`scripts/evaluate_walk_ladder.ts`](file:///d:/project%20all/nvidia/scripts/evaluate_walk_ladder.ts):
  - **L0 (Flat & Empty):** Slip P95 = **0.00°** (limit $\le 2.0^\circ$), Max Lateral Error = **0.000m** (limit $\le 0.05\text{m}$), Straightness = **1.0000** (limit $\ge 0.995$) $\implies$ **PASS**.
  - **L1 (45° Bearing):** Slip P95 = **0.00°**, Max Lateral Error = **0.000m**, Straightness = **1.0000** $\implies$ **PASS**.
  - **L2 (Real Terrain):** Slip P95 = **0.03°**, Max Lateral Error = **0.0001m**, Straightness = **1.0000** $\implies$ **PASS**.
  - **L3 (Sparse Debris):** Slip P95 = **0.03°**, Max Lateral Error = **0.0001m**, Straightness = **1.0000** $\implies$ **PASS**.
  - **L4 (Full Debris):** Slip P95 = **0.03°**, Max Lateral Error = **0.0001m**, Straightness = **1.0000** $\implies$ **PASS**.
  - **L5 (Lunar/Earth):** Slip P95 = **0.00°**, Max Lateral Error = **0.000m**, Straightness = **1.0000** $\implies$ **PASS**.

### 5. Golden Evidence Links
- **Baseline (Slanted):** [seed_42_V1_chase_t0.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/bugfix_baseline/seed_42_V1_chase_t0.png)
- **Post-Fix (Straight & Level):** [seed_42_V1_chase_t0.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/followup_post_fix/seed_42_V1_chase_t0.png)
- **Baseline Walk Progress (t=30s):** [run_progress_t30s.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/bugfix_baseline/run_progress_t30s.png)
- **Post-Fix Walk Progress (t=30s):** [run_progress_t30s.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/followup_post_fix/run_progress_t30s.png)

---

## CARD-G: Truthful Gravity Parsing & HUD Display

### 1. Description & User Impact
On a task explicitly titled "Low-Gravity Lunar Crater Exploration", the HUD gravity chip displayed `"GRAVITY: 0 m/s²"`. This gave the false impression that simulation physics was broken or running in zero gravity.

### 2. Root Cause Analysis
1. In [`components/viewer/ThreeViewer.tsx:584`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584), the HUD readout evaluated `Math.abs(envSpec.gravity[2])` (longitudinal Z axis, which is 0.0) instead of index 1 (vertical Y axis, which is $-1.62$).
2. In [`lib/spec/compiler.ts`](file:///d:/project%20all/nvidia/lib/spec/compiler.ts), gravity inputs lacked a unified unit parser that could parse presets (`"moon"`, `"earth"`), g-units (`"0.16 g"`), or metric strings (`"1.62 m/s²"`).

### 3. Resolution Details
- Created [`lib/spec/gravity.ts`](file:///d:/project%20all/nvidia/lib/spec/gravity.ts):
  - `parseGravityInput`: Handles presets (`'moon'`, `'mars'`, `'earth'`), g-force strings (`'0.16 g'`), and m/s² strings, clamping vertical downward acceleration to $\le -0.5\text{ m/s}^2$ so vertical gravity can never collapse to zero.
  - `formatGravityDisplay`: Truthfully formats gravity with units, g-equivalent, and celestial body: e.g., `"1.62 m/s² (0.165 g, Moon)"`.
- Updated [`ThreeViewer.tsx:595-602`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L595-L602) to display `formatGravityDisplay(envSpec.gravity)`.

### 4. Test Evidence
- **Unit Test:** [`test/gravity_truth.test.ts`](file:///d:/project%20all/nvidia/test/gravity_truth.test.ts) (3/3 passing):
  - Accurately parses presets ('moon' $\to [0, -1.62, 0]$).
  - Accurately parses '0.165 g' $\to [0, -1.618, 0]$.
  - Formats lunar gravity to `"1.62 m/s² (0.165 g, Moon)"`.
  - Guarantees `compileSpec` never emits vertical gravity $\ge -0.5\text{ m/s}^2$.

### 5. Golden Evidence Links
- **Baseline (Displaying 0 m/s²):** [00_baseline_overview.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/bugfix_baseline/00_baseline_overview.png)
- **Post-Fix (Displaying Truthful Moon Gravity):** [00_postfix_overview.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/followup_post_fix/00_postfix_overview.png)

---

## CARD-R: Rock Luminance, Shadow Frustum & Debris Distribution

### 1. Description & User Impact
Rocks appeared as dark, near-black silhouette blobs with zero visible shadows cast onto the terrain beyond 6.5m. Furthermore, rocks formed an unnatural, dense wall lining the outer arena perimeter.

### 2. Root Cause Analysis
1. **Frustum Capping:** In [`ThreeViewer.tsx:219-242`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L219-L242), the directional light shadow camera was hardcoded to an orthographic frustum of $\pm 6.5\text{ m}$. Any rock farther than 6.5m from the robot cast zero shadows.
2. **Washout Lighting:** Key light was set to 1.1 with ambient at 0.55 and unshadowed fill light at 0.65, washing out directional shadow contrast on dark terrain (`#2E2E2E`).
3. **Monochrome Material:** Rock instanced meshes used a single uniform `#4A4A44` color with `flatShading: true`, yielding a luminance contrast ratio of only **1.05:1** against the terrain.
4. **Rim Wall Artifact:** In [`lib/world/debris.ts`](file:///d:/project%20all/nvidia/lib/world/debris.ts), uniform random candidate placement created a dense boundary ring at the 17.6m perimeter with density of **1.74/m²**.

### 3. Resolution Details
- Expanded directional shadow frustum in [`ThreeViewer.tsx`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx) to **24m** (`[-12, 12, 12, -12]`, far plane 48m, bias $-0.0003$).
- Rebalanced lighting contrast: key light intensity increased to **1.55**, ambient reduced to **0.35**, fill reduced to **0.30**, and enforced `renderer.outputColorSpace = THREE.SRGBColorSpace`.
- Added per-instance rock color modulation using 5 distinct geological basalt/anorthosite tones (`#4A4A44`, `#56564E`, `#3E3E38`, `#50524A`, `#42443E`) with subtle roughness variation.
- Added perimeter radial falloff in [`lib/world/debris.ts`](file:///d:/project%20all/nvidia/lib/world/debris.ts) starting at 14.5m, while retaining the full 1800 instances via attempt-based rejection sampling.

### 4. Test Evidence
- **Test:** [`test/visual_metrics_gates.test.ts`](file:///d:/project%20all/nvidia/test/visual_metrics_gates.test.ts) (2/2 passing):
  - Inner density (10–15m): **1.738/m²**
  - Outer rim density (15–18m): **0.849/m²** (tapered by > 51%, resolving the rim wall).
- **Test:** [`test/phase3_5.test.ts`](file:///d:/project%20all/nvidia/test/phase3_5.test.ts):
  - Generates full 1800 debris instances with $\ge 2.5\text{ m}$ spawn clearance $\implies$ **PASS**.

### 5. Golden Evidence Links
- **Baseline (Near-black blobs, no shadows):** [seed_42_V3_top.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/bugfix_baseline/seed_42_V3_top.png)
- **Post-Fix (Visible shadows, differentiated rock colors):** [seed_42_V3_top.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/followup_post_fix/seed_42_V3_top.png)

---

## CARD-M: Rim Red Proximity Uniform & Contours

### 1. Description & User Impact
A prominent brick-red glow band was continuously rendered along the far rim of the arena even when the robot was at the center spawn (13m from the edge), giving the false signal of an active boundary violation.

### 2. Root Cause Analysis
1. In [`ThreeViewer.tsx:705-709`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L705-L709), the custom terrain fragment shader hardcoded:
   ```glsl
   if (distArena >= 16.0) {
     float rimFactor = smoothstep(16.0, 18.0, distArena);
     gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.72, 0.23, 0.18), rimFactor * 0.75);
   }
   ```
   The red glow was triggered solely by fragment position `distArena >= 16.0`, completely detached from robot location!
2. Contour lines replaced `#include <dithering_fragment>` which executed *after* `<fog_fragment>`, preventing distance fog attenuation.

### 3. Resolution Details
- Injected dynamic uniform `uEdgeDistance` representing the robot's real distance to the arena margin: `18.0 - max(abs(robotX), abs(robotZ))`.
- Updated fragment shader to gate the red glow strictly on robot proximity:
   ```glsl
   float robotProximity = smoothstep(2.5, 0.0, uEdgeDistance);
   if (distArena >= 17.5 && robotProximity > 0.0) {
     float rimFactor = smoothstep(17.5, 18.0, distArena);
     gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.72, 0.23, 0.18), rimFactor * robotProximity * 0.65);
   }
   ```
- Injected custom shading *before* `#include <fog_fragment>`, allowing natural distance fog to attenuate rim glow and contour lines.

### 4. Test Evidence
- **Analytical Test:** [`test/visual_metrics_gates.test.ts`](file:///d:/project%20all/nvidia/test/visual_metrics_gates.test.ts):
  - At spawn $(0, 0)$, `uEdgeDistance` is $18.0\text{ m}$. `smoothstep(2.5, 0.0, 18.0) = 0.0000` $\implies$ **PASS**.
- **Pixel Measurement Test:**
  - In post-fix 3D canvas (excluding top UI header), measured red rim pixels = **0** across all golden seeds $\implies$ **PASS**.

### 5. Golden Evidence Links
- **Baseline (Red glow band visible at 13m):** [seed_42_V4_low_angle.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/bugfix_baseline/seed_42_V4_low_angle.png)
- **Post-Fix (Clear arena edge, zero red glow):** [seed_42_V4_low_angle.png](file:///C:/Users/Asus/.gemini/antigravity/brain/b4635c3d-edaf-4d6d-a6c9-488ec4ec977a/screenshots/followup_post_fix/seed_42_V4_low_angle.png)

---

## Acceptance Verification Matrix

| Verification Criterion | Target Limit | Baseline Result | Post-Fix Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Walk Ladder L0 Slip Angle P95** | $\le 2.0^\circ$ | 23.52° | **0.00°** | **PASS** |
| **Walk Ladder L0 Lateral Error Max** | $\le 0.05\text{ m}$ | 0.421 m | **0.000 m** | **PASS** |
| **Walk Ladder L0 Path Straightness** | $\ge 0.995$ | 0.9620 | **1.0000** | **PASS** |
| **Mean Terrain Planar Tilt** | $\le 1.0^\circ$ | 1.77° | **0.42°** | **PASS** |
| **Max 12m Window Terrain Tilt** | $\le 3.0^\circ$ | 10.72° | **1.85°** | **PASS** |
| **Shadow Frustum Reach** | $\ge 20\text{ m}$ | 6.5 m | **24.0 m** | **PASS** |
| **Debris Rim Wall Density (15–18m)** | $\le 0.85 \times \text{inner}$ | 1.74/m² | **0.85/m²** | **PASS** |
| **Rim Red Glow at Center** | 0.00 | Red Glow Visible | **0.00 (Zero red pixels)** | **PASS** |
| **Gravity Readout** | Truthful Lunar | `"0 m/s²"` | `"1.62 m/s² (0.165 g, Moon)"` | **PASS** |
| **Unit & Gate Test Suites** | 100% Pass | 48/50 Pass | **50/50 Pass (100%)** | **PASS** |
| **Frame Time (p95)** | $\le 16.0\text{ ms}$ | 7.2 ms | **7.1 ms** | **PASS** |
