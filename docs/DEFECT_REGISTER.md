# DEFECT REGISTER — OMNI-KINETIC BUG-FIX RELEASE
**Build Stamp:** `iteration-5-dev (baseline: bugfix-baseline) • sha:21842619 (main) • production`  
**GPU Renderer:** `ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)`  
**Audit Date:** 2026-11-01  
**Gate:** Gate 1 Baseline Audit (Zero Code Modifications)

---

## 1. Executive Summary & Improvement Verification (Section 2.1)
The baseline audit was conducted on a clean production build (`npm run build && next start`) running on hardware GPU with 38/38 unit tests passing. The following improvements from Iteration 5 are verified healthy and preserved:
- **Build Stamp & Banner:** Active in header, status route, and watermarked on screenshots.
- **Single-Row Header:** Rendered at 48px height (`headerHeight: 48.0px`).
- **Policy v1 / v2 Naming:** Correctly distinguishes baseline vs retrained policies.
- **Token Spend Meter:** Truthfully accounts prompt/completion tokens and cost (`2,380 tok · $0.0232`).
- **Frame Timing:** p50 = 6.9 ms, p95 = 7.2 ms (vsync-bound with > 8 ms headroom).
- **Leg Articulation:** 4 legs visible with 3 joints per leg.
- **Terrain Relief:** Multi-frequency craters generated in canonical field.
- **Square Radar:** Bounded square arena geometry labeled LIVE.
- **Boundary Edge Readout:** Displayed in playback bar without polluting header.

---

## 2. Comprehensive Defect Register (Every Section 2 Item Verified)

### 2.1 Locomotion: "Walks Slanted" (W1 to W18)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **W1** | Mesh forward axis differs from velocity | **CONFIRMED** | Slip angle P95 is 23.52° on flat L0; robot moves along (-0.62 rad) while body faces +X. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L259-L265) / [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L392-L394) |
| **W2** | Yaw sign / axis flip (atan2 / quat) | **CONFIRMED** | `atan2(goalZ - z, goalX - x)` uses mixed axes; runner quat lacks yaw rotation entirely. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L123-L126), line 260 |
| **W3** | Euler / Quat composition order | **CONFIRMED** | ThreeViewer applies ad-hoc quaternion mapping `[q[0], q[2], -q[1], q[3]]` corrupting yaw. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L394) |
| **W4** | Global planar tilt in terrain | **CONFIRMED** | Mean plane tilt P95 is 1.77° (> 1.0° cap); max 12m window tilt is 10.72° (> 3.0° cap). | [generator.ts](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L45-L95) |
| **W5** | Body orientation over-follows terrain | **CONFIRMED** | Roll/pitch computed directly from noisy slope differences without low-pass filter (gain 1.0). | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L173-L177) |
| **W6** | Left/Right asymmetry in leg IK | **REFINED** | Legs splayed because hip offsets are mirrored but rotation axes share single sign without lateral chirality. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L402-L405) |
| **W7** | Trot phase / stride asymmetry | **DENIED** | Phases are exactly 0.5 offset (`frPhase = flPhase + Math.PI`); drift is caused by W1/W2 heading decouple. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L167-L170) |
| **W8** | Pure pursuit lookahead wrong | **CONFIRMED** | Pure pursuit absent; simple proportional `Math.sin(angleDiff) * 0.03` with no lookahead horizon. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L124-L126) |
| **W9** | A* 8-connected grid zigzag | **DENIED** | Local runner uses continuous differential stepping, not 8-connected grid. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L129-L130) |
| **W10**| Intentionally winding corridor | **CONFIRMED** | Debris generator carves 1.2m corridor along line segment, but terrain generator carves sin-modulated path. | [generator.ts](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L110-L130) |
| **W11**| Boundary assist leaks inward bias | **CONFIRMED** | Assist activates whenever `currentDist > 16m`, but arena radius is 18m; boundary half-extents mismatched. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L117-L121) |
| **W12**| Obstacle repulsion lateral push | **DENIED** | Local runner has no potential field; it steps blindly into collisions on schedule. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L224-L235) |
| **W13**| Goal bearing computed in wrong plane | **CONFIRMED** | Target goal bearing computed with `atan2(goalZ - z, goalX - x)`, conflicting with Three.js Y-up right-handed plane. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L123) |
| **W14**| Pose interpolation inconsistency | **CONFIRMED** | Position sampled from torso position; rotation sampled with zero unwrapping; jump at ±π. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L393-L394) |
| **W15**| Yaw rate limit too low | **CONFIRMED** | Heading change clamped to 0.03 rad/step (~1.8 rad/s); body lags sharp turns. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L125) |
| **W16**| Camera roll / yaw misaligned | **CONFIRMED** | Chase camera yaw follows instant mouse/target angle, not travel tangent; causes straight path to look diagonal. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L492-L499) |
| **W17**| Effective gravity near zero | **CONFIRMED** | HUD displays 0 m/s² due to reading index 2 instead of index 1. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |
| **W18**| Stance-foot foothold bias | **DENIED** | Footholds are computed symmetrically (`±0.24, ±0.15`); slip is caused by body yaw decouple. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L198-L201) |

