# ROOT CAUSES TABLE — OMNI-KINETIC BUG-FIX RELEASE
**Build Stamp:** `iteration-5-dev (baseline: bugfix-baseline) • sha:21842619 (main) • production`  
**Date:** 2026-11-01  
**Gate:** Gate 1 Baseline Audit

---

## 1. Multi-Area Root Cause Ranking & Measurements

| Area | Primary Ranked Root Cause | Measured Value / Failure Mode | Target Budget | File & Line |
| :--- | :--- | :--- | :--- | :--- |
| **Locomotion** | **Body Quaternion Uncoupled from Heading:** Local runner generates velocity vector along `robotHeading = -0.62`, but body quaternion has static identity yaw with only 0.02 rad wobble. | Slip angle P95 is **23.52°** on flat L0; **47.52°** on L1. | Slip P95 ≤ 2.0° on L0, ≤ 4.0° on L2 | [local_runner.ts:260](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L260) |
| **Gravity & Units** | **Longitudinal Z-Axis Index Lookup:** HUD reads `envSpec.gravity[2]` which is 0 (longitudinal Z), instead of `envSpec.gravity[1]` which is -1.62 (vertical Y). | HUD displays `"GRAVITY: 0 m/s²"`. | Truthful `"1.62 m/s² (0.165 g, Moon)"` | [ThreeViewer.tsx:584](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |
| **Rim & Glow** | **Static Fragment World Distance Check:** Shader unconditionally paints any fragment with `distArena >= 16.0m` brick red, ignoring robot distance to edge! | **201px to 302px** red pixels in EVERY frame even when robot is at (0, 0). | 0 red pixels when robot > 2.5m from rim | [ThreeViewer.tsx:705-709](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L705-L709) |
| **Terrain Shader** | **Dithering Insertion Point Bypasses Fog:** Shader replaces `#include <dithering_fragment>` which executes AFTER `<fog_fragment>`, making contours and red rim immune to distance fog. | Polyline score **0.10**; horizontal stripe score **10.79**. | Polyline ≤ 0.01; Stripe ≤ 1.5; fully fogged | [ThreeViewer.tsx:676-709](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L676-L709) |
| **Terrain Tilt** | **Unconstrained fBm Plane Slope:** Canonical generator sums octaves without subtracting the best-fit planar gradient. | Mean plane tilt P95 = **1.77°**; max 12m window tilt = **10.72°**. | Mean tilt ≤ 1.0°; Max 12m window ≤ 3.0° | [generator.ts:45-95](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L45-L95) |
| **Lighting & Shadows** | **Frustum Narrowness & Excessive Ambient/Fill Light:** Shadow camera frustum is an orthographic box of only ±6.5m (rocks > 6.5m cast zero shadows); ambient (0.55) + unshadowed fill (0.65) washes out direct shadow contrast on dark terrain (`0x2e2e2e`). | Zero visible rock shadows; robot body contrast against ground is **0.998:1**. | Visible attached shadows; body contrast ≥ 2.0:1 | [ThreeViewer.tsx:219-242](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L219-L242) |
| **Debris** | **Uniform Rim Accumulation & Fixed Material:** Generator distributes boulders uniformly up to 17.6m (no edge falloff), using 3 hardcoded displaced icosahedrons with zero `instanceColor` variation and `flatShading: true`. | Dense black band of boulders at far rim; rock luminance ratio to ground is **1.05:1**. | Falloff near rim; ≥ 6 geometries; varied instance luminance | [debris.ts:36-63](file:///d:/project%20all/nvidia/lib/world/debris.ts#L36-L63) / [ThreeViewer.tsx:772-783](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L772-L783) |
| **Camera** | **Mouse Yaw Coupled Rig & World LookAt Offset:** Chase camera yaw follows instant mouse/target angle rather than low-pass path tangent; camera lookAt at `robotPos.y + 0.2` combines with terrain tilt to tilt the horizon. | Measured visual horizon tilt up to **38.0°**. | Horizon tilt ≤ 0.5° (rig) and ≤ 1.0° (image) | [ThreeViewer.tsx:491-501](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L491-L501) |
| **Radar** | **World vs Robot Coordinate Desync & Static Arrow:** Debris is drawn at `(cx + d.x * scale)` in world frame, while robot is drawn at fixed center `(cx, cy)` without rotating `(0, -5)`; all 1,200 debris instances drawn as dots. | Dense white speckle; robot arrow never turns; obstacles desync from robot position. | Visibly textured hillshade; rotating arrow; matching positions; dots < 500 | [ThreeViewer.tsx:1061-1154](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1061-L1154) |
| **Goal Beacon** | **Hardcoded Height & Perimeter Placement:** Beacon base placed at static `y = 0.05` without sampling terrain; placed at `(14.0, -10.0)` which is 17.2m from center (only 0.8m from 18m rim). | Translucent cone floats or buries; violates 4m arena margin rule. | Subtle grounded ring + light column; base on terrain; 8-30m from spawn, > 4m from rim | [ThreeViewer.tsx:276, 875](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L276) |
| **Header UI** | **Unconstrained Flex Row Crowding:** Header flex row lacks explicit chip gaps and flex-shrink rules at 1280px / 1440px; title truncation lacks tooltip. | 5 overlapping chip pairs at 1280px (`gap: -1px`); title tooltip false. | Zero overlaps; gap ≥ 6px; full title tooltip | [Shell.tsx:491-550](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L491-L550) |
| **Performance Badge** | **Lifetime PerformanceObserver Long Task Accumulation:** `PerfProbe` accumulates all lifetime long tasks from page load (Next.js hydration = 110ms, terrain generation = 65ms); badge displays lifetime count instead of 60s steady-state. | Persistent red badge: `"2 long tasks"` displayed continuously. | Badge displays 0 during steady state; startup tasks tagged as "startup" in P panel | [FpsBadge.tsx:50-58](file:///d:/project%20all/nvidia/components/shell/FpsBadge.tsx#L50-L58) / [probe.ts:83-98](file:///d:/project%20all/nvidia/lib/perf/probe.ts#L83-L98) |

---

## 2. Regression Bisect Results (Section 1.9)

### 2.1 Regression 1: Gravity Chip ("GRAVITY: 0 m/s²")
- **Status in History:** Present since commit `2d6716e` ("Clean initial project upload").
- **Introducing Commit:** `2d6716e49ff33d5dc3d2f0c63f43f6823ad731e4`.
- **Evidence:** In `ThreeViewer.tsx` line 584:
  ```ts
  Math.abs(envSpec.gravity[2]) === 1.62 ? '0.16 g (MOON)' : `${Math.abs(envSpec.gravity[2])} m/s²`
  ```
  `EnvironmentSpec` standardized gravity as `[0, -1.62, 0]` (Y-down). Index 2 is longitudinal Z = 0.

### 2.2 Regression 2: Disappearance of Shadows
- **Status in History:** Present since commit `2d6716e`.
- **Evidence:** Shadows were not turned off via `castShadow = false`. Rather, directional light frustum was clamped to an orthographic envelope of `±6.5m` around the robot, and ambient light (0.55) + unshadowed fill light (0.65) was added in `2d6716e` to compensate for dark terrain, reducing shadow contrast ratio to near-zero.

### 2.3 Regression 3: Red Rim Glow Gating
- **Status in History:** Present since commit `2d6716e`.
- **Evidence:** The terrain fragment shader has never had a `uEdgeDistance` uniform. It hardcoded:
  ```glsl
  if (distArena >= 16.0 && distArena < 17.88) {
    float warnT = (distArena - 16.0) / 1.88;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.72, 0.23, 0.18), warnT * 0.45);
  }
  ```
  This statically paints the arena border red in every frame.
