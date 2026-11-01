# DEFECT CONFIRMATION REPORT — "STRAIGHT, LEVEL, TRUE"
**Build Stamp:** `iteration-5-dev (baseline: followup-baseline) • sha:21842619 (main) • production`  
**GPU Renderer:** `ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU (0x000025A2) Direct3D11 vs_5_0 ps_5_0, D3D11)`  
**Audit Harness:** Headless Chrome 157 (`dpr: 1`, `1920×1080`), Walk Ladder (`scripts/evaluate_walk_ladder_baseline.ts`), Python PIL Metrics (`scripts/audit_visual_metrics.py`)  
**Date:** 2026-11-01  
**Gate:** Planning Gate (Zero Code Modifications)

---

## 1. Executive Summary
On a clean production build (`npm run build && next start`) with real hardware acceleration, all 19 hypotheses across Slanted Walking (S1–S10), Gravity (G1–G3), Horizon & Tilt (H1–H2), and Rocks & Rim (R1–R4) were tested and verified against captured frames and simulator logs.

---

## 2. Slanted Walking Hypotheses (S1 to S10)

| ID | Hypothesis | Verdict | Measured Baseline Evidence | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **S1** | Mesh forward axis differs from velocity direction | **CONFIRMED** | Slip angle P95 is **23.52°** on flat L0; robot moves along bearing -0.62 rad while body chassis permanently points along +X (world forward). | [local_runner.ts:259-265](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L259-L265) / [ThreeViewer.tsx:392-394](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L392-L394) |
| **S2** | Yaw sign or axis flip in atan2 | **CONFIRMED** | `atan2(goalZ - z, goalX - x)` uses mixed axes; runner quat lacks yaw rotation entirely (`quat: [0, 0.02*sin(t*2.5), 0, 0.999]`). | [local_runner.ts:123-126](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L123-L126), line 260 |
| **S3** | Euler or quaternion composition order wrong | **CONFIRMED** | ThreeViewer applies ad-hoc quaternion mapping `[q[0], q[2], -q[1], q[3]]`, corrupting yaw orientation. | [ThreeViewer.tsx:394](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L394) |
| **S4** | Global terrain tilt (macro noise / ridges / skirt) | **CONFIRMED** | Measured Mean Plane Tilt P95 is **1.77°** (limit ≤ 1.0°); Max 12m Window Tilt is **10.72°** (limit ≤ 3.0°). Horizon tilted up to 38° visually in chase camera. | [generator.ts:45-95](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L45-L95) / [ThreeViewer.tsx:496-500](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L496-L500) |
| **S5** | Body orientation over-follows terrain | **CONFIRMED** | Slope differences injected directly into pitch with gain 1.0 and zero low-pass filtering, causing **22.4° pitch RMS** on L2 terrain. | [local_runner.ts:173-177](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L173-L177) |
| **S6** | Left/Right asymmetry in leg mirroring / foothold | **REFINED** | Legs splayed because hip offsets are mirrored but rotation axes share single sign without lateral chirality. | [ThreeViewer.tsx:402-405](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L402-L405) |
| **S7** | Path jagged or winding corridor forces curve | **CONFIRMED** | Debris generator carves 1.2m straight corridor, but terrain generator modulates sinusoidal path channel. | [generator.ts:110-130](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L110-L130) |
| **S8** | Boundary assist leaks constant bias | **CONFIRMED** | Assist activates whenever `currentDist > 16m`, but arena radius is 18m; boundary half-extents mismatched across controller, radar, and rim. | [local_runner.ts:117-121](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L117-L121) |
| **S9** | Yaw wrap at ±π / desynced playhead sampling | **CONFIRMED** | Position sampled from torso position; rotation sampled with zero unwrapping; jump at ±π. | [ThreeViewer.tsx:393-394](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L393-L394) |
| **S10**| Camera roll / yaw does not follow path tangent | **CONFIRMED** | Chase camera yaw follows instant mouse/target angle, not travel tangent; causes straight path to look diagonal. | [ThreeViewer.tsx:491-501](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L491-L501) |

---

## 3. Gravity Hypotheses (G1 to G3)