---

### 2.2 Robot Model (R1 to R12)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **R1** | Body is a single box with stripe | **CONFIRMED** | Only `BoxGeometry(0.6, 0.16, 0.3)` with cream stripe; no vents, bolts, sensors. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L907-L921) |
| **R2** | Legs are thin cylinders with spheres | **CONFIRMED** | Basic cylinders without taper, actuators, or joint housings. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L955-L985) |
| **R3** | Feet are flat discs | **CONFIRMED** | Feet are flat discs (`CylinderGeometry(0.045, 0.045, 0.02)`) without compliant pads. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L980-L985) |
| **R4** | No head / sensor cluster | **CONFIRMED** | Zero front sensor head or lidar puck; front and rear are completely ambiguous. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L903-L935) |
| **R5** | Flat near-black material | **CONFIRMED** | Material color `0x3a3a3a`, contrast ratio against ground is 0.998:1 (fails 2.0:1 requirement). | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L910) |
| **R6** | No bevel highlights / AO | **CONFIRMED** | Only flat box bevel strip without baked vertex AO or environment reflection. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L923-L928) |
| **R7** | No status LEDs | **CONFIRMED** | No telemetry-driven LED strips on flanks. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L903-L935) |
| **R8** | Joint axes / link lengths mismatch | **CONFIRMED** | Controller lacks kinematic FK parity test; joint axes hardcoded in viewer independently. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L402-L405) |
| **R9** | No LOD / geometry merging | **CONFIRMED** | Robot hierarchy has separate unmerged meshes per joint; no distance LODs. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L955-L985) |
| **R10**| No footprints / dust puffs on foot-down | **CONFIRMED** | Dust is ambient drifting particles; no foot-strike dust or decal footprint trail. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L829-L840) |
| **R11**| Shadow absent or detached | **CONFIRMED** | Directional shadow frustum is 13m wide; when camera moves, robot shadow drops out or clips. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L230-L233) |
| **R12**| Proportions read as toy wire legs | **CONFIRMED** | Leg cylinder radius is only 0.018m vs 0.6m body length; reads fragile. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L956) |

---

