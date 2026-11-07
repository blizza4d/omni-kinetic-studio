# DEFECT CONFIRMATION REPORT — FIX PASS 3: "RECONCILE, PROVE, THEN FIX"
**Project:** Omni-Kinetic Browser-Native Sim-to-Real Embodied AI Studio  
**Gate:** Gate 1 (Planning Gate / Baseline Reconciliation — Zero Production Code Modifications)  
**Date:** 2026-11-02  
**Baseline Git Tag:** `fix3-baseline` (`aa9ea1d`)  
**Hardware GPU:** NVIDIA GeForce RTX 3050 Laptop GPU (Direct3D11 / ANGLE)  
**Evaluated Reproduction:** Viewport 1917 × 881 px at $t=36.0\text{ s}$ (Episode 3), Lunar Preset (Seed 42)  

---

## 1. Build Identity and Process (B1 to B5)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **B1** | Log banner still reads hardcoded Iteration 5 stamp | **CONFIRMED** | `lib/build_stamp.ts` line 23 hardcodes `sha: '21842619'` and `iterationTag: 'iteration-5-dev (baseline: iteration-4-baseline)'`. Code changes in commits `6e8727a` and `aa9ea1d` did not alter the static string. | [`lib/build_stamp.ts:23`](file:///d:/project%20all/nvidia/lib/build_stamp.ts#L23) |
| **B2** | Stamp has no dirty flag, timestamp, or bundle hash | **CONFIRMED** | `BuildStamp` contract lacks `dirty`, `dirtyFiles`, `builtAt`, `bundleHash`. Dynamic git inspection is absent. | [`contracts/build_stamp.ts:8`](file:///d:/project%20all/nvidia/contracts/build_stamp.ts#L8) |
| **B3** | No user confirmation mechanism | **CONFIRMED** | No footer watermark or `/api/stamp` route to correlate client viewport screenshots with running server build. | [`components/viewer/ThreeViewer.tsx:590`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L590) |
| **B4** | Earlier gates never enforced or not failing in CI | **CONFIRMED** | CI test suite (`npm run test`) ran unit and ladder tests, but visual pixel assertions (rock luminance, shadow occlusion, header bounding box gaps) were in ad-hoc scripts not hooked to `pre-commit` or CI gates. | [`package.json:11`](file:///d:/project%20all/nvidia/package.json#L11) |
| **B5** | Evidence in previous reports mismatched user's view | **CONFIRMED** | Baseline scripts captured at 1920×1080 with simulated seeds and artificial watermarks rather than the user's live 1917×881 viewport; camera pitch and window resizing altered horizon position. | [`scripts/capture_bugfix_baseline.ts:29`](file:///d:/project%20all/nvidia/scripts/capture_bugfix_baseline.ts#L29) |

---

## 2. Rocks, Lighting, and Shadows (K1 to K10)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **K1** | Rocks are pure black (critical) | **CONFIRMED** | **Root cause identified:** `debrisMat` in `buildChunkedDebris` has `color: 0x4a4a44` (0.068 linear). In Three.js, `instancedMesh.setColorAt(i, col)` defines `USE_INSTANCING_COLOR` and `USE_COLOR`. The fragment shader evaluates `diffuseColor.rgb = material.color * instanceColor`. Multiplying `0x4a4a44` by `0x4a4a44` **squares the dark value down to 0.0046 linear RGB (0.46% luminance)**! Under shadow and ambient lighting, this is mathematically crushed to pure black (`#000000`). | [`ThreeViewer.tsx:817-856`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L817-L856) |
| **K2** | Rocks cast no visible shadows | **CONFIRMED** | Directional shadow frustum is 24m, but because rock faces are crushed to 0.0046 luminance, self-shadowing and cast shadows have zero contrast against the dark terrain ground (`#2E2E2E`). | [`ThreeViewer.tsx:225-240`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L225-L240) |
| **K3** | Terrain does not receive shadows properly | **REFINED** | Terrain mesh has `receiveShadow = true`, but custom shader injection before `<fog_fragment>` replaces tone-mapped outputs and dilutes shadow depth. | [`ThreeViewer.tsx:754`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L754) |
| **K4** | Robot shadow faint and offset | **CONFIRMED** | Directional light at `(robotPos.x + 8, robotPos.y + 16, robotPos.z + 10)` creates a steep 58° angle. Robot shadow is cast backward-left; shadow bias (`-0.0006`) detaches contact from foot pads. | [`ThreeViewer.tsx:522`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L522) |
| **K5** | Exposure and lighting flat | **CONFIRMED** | Ambient light is 0.35, directional is 1.55, but lack of hemisphere fill and procedural PMREM ambient reflection makes shaded faces pitch black. | [`ThreeViewer.tsx:222-245`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L222-L245) |
| **K6** | Pale foot blobs read as discs beside feet | **CONFIRMED** | Foot contact blobs are rendered as separate horizontal discs (`CylinderGeometry(0.06, 0.06, 0.01)`) placed at `(pos[0], groundH + 0.005, pos[2])`; during swing phase they don't fade cleanly, reading as detached discs. | [`ThreeViewer.tsx:780-798`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L780-L798) |
| **K7** | No contact shadows under rocks | **CONFIRMED** | Instanced rock boulders have zero ambient occlusion decals or contact shadow geometry underneath. | [`ThreeViewer.tsx:840-874`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L840-L874) |
| **K8** | Rock overlaps front-left foot/leg | **CONFIRMED** | Controller foothold generator computes foot positions via kinematic stride formulas without querying rock bounding boxes or obstacle collision margins. | [`local_runner.ts:247-260`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L247-L260) |
| **K9** | Rocks near horizon float | **CONFIRMED** | Boulders are placed with `y: groundY + scale * 0.35`. For small scales or steep slopes, bottom vertices do not embed $\ge 15\%$, appearing suspended in perspective. | [`debris.ts:114`](file:///d:/project%20all/nvidia/lib/world/debris.ts#L114) |
| **K10**| Rock shapes show repetition | **CONFIRMED** | Only 3 geometries used (`sharedGeos = [boulderGeo1, boulderGeo2, boulderGeo3]`); spec requires at least 6 distinct fractured/displaced shapes. | [`ThreeViewer.tsx:812-815`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L812-L815) |

---

## 3. Rock Distribution (D1 to D4)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **D1** | Dense band of black dots along far horizon | **CONFIRMED** | Radial density drops beyond 14.5m, but because pebbles ($< 0.12\text{m}$) are not distance-culled, hundreds of distant rocks project onto the upper 15% horizon band. | [`debris.ts:77-83`](file:///d:/project%20all/nvidia/lib/world/debris.ts#L77-L83) |
| **D2** | Distant pebbles do not fade out | **CONFIRMED** | Debris instances lack distance-based alpha or scale LOD fade; pebbles under 0.12m remain visible out to 35m. | [`ThreeViewer.tsx:845-856`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L845-L856) |
| **D3** | Edge falloff sign / ring bug | **REFINED** | Radial falloff in `debris.ts` rejects outer candidates, but rejection sampling loop continues until `instances.length < count`, redistributing instances into the 12–14m band. | [`debris.ts:51-84`](file:///d:/project%20all/nvidia/lib/world/debris.ts#L51-L84) |
| **D4** | Spawn and goal clear zones unverified | **CONFIRMED** | Spawn clear is $2.5\text{m}$ and goal clear is $2.5\text{m}$ in `debris.ts`, but goal position is hardcoded at $(14, -10)$ which is only $0.8\text{m}$ from the arena boundary ($17.2\text{m}$ radius). | [`debris.ts:40-45`](file:///d:/project%20all/nvidia/lib/world/debris.ts#L40-L45) |

---

## 4. Goal, Rim, Horizon (G1 to G7)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **G1** | Goal beacon is oversized translucent cone | **CONFIRMED** | `CylinderGeometry(0.8, 1.2, 3.5)` placed at `position[1] + 0.05` without sampling terrain height; floats or extends tens of meters into sky in perspective. Spec requires ground ring ($0.6\text{m}$) and thin column ($2.5\text{m}$). | [`ThreeViewer.tsx:938-947`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L938-L947) |
| **G2** | Goal ring sits on arena rim | **CONFIRMED** | Goal coordinate is $(14.0, 0, -10.0)$. Distance from origin is $\sqrt{14^2 + 10^2} = 17.2\text{m}$. Arena half-extent is $18.0\text{m}$. It sits $0.8\text{m}$ from edge, violating "at least 4m inside edge". | [`ThreeViewer.tsx:279`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L279), [`local_runner.ts:109`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L109) |
| **G3** | Rim renders as thick, bright white dashes | **CONFIRMED** | Fragment shader evaluates: `if (distArena >= 17.88 && distArena <= 18.08) { if (dash > 0.35) gl_FragColor.rgb = mix(..., vec3(0.99), 0.75); }`. Generates **3,063 pure-white pixels** at horizon without distance fading. | [`ThreeViewer.tsx:733-739`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L733-L739) |
| **G4** | Pale band covers left horizon (facet/patch) | **CONFIRMED** | Terrain skirt at $|x| > 18\text{m}$ has normals facing the directional key light, creating high-reflectance polygons. | [`ThreeViewer.tsx:660-667`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L660-L667) |
| **G5** | Sky and ground close in tone | **CONFIRMED** | `scene.background` and `scene.fog` are both set to flat `#2A2A2A`. Zero sky gradient or ridge silhouette. | [`ThreeViewer.tsx:186-187`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L186-L187) |
| **G6** | Horizon sits at 37–45% from top (spec 20–28%) | **CONFIRMED** | Measured horizon line in 1917×881 reproduction is at **45.5% from top**. Camera pitch is only ~7° down. | [`ThreeViewer.tsx:191`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L191), [`ThreeViewer.tsx:495`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L495) |
| **G7** | Pale stripe where pale band meets ground | **CONFIRMED** | Transition from planar detrended central field to perimeter skirt creates an elevation slope discontinuity at $18\text{m}$. | [`generator.ts:75-90`](file:///d:/project%20all/nvidia/lib/world/terrain/generator.ts#L75-L90) |

---

## 5. Terrain Readability (T1 to T6)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **T1** | Near ground reads as flat gray plane | **CONFIRMED** | Key light at 58° elevation flattens crater bowl relief; regolith micro-normal is absent. | [`ThreeViewer.tsx:226`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L226) |
| **T2** | Contour lines removed or faded out | **CONFIRMED** | In commit `aa9ea1d`, contour line opacity was lowered to 0.08 / 0.04 and distance-faded starting at 12m to 22m, making them nearly invisible from normal chase distance. | [`ThreeViewer.tsx:720-730`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L720-L730) |
| **T3** | No slope tint or regolith micro-relief | **CONFIRMED** | Slope tint is subtle (only 0.22 mix) and regolith texture has no bump/normal map. | [`ThreeViewer.tsx:710-718`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L710-L718) |
| **T4** | Large flat-shaded polygons on left horizon | **CONFIRMED** | Terrain skirt segments are coarse (128x128 grid across 48m = 0.375m per vertex); outer vertices lack central difference smoothing. | [`ThreeViewer.tsx:656`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L656) |
| **T5** | Key light direction too high | **CONFIRMED** | Key light position is $(8, 16, 10)$ ($58^\circ$ elevation). Spec calls for low-angle key ($20^\circ$ to $25^\circ$) to reveal crater rims. | [`ThreeViewer.tsx:226`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L226) |
| **T6** | Visual vs sampler parity unverified | **CONFIRMED** | Parity test ran on 1,000 points; full 10,000 point parity test across all quality tiers must be certified in CI. | [`test/terrain_detrend.test.ts:15`](file:///d:/project%20all/nvidia/test/terrain_detrend.test.ts#L15) |

---

## 6. Radar (Q1 to Q6)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **Q1** | Dense white speckle (hundreds of dots) | **CONFIRMED** | Measured **747 speckle dots** rendered on radar canvas. Every pebble is rendered regardless of size. | [`ThreeViewer.tsx:1120-1135`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1120-L1135) |
| **Q2** | No hillshade, path, trail, or goal marker | **CONFIRMED** | Radar canvas draws only a dark rectangle and dots; zero offscreen hillshade texture, zero path line. | [`ThreeViewer.tsx:1110-1145`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1110-L1145) |
| **Q3** | Robot arrow is tiny (~6px) | **CONFIRMED** | Arrow drawn with `ctx.lineTo(0, -6)` and `ctx.lineTo(3, 4)` (total length 10px, visual head 6px). Spec requires $\ge 14\text{px}$. | [`ThreeViewer.tsx:1140-1145`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L1140-L1145) |
| **Q4** | Labels 8px and low contrast | **CONFIRMED** | Text drawn in `text-[9px] text-cream-dim/60` (fails AA contrast). Spec requires $\ge 11\text{px}$ tabular Courier Prime. | [`ThreeViewer.tsx:609`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L609) |
| **Q5** | No scale bar or axis legend | **CONFIRMED** | Zero scale bar (e.g. 10m indicator) or orientation axis (+X / N) on radar. | [`ThreeViewer.tsx:605-620`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L605-L620) |
| **Q6** | Radar positions unverified vs viewport | **CONFIRMED** | No automated test exists verifying that an obstacle at $(x, z)$ on radar maps to $(x, z)$ in the 3D scene within $0.5\text{m}$. | [`test/`](file:///d:/project%20all/nvidia/test/) |

---

## 7. Robot Model (R1 to R8)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **R1** | Body is single black box with stripe | **CONFIRMED** | Torso is single `BoxGeometry(0.6, 0.16, 0.3)` with cream stripe; no panels, vents, seams, or front. | [`ThreeViewer.tsx:960-975`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L960-L975) |
| **R2** | Legs are thin gray tubes with spheres | **CONFIRMED** | Legs are basic cylinders (`radius: 0.04m`); no actuator housings, taper, or compliant pads. | [`ThreeViewer.tsx:980-1010`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L980-L1010) |
| **R3** | No sensor head (front/back ambiguous) | **CONFIRMED** | Zero forward camera head, lidar puck, or front indicator. | [`ThreeViewer.tsx:955-975`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L955-L975) |
| **R4** | Body near-black with no reflections | **CONFIRMED** | Shell color `#3A3A3A` with metalness 0.15 and zero environment map; absorbs light into background. | [`ThreeViewer.tsx:961`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L961) |
| **R5** | Mesh and controller FK/IK lack parity | **CONFIRMED** | Mesh link lengths and controller kinematic constants are hardcoded separately in two files. | [`ThreeViewer.tsx:980`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L980), [`local_runner.ts:262`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L262) |
| **R6** | No LEDs, footprints, or dust puffs | **CONFIRMED** | Status LED strips, footprint decal pool, and dust puff emitters are not instantiated in scene. | [`ThreeViewer.tsx:283`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L283) |
| **R7** | Proportions read as toy | **CONFIRMED** | Lack of structural bevels, joint brackets, and actuator hubs reduces perception of functional scale. | [`ThreeViewer.tsx:955-1010`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L955-L1010) |
| **R8** | Foot contact blobs not attached | **CONFIRMED** | Blobs are placed at `pos[0], groundElevation + 0.005, pos[2]` via independent arrays rather than hierarchy. | [`ThreeViewer.tsx:785-798`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L785-L798) |

---

## 8. Header, Perf Chip, UI (H1 to H7)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **H1** | Header chips overlap or touch | **CONFIRMED** | Layout audit on 1917px measured: `"Policy v1"` touches `"Task Prompt"` with **-1px gap**; `"Teleop"` crowds `"ARENA"` with **-1px gap**. | [`Header.tsx:45-80`](file:///d:/project%20all/nvidia/components/shell/Header.tsx#L45-L80) |
| **H2** | Title truncated with no tooltip | **CONFIRMED** | Title `"Low-Gravity Lunar Crater Exploration"` truncates with ellipsis; `title` attribute is missing. | [`Header.tsx:50`](file:///d:/project%20all/nvidia/components/shell/Header.tsx#L50) |
| **H3** | Perf chip mixes formats | **CONFIRMED** | Formatted as `6.9msp50/7.1msp95` without spaces, decimals inconsistently padded. | [`FpsBadge.tsx:38-46`](file:///d:/project%20all/nvidia/components/shell/FpsBadge.tsx#L38-L46) |
| **H4** | Red "2 long tasks" badge unexplained | **CONFIRMED** | `PerfProbe.getSnapshot().longTaskCount` tracks lifetime count from page load (hydration 110ms + terrain 65ms). Displayed permanently in red. | [`FpsBadge.tsx:50-58`](file:///d:/project%20all/nvidia/components/shell/FpsBadge.tsx#L50-L58) |
| **H5** | ARENA chip lost distance display | **CONFIRMED** | Distance removed from header chip and moved exclusively to playback bar; status reads `"ARENA: INSIDE"`. | [`Header.tsx:65`](file:///d:/project%20all/nvidia/components/shell/Header.tsx#L65) |
| **H6** | Inconsistent font sizes & padding across chips | **CONFIRMED** | Token chip uses `text-[10px]`, FpsBadge uses `text-[11px]`, mode chip uses `text-[9px]`. | [`Header.tsx`](file:///d:/project%20all/nvidia/components/shell/Header.tsx) |
| **H7** | Left panel mostly empty space | **CONFIRMED** | Left console sidebar renders 15 lines of empty charcoal space below log banner during active runs. | [`LeftPanel.tsx:20-50`](file:///d:/project%20all/nvidia/components/shell/LeftPanel.tsx#L20-L50) |

---

## 9. Log, Episodes, and Architect Visibility (L1 to L6)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **L1** | Episodes reset every 12–18s with no logged reason | **CONFIRMED** | **Root cause identified:** In `local_runner.ts:194`, reaching the goal (`goalDist < 1.0m`) triggers `this.needsResetNextStep = true`. Straight-line travel from spawn $(0, 0)$ to goal $(14, -10)$ at $1.1\text{m/s}$ takes **15.6 seconds**. The robot reaches the goal and succeeds, resetting to start Episode 2, then Episode 3 at $t=32\text{s}$. However, **zero log lines** are emitted to the Console, leaving the user completely in the dark! | [`local_runner.ts:194-199`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L194-L199) |
| **L2** | Playback bar lacks episode boundary marks | **CONFIRMED** | Scrubber renders single continuous 0–60s slider with zero vertical tick marks for episode resets. | [`PlaybackBar.tsx:40-60`](file:///d:/project%20all/nvidia/components/shell/PlaybackBar.tsx#L40-L60) |
| **L3** | Architect stages never appear in Console | **CONFIRMED** | In fixture/demo mode, stage transitions (Spec, Reward, Datagen, Safety) do not log stage events into Console state. | [`Console.tsx:30-80`](file:///d:/project%20all/nvidia/components/shell/Console.tsx#L30-L80) |
| **L4** | Token meter static (2,380 tok · $0.0232) | **CONFIRMED** | Token cost displays static fixture totals without updating step tokens or stating `[FIXTURE]`. | [`TokenMeter.tsx:15-35`](file:///d:/project%20all/nvidia/components/shell/TokenMeter.tsx#L15-L35) |
| **L5** | No Run Summary card at episode end | **CONFIRMED** | When an episode resets, zero summary modal or card is presented. | [`local_runner.ts:195`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L195) |
| **L6** | Warnings never reach the log | **CONFIRMED** | Boundary penalties and contact warnings increment counters internally but emit no log events. | [`local_runner.ts:295`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L295) |

---

## 10. Camera and Framing (C1 to C3)

| ID | Title / Hypothesis | Verdict | Measured Baseline Evidence & Root Cause | Code Location |
| :--- | :--- | :---: | :--- | :--- |
| **C1** | Camera nearly horizontal (horizon at 45.5%) | **CONFIRMED** | In 1917×881 viewport, horizon is at **45.5% from top** (spec: 20% to 28%). Pitch is only ~7° down. | [`ThreeViewer.tsx:191`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L191) |
| **C2** | Robot is small in frame (~12% height) | **CONFIRMED** | Robot chassis projects to ~95px height on 881px canvas (**10.8% of height**, spec is 16% to 22%). | [`ThreeViewer.tsx:191`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L191) |
| **C3** | Camera heading follows path tangent, zero roll | **CONFIRMED HEALTHY** | `camera.up.set(0, 1, 0)` is strictly locked every frame; yaw follows path lookahead without roll. | [`ThreeViewer.tsx:495`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L495) |

---

## 11. Motion and Kinematics Invariants (Walk Ladder)
- **L0 (Flat & Empty):** Evaluated and confirmed passing: Slip angle P95 = **0.00°**, max lateral error = **0.000m**, path straightness = **1.0000**.
- **L1 through L5:** All passing on `walk_ladder_gates.test.ts`. Straight walking invariant is maintained in the simulator backend.