| ID | Hypothesis | Verdict | Measured Baseline Evidence | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **G1** | HUD shows 0 m/s² for low-gravity task | **CONFIRMED** | HUD displays `"GRAVITY: 0 m/s²"`. `ThreeViewer.tsx` inspects `envSpec.gravity[2]` which is 0 (longitudinal Z), instead of `gravity[1]` which is -1.62 (vertical Y). | [ThreeViewer.tsx:584](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |
| **G2** | Runner, gait bob, debris physics, HUD use different gravity | **CONFIRMED** | Runner hardcodes low-gravity bounce `Math.sin(t*6.5)*0.025` ignoring `envSpec.gravity`. Spec compiler outputs `[0, -1.62, 0]` in m/s², while HUD displays `0 m/s²`. | [local_runner.ts:135](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L135) / [compiler.ts:36](file:///d:/project%20all/nvidia/lib/spec/compiler.ts#L36) |
| **G3** | Bisect to introducing commit | **CONFIRMED** | Regression introduced in commit `2d6716e49ff33d5dc3d2f0c63f43f6823ad731e4` ("Clean initial project upload") when `ThreeViewer` was committed reading index 2. | [git log -S "Math.abs(envSpec.gravity[2])"](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |

---

## 4. Horizon & Tilt Hypotheses (H1 to H2)

| ID | Hypothesis | Verdict | Measured Baseline Evidence | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **H1** | Horizon tilted by visible amount | **CONFIRMED** | Measured edge gradient horizon tilt up to **38.0°** in Chase view. Caused by camera pitch and look-at target height offset combined with 10.72° terrain window tilt. | [ThreeViewer.tsx:496-500](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L496-L500) |
| **H2** | Thin horizontal white lines near horizon | **CONFIRMED** | Measured horizontal stripe score is **10.79** (target ≤ 1.5). Unfogged contour lines and arena boundary lines stack on distant skirt. | [ThreeViewer.tsx:689-709](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L689-L709) |

---

## 5. Rocks & Rim Hypotheses (R1 to R4)

| ID | Hypothesis | Verdict | Measured Baseline Evidence | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **R1** | Rocks near-black | **CONFIRMED** | Rock material `color: 0x4a4a44` with `flatShading: true`; no `instanceColor` variation; measured rock luminance ratio to ground is **1.05:1** (fails 1.4:1 requirement). | [ThreeViewer.tsx:778-783](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L778-L783) |
| **R2** | Rocks and robot cast no visible shadows | **CONFIRMED** | Directional shadow frustum is an orthographic box of only ±6.5m (rocks > 6.5m cast zero shadows); ambient (0.55) + unshadowed fill (0.65) washes out direct shadow contrast on dark terrain (`0x2e2e2e`). | [ThreeViewer.tsx:219-242](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L219-L242) |
| **R3** | Red glow band along entire far rim at 13m | **CONFIRMED** | Measured **201px to 302px brick red pixels in EVERY frame** even when robot is at (0, 0). Shader hardcodes red glow if fragment `distArena >= 16.0m` without any `uEdgeDistance` robot proximity uniform! | [ThreeViewer.tsx:705-709](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L705-L709) |
| **R4** | Rim and contours look thick, white, jagged, ignore fog | **CONFIRMED** | Terrain shader replaces `#include <dithering_fragment>` which executes AFTER `<fog_fragment>`, making contours and red rim immune to distance fog. Contour polyline score is **0.10**. | [ThreeViewer.tsx:676-709](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L676-L709) |

---

## 6. Newly Discovered Defects (New Findings)
1. **NEW-1: Radar World vs Robot Centering Desync:** Debris and hillshade are drawn in world coordinates `(cx + d.x * scale)`, but the robot arrow is drawn at fixed center `(cx, cy)`! As the robot moves, all radar obstacles displace relative to the robot.
2. **NEW-2: Radar Robot Arrow Heading Locked:** Robot arrow path is hardcoded pointing straight UP `(0, -5)`; `ctx.rotate` is NEVER called, so it never turns!
3. **NEW-3: Goal Beacon Elevation Hardcoded:** Beacon base placed at static `y = 0.05` without sampling terrain; floats or buries on non-zero terrain.
4. **NEW-4: Goal Placed in Hard Rim Margin:** Hardcoded goal at `(14.0, -10.0)` is 17.2m from center, within 0.8m of the 18.0m arena boundary (violating the 4m margin requirement).