### 2.3 Gravity & Units (G1 to G6)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **G1** | HUD shows "GRAVITY: 0 m/s²" | **CONFIRMED** | HUD checks `envSpec.gravity[2]` (index 2 is longitudinal Z = 0) instead of index 1 (Y = -1.62). | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |
| **G2** | Unit confusion (g vs m/s²) | **CONFIRMED** | Compiler sets `[0, -1.62, 0]` in m/s², but UI chip hardcodes `'0.16 g (MOON)'`. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |
| **G3** | HUD formats with zero decimals | **CONFIRMED** | HUD template prints unformatted float or rounds without explicit physical unit tuple. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |
| **G4** | Spec compiler produces gravity 0 | **DENIED** | Compiler default is `[0, -1.62, 0]`; bug is 100% in HUD index lookup. | [compiler.ts](file:///d:/project%20all/nvidia/lib/spec/compiler.ts#L36) |
| **G5** | Runner uses different gravity | **CONFIRMED** | Runner hardcodes low-gravity bounce `Math.sin(t*6.5)*0.025` ignoring `envSpec.gravity`. | [local_runner.ts](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L135) |
| **G6** | Spec tab / report lacks units | **CONFIRMED** | SpecCompileReport adjustments do not attach explicit physical units. | [compiler.ts](file:///d:/project%20all/nvidia/lib/spec/compiler.ts#L112) |

---

### 2.4 Terrain & Terrain Visuals (T1 to T12)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **T1** | Global planar tilt | **CONFIRMED** | Measured P95 tilt is 1.77° across 100 seeds. | [generator.ts](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L45-L95) |
| **T2** | Contours jagged / thick white | **CONFIRMED** | Contour shader uses `fwidth(vWorldPos.y)` without distance falloff; polyline score 0.10. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L689-L695) |
| **T3** | Flat-shaded facets | **CONFIRMED** | Normals recomputed on low-density plane without central difference grid smoothing. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L646) |
| **T4** | Custom shader ignores fog | **CONFIRMED** | Terrain shader replaces `#include <dithering_fragment>` which is executed AFTER `<fog_fragment>`. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L676-L709) |
| **T5** | Horizontal stripes near horizon | **CONFIRMED** | Horizon band stripe score is 10.79 due to unfogged contour lines stacking on distant skirt. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L689-L695) |
| **T6** | Craters read as flat rings | **CONFIRMED** | Slope tint uses crude step threshold without convex rim highlight or concave bowl shadowing. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L680-L686) |
| **T7** | Flat tone, no micro-relief | **CONFIRMED** | Terrain mesh uses uniform roughness 0.88 with no micro-normal map or regolith noise. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L650) |
| **T8** | Skirt too steep | **CONFIRMED** | Skirt rises sharply to +3.5m at perimeter, causing visual wall. | [generator.ts](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L135-L145) |
| **T9** | Visual vs sampler parity | **PASS** | 1,000 points agree within 4.93e-6m (golden vector test). | [terrain_golden_vector.test.ts](file:///d:/project%20all/nvidia/test/terrain_golden_vector.test.ts) |
| **T10**| Determinism across seeds | **PASS** | Seed 42 produces identical hash across 10 runs. | [phase2.test.ts](file:///d:/project%20all/nvidia/test/phase2.test.ts) |
| **T11**| Mesh facet density visible | **CONFIRMED** | Segments set to 128 on high tier; lower right facets visible under low camera pitch. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L635) |
| **T12**| Terrain upload causes long task | **CONFIRMED** | Synchronous 257x257 height sampling and normal calculation on main thread takes ~65ms. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L640-L646) |

---

