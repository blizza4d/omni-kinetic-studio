# RANKED ROOT CAUSE TABLE — "STRAIGHT, LEVEL, TRUE"
**Build Stamp:** `iteration-5-dev (baseline: followup-baseline) • sha:21842619 (main) • production`  
**Date:** 2026-11-01  
**Gate:** Planning Gate (Zero Code Modifications)

---

## 1. Ranked Root Cause Table Across the 4 Core Problems

| Rank & Area | Root Cause Description | Baseline Measurement | Target Budget | File & Line |
| :---: | :--- | :--- | :--- | :--- |
| **1. Locomotion (S1/S2)** | **Body Quaternion Uncoupled from Velocity Heading:** Local runner generates velocity along `robotHeading = -0.62` rad (-35.5°), but body quaternion has static identity yaw with only 0.02 rad wobble. The robot moves diagonally while its body faces world +X. | Slip Angle P95 is **23.52°** on flat L0; **47.52°** on L1. | Slip P95 ≤ 2.0° on L0/L1, ≤ 4.0° on L2 | [local_runner.ts:259-265](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L259-L265) |
| **2. Gravity (G1/G2)** | **Longitudinal Z-Axis Index Lookup:** HUD reads `envSpec.gravity[2]` which is 0 (longitudinal Z), instead of `envSpec.gravity[1]` which is -1.62 (vertical Y). | HUD displays `"GRAVITY: 0 m/s²"`. | Truthful `"1.62 m/s² (0.165 g, Moon)"` | [ThreeViewer.tsx:584](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |
| **3. Rim & Glow (R3)** | **Static Fragment World Distance Check:** Shader unconditionally paints any fragment with `distArena >= 16.0m` brick red, ignoring robot distance to edge! | **201px to 302px** red pixels in EVERY frame even when robot is at (0, 0). | 0 red pixels when robot > 2.5m from rim | [ThreeViewer.tsx:705-709](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L705-L709) |
| **4. Rocks & Shadows (R1/R2)** | **Frustum Narrowness & Excessive Ambient/Fill Light:** Shadow camera frustum is an orthographic box of only ±6.5m (rocks > 6.5m cast zero shadows); ambient (0.55) + unshadowed fill (0.65) washes out direct shadow contrast on dark terrain (`0x2e2e2e`). Rock material is dark charcoal (`0x4a4a44`) without `instanceColor` variation. | Zero visible rock shadows; rock contrast ratio against ground is **1.05:1**. | Visible attached shadows; rock contrast ≥ 1.4:1; min luminance > 6% | [ThreeViewer.tsx:219-242](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L219-L242) / [ThreeViewer.tsx:778-783](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L778-L783) |
| **5. Horizon Tilt (H1/S4)** | **Unconstrained fBm Plane Slope & Camera Rig Pitch:** Canonical generator sums octaves without subtracting the best-fit planar gradient. Combined with camera pitch and look-at height offset, produces severe horizon tilt. | Mean plane tilt P95 = **1.77°**; max 12m window tilt = **10.72°**; visual horizon tilt up to **38.0°**. | Mean tilt ≤ 1.0°; Max 12m window ≤ 3.0°; horizon tilt ≤ 1.0° | [generator.ts:45-95](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L45-L95) / [ThreeViewer.tsx:496-500](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L496-L500) |
| **6. Contours & Rim Shader (R4/H2)** | **Dithering Insertion Point Bypasses Fog:** Shader replaces `#include <dithering_fragment>` which executes AFTER `<fog_fragment>`, making contours and red rim immune to distance fog. | Polyline score **0.10**; horizontal stripe score **10.79**. | Polyline ≤ 0.01; Stripe ≤ 1.5; fully fogged | [ThreeViewer.tsx:676-709](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L676-L709) |

---

## 2. Regression Bisect Results (Section 1.9 & Section 2 G3, R2, R3)

### 2.1 Gravity Chip Regression (`GRAVITY: 0 m/s²`)
- **Git Bisect Result:** Commit `2d6716e49ff33d5dc3d2f0c63f43f6823ad731e4` ("Clean initial project upload").
- **Root Cause:** In `ThreeViewer.tsx` line 584:
  ```ts
  Math.abs(envSpec.gravity[2]) === 1.62 ? '0.16 g (MOON)' : `${Math.abs(envSpec.gravity[2])} m/s²`
  ```
  `EnvironmentSpec` standardizes gravity as `[0, -1.62, 0]` (Y-down). Index 2 is longitudinal Z = 0.

### 2.2 Shadow Disappearance Regression
- **Git Bisect Result:** Commit `2d6716e49ff33d5dc3d2f0c63f43f6823ad731e4`.
- **Root Cause:** Directional light frustum was clamped to an orthographic envelope of `±6.5m` around the robot, and ambient light (0.55) + unshadowed fill light (0.65) was added in `2d6716e` to compensate for dark terrain, reducing shadow contrast ratio to near-zero.

### 2.3 Red Rim Glow Gating Regression
- **Git Bisect Result:** Commit `2d6716e49ff33d5dc3d2f0c63f43f6823ad731e4`.
- **Root Cause:** The terrain fragment shader has never had a `uEdgeDistance` uniform. It hardcoded:
  ```glsl
  if (distArena >= 16.0 && distArena < 17.88) {
    float warnT = (distArena - 16.0) / 1.88;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.72, 0.23, 0.18), warnT * 0.45);
  }
  ```
  This statically paints the arena border red in every frame.