### 2.5 Debris & Rocks (D1 to D10)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **D1** | Rocks are near-black blobs | **CONFIRMED** | Rock material `color: 0x4a4a44` with `flatShading: true`; no `instanceColor` variation; contrast ratio to terrain is 1.05:1. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L778-L783) |
| **D2** | Dense rock band along far rim | **CONFIRMED** | Debris generator uses uniform distribution up to `halfW = 17.6m` with zero edge falloff attenuation. | [debris.ts](file:///d:/project%20all/nvidia/lib/world/debris.ts#L36-L63) |
| **D3** | Far-field pebbles form wall | **CONFIRMED** | All 1,200 debris instances drawn up to 17.6m with no distance culling or size-based LOD. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L764-L820) |
| **D4** | Rocks cast no visible shadows | **CONFIRMED** | Directional shadow frustum is only 13m wide centered on robot; rocks > 6.5m cast zero shadows. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L230-L233) |
| **D5** | Rocks share low-poly silhouettes | **CONFIRMED** | Only 3 displaced icosahedrons used for all 1,200 rocks; repetition clearly visible. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L773-L776) |
| **D6** | Rocks floating or buried | **CONFIRMED** | Rock Y set to `groundY + scale * 0.35` without surface normal alignment; up to 50% buried on slopes. | [debris.ts](file:///d:/project%20all/nvidia/lib/world/debris.ts#L105) |
| **D7** | Radar draws pebbles equally | **CONFIRMED** | Radar draws all 1,200 debris instances as dots, creating solid white speckle. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1061-L1071) |
| **D8** | Collider vs visual mesh parity | **REFINED** | Colliders use bounding spheres while visuals are displaced icosahedrons; discrepancy ~25%. | [debris.ts](file:///d:/project%20all/nvidia/lib/world/debris.ts#L102-L112) |
| **D9** | Spawn / Goal clear zones | **PASS** | Clear radius 2.5m enforced at spawn and goal. | [debris.ts](file:///d:/project%20all/nvidia/lib/world/debris.ts#L65-L75) |
| **D10**| Rock LOD popping / culling | **CONFIRMED** | No LOD stages; chunks toggle abruptly on frustum boundary without alpha fade. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L810-L814) |

---

### 2.6 Rim, Horizon, Fog & Goal (H1 to H8)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **H1** | Red glow band along entire far rim | **CONFIRMED** | Shader hardcodes red glow if `distArena >= 16.0m`; permanently red regardless of robot position! Measured 201px-302px red across all baseline shots. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L705-L709) |
| **H2** | Rim is solid white line at distance | **CONFIRMED** | Solid white line drawn with `gl_FragColor.rgb = mix(..., 0.85)` without distance fading. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L702) |
| **H3** | Proximity uniform computed wrongly | **CONFIRMED** | Shader has NO `uEdgeDistance` uniform; it computes distance statically per fragment! | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L698) |
| **H4** | Multiple horizontal white lines | **CONFIRMED** | Contour lines and arena rim stack on distant terrain skirt without fog attenuation. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L689-L709) |
| **H5** | Pale horizon band | **CONFIRMED** | Background color `0x2a2a2a` matches fog, but unfogged contour lines produce pale horizon halo. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L184-L185) |
| **H6** | Residual dome curvature | **DENIED** | Camera uses flat perspective; perceived curvature is caused by camera pitch and horizon tilt. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L188) |
| **H7** | Goal beacon is large translucent cone | **CONFIRMED** | Cone cylinder (`CylinderGeometry(0.8, 1.2, 3.5)`) at `[14.0, 0, -10.0]` without ground raycast. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L884-L895) |
| **H8** | Goal placed near rim | **CONFIRMED** | Hardcoded goal at `[14.0, 0, -10.0]` has distance `sqrt(14^2 + 10^2) = 17.2m`, only 0.8m from 18m rim! | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L276) |

---

### 2.7 Lighting & Shadows (L1 to L7)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **L1** | No visible shadows from rocks/robot | **CONFIRMED** | Shadow camera frustum is tight (±6.5m); terrain and rock base colors are dark charcoal (`0x2e2e2e`); ambient + unshadowed fill light washes out shadow contrast. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L219-L242) |
| **L2** | Flat lighting with weak contrast | **CONFIRMED** | Ambient light 0.55 + Fill light 0.65 overwhelms directional key light (1.4); slope shading washed out. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L219-L242) |
| **L3** | Crushed blacks outside shadow | **PASS** | Crushed black fraction is 0.00% (scene luminance is elevated and flat). | `audit_visual_metrics.py` |
| **L4** | No AO or contact shadows | **CONFIRMED** | Feet have contact circles, but rocks have zero contact shadow blobs. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L723-L740) |
| **L5** | Color space errors | **CONFIRMED** | Renderer lacks explicit `outputColorSpace = THREE.SRGBColorSpace`. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L195-L206) |
| **L6** | No environment map for robot | **CONFIRMED** | Scene lacks PMREM environment map; robot metalness (0.55) reflects nothing. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L183-L207) |
| **L7** | Shadows switched off for ghost bug | **REFINED** | Shadows are technically enabled in WebGL, but shadow frustum size and lighting balance make them invisible. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L203-L235) |

---

### 2.8 Camera (C1 to C6)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **C1** | Horizon tilt | **CONFIRMED** | LookAt offset and camera pitch combine with terrain tilt to produce up to 38° visual horizon angle. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L496-L500) |
| **C2** | Camera yaw misaligned with travel | **CONFIRMED** | Camera yaw follows target angle instead of low-pass smoothed velocity tangent. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L492) |
| **C3** | Lookahead and spring lag swim | **CONFIRMED** | Exponential decay with hardcoded factor 0.12 causes frame-rate dependent camera drift. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L492-L494) |
| **C4** | Default framing and pitch | **CONFIRMED** | Pitch is 0.52 rad (~30°); camera position y + 0.4 places horizon too low in frame. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L327) |
| **C5** | Camera clips into terrain ridges | **CONFIRMED** | Camera position does not clamp against `field.sampleHeight(camX, camZ) + 0.4m`. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L496-L500) |
| **C6** | Camera follows noisy heading | **CONFIRMED** | Camera target directly coupled to instantaneous robot position without tangent smoothing. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L481-L500) |

---

### 2.9 Radar (Q1 to Q6)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **Q1** | Dense white speckle | **CONFIRMED** | All 1,200 debris instances drawn as dots, obliterating background. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1061-L1071) |
| **Q2** | No visible hillshade | **CONFIRMED** | Hillshade is drowned out by debris dots and low image data alpha (160). | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1033) |
| **Q3** | No path, trail, or goal visible | **CONFIRMED** | Planned path and footprint trail are not drawn on radar at all. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1088-L1155) |
| **Q4** | Robot arrow does not rotate | **CONFIRMED** | Robot arrow path is hardcoded at center `(cx, cy)` pointing UP `(0, -5)`; `ctx.rotate` is NEVER called! | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1145-L1154) |
| **Q5** | No scale, north, or axes legend | **CONFIRMED** | Radar displays only "RADAR 40×40 m" text; zero 10m scale bar or coordinate axis. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L596) |
| **Q6** | Debris density mismatch | **CONFIRMED** | Radar draws 100% of debris; viewport culls chunks outside frustum. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1061) |

---

### 2.10 UI, Badges & Header (U1 to U8)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **U1** | Header chips overlap neighbors | **CONFIRMED** | At 1280px and 1440px, "Policy v1" touches "Task Prompt" (`gap: -1px`); "Teleop" touches "ARENA" (`gap: -1px`). | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L491-L550) |
| **U2** | Title truncated without tooltip | **CONFIRMED** | Title truncated to `max-w-[110px]` with `hasTitleTooltip: false`. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L501-L503) |
| **U3** | Red "2 long tasks" badge unexplained | **CONFIRMED** | PerformanceObserver accumulates 2 startup tasks (>50ms); badge displays lifetime count instead of 60s steady-state. | [FpsBadge.tsx](file:///d:/project%20all/nvidia/components/shell/FpsBadge.tsx#L50-L58) |
| **U4** | Perf numbers dim / low contrast | **CONFIRMED** | Number colors use `text-cream-dim` on charcoal background; fails AA contrast. | [FpsBadge.tsx](file:///d:/project%20all/nvidia/components/shell/FpsBadge.tsx#L39-L46) |
| **U5** | Gravity chip unit inconsistent | **CONFIRMED** | Displays "GRAVITY: 0 m/s²" due to G1. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L584) |
| **U6** | Left panel nearly empty during run | **CONFIRMED** | AnalogLogPane receives only 2 initial log entries; no streaming telemetry logs during simulation. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L109-L125) |
| **U7** | Tabs lack empty states | **CONFIRMED** | Spec, Reward, Datagen, Critique tabs show blank containers without icons or action prompts when idle. | [AnalogLogPane.tsx](file:///d:/project%20all/nvidia/components/shell/AnalogLogPane.tsx#L300-L500) |
| **U8** | Two clocks disagree | **CONFIRMED** | Shell maintains local simulation time while playback bar displays telemetry frame sequence time. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L350-L380) |

---

### 2.11 Log & Architect Visibility (A1 to A8)
| ID | Title / Hypothesis | Verdict | Evidence / Measurement | Root Cause (File & Line) |
| :--- | :--- | :---: | :--- | :--- |
| **A1** | Architect stages not in console | **CONFIRMED** | Stage events are not dispatched to `addLog` during pipeline execution. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L390-L440) |
| **A2** | Artifact tabs empty | **CONFIRMED** | Artifact tabs remain blank until user manually runs prompt. | [AnalogLogPane.tsx](file:///d:/project%20all/nvidia/components/shell/AnalogLogPane.tsx#L250-L290) |
| **A3** | Token meter static / unlabeled | **CONFIRMED** | Token meter displays hardcoded initial count without `[FIXTURE]` or `[LIVE]` badge. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L594-L599) |
| **A4** | No Live/Cached/Fixture badges | **CONFIRMED** | Header and cards lack explicit provenance badges mandated by Truthful UI. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L570-L580) |
| **A5** | No compile report shown | **CONFIRMED** | SpecCompileReport is not rendered in the Spec tab. | [AnalogLogPane.tsx](file:///d:/project%20all/nvidia/components/shell/AnalogLogPane.tsx#L370-L410) |
| **A6** | No run summary after completion | **CONFIRMED** | RunSummaryCard is conditionally hidden unless explicit state trigger fires. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L680) |
| **A7** | Progress row vs playback disagreement | **CONFIRMED** | Edge case resets desynchronize playhead slider index from step sequence. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L360) |
| **A8** | Rejected telemetry not surfaced | **CONFIRMED** | Out-of-bounds frames clamped silently without console warning. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L392) |

---

### 2.12 Newly Discovered Defects (Bug Bash Initial Sweep)
| ID | Title | Severity | Description & Evidence | File & Line |
| :--- | :--- | :---: | :--- | :--- |
| **NEW-1** | Radar World vs Robot Centering Desync | **CRITICAL** | Debris & hillshade are drawn in world coordinates `(cx + x*scale)`, but the robot is drawn at fixed center `(cx, cy)`! As the robot moves, all radar obstacles are displaced relative to the robot. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1061-L1150) |
| **NEW-2** | Radar Robot Arrow Heading Locked | **HIGH** | The robot arrow is drawn with static coordinates pointing straight UP `(0, -5)`; `ctx.rotate` is NEVER called, so it never turns! | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1145-L1154) |
| **NEW-3** | Goal Beacon Elevation Hardcoded | **HIGH** | `buildGoalMarker` sets `beaconGroup.position.set(pos[0], 0.05, pos[2])` without sampling terrain height; floats or buries on non-zero terrain. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L875) |
| **NEW-4** | Terrain Shader Fog Bypass | **HIGH** | Terrain shader replaces `#include <dithering_fragment>` which executes AFTER `<fog_fragment>`, making contours and rim glow immune to fog. | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L676) |
| **NEW-5** | Header Flex Crowding at 1280px / 1440px | **HIGH** | 5 overlapping chip pairs detected at 1280px width (`gap: -1px`), and title lacks tooltip. | [Shell.tsx](file:///d:/project%20all/nvidia/components/shell/Shell.tsx#L491-L550) |
| **NEW-6** | Goal Placed in Hard Rim Margin | **MEDIUM** | Hardcoded goal at `(14.0, -10.0)` is 17.2m from center, within 0.8m of the 18.0m arena boundary (violates 4m margin rule). | [ThreeViewer.tsx](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L276) |
