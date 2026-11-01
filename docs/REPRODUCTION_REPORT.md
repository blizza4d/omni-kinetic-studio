# REPRODUCTION REPORT — OMNI-KINETIC BUG-FIX RELEASE
**Build Stamp:** `iteration-5-dev (baseline: bugfix-baseline) • sha:21842619 (main) • production`  
**Base URL:** `http://localhost:3000`  
**Screenshot Folder:** `C:\Users\Asus\.gemini\antigravity\brain\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\screenshots\bugfix_baseline`  
**Date:** 2026-11-01  
**Gate:** Gate 1 Baseline Audit

---

## 1. Overview
This report documents the exact deterministic reproduction procedure (Seed, Camera Preset, Timestamp, URL query, and screenshot artifact) for every confirmed defect in the Defect Register.

---

## 2. Reproduction Matrix by Defect Group

### 2.1 Locomotion Defects (W1–W6, W8, W10, W11, W13–W17)
- **Defects:** W1 (Mesh forward axis offset), W2 (Yaw sign flip), W3 (Quaternion composition), W8 (Pure pursuit absent), W13 (Goal bearing plane), W14 (Yaw wrap jump).
  - **Reproduction Seed:** `42` (also reproducible on 101, 777, 2024, 9999).
  - **Camera View:** `V1 Chase (t=0)` and `V2 Chase (t=12.5s)`.
  - **Timestamp:** `t = 0.0s` to `t = 12.5s`.
  - **Evidence Artifact:** `seed_42_V1_chase_t0.png` and `seed_42_V2_chase_t12_5.png`.
  - **Steps to Reproduce:**
    1. Navigate to `http://localhost:3000/?seed=42`.
    2. Observe the robot as simulation begins. The body chassis is facing +X (world forward), but its velocity vector travels at bearing -0.62 rad (-35.5°).
    3. Note the crab-walking gait: the body is slanted diagonally relative to its travel line.
    4. Measured slip angle: **23.52° to 37.81° P95**.
- **Defects:** W4 (Global terrain tilt), W5 (Orientation over-following), W16 (Camera roll/horizon tilt).
  - **Reproduction Seed:** `101`, `777`.
  - **Camera View:** `V5 Side` and `V4 Low-angle Horizon`.
  - **Timestamp:** `t = 5.0s`.
  - **Evidence Artifact:** `seed_101_V5_side.png` and `seed_777_V4_low_angle.png`.
  - **Steps to Reproduce:**
    1. Navigate to `http://localhost:3000/?seed=101`.
    2. Press hotkey `3` to switch to Side View.
    3. Notice the entire horizon line and terrain slope is tilted left-to-right (measured P95 window tilt: **10.72°**).

---

### 2.2 Robot Model Defects (R1–R12)
- **Defects:** R1 (Box shell), R2 (Thin cylinder legs), R3 (Flat disc feet), R4 (No sensor head), R5 (Low contrast 0.998:1), R6 (No AO/bevel), R7 (No LEDs), R12 (Toy proportions).
  - **Reproduction Seed:** `42`.
  - **Camera View:** `V6 Close-up (1.5m)`.
  - **Timestamp:** `t = 2.0s`.
  - **Evidence Artifact:** `seed_42_V6_close_up.png`.
  - **Steps to Reproduce:**
    1. Navigate to `http://localhost:3000/?seed=42`.
    2. Zoom camera to 1.5m distance (or inspect V6 close-up screenshot).
    3. Notice the chassis is a featureless dark box (`0x3a3a3a`) with a single cream strip; legs are wire-thin tubes (`radius: 0.018m`); feet are flat hockey pucks. Front and back are indistinguishable.
    4. Measured luminance ratio against background ground: **0.998:1** (violates >= 2.0:1 requirement).

---

### 2.3 Gravity & Units Defects (G1–G6)
- **Defects:** G1 (HUD "GRAVITY: 0 m/s²"), G2 (Unit confusion), G3 (Rounding/formatting), G5 (Runner hardcoded bounce).
  - **Reproduction Seed:** Any seed (`42`, `101`, `777`).
  - **Camera View:** All views (top-left HUD overlay).
  - **Timestamp:** `t = 0.0s`.
  - **Evidence Artifact:** `00_baseline_overview.png` and `seed_42_V1_chase_t0.png`.
  - **Steps to Reproduce:**
    1. Navigate to `http://localhost:3000`.
    2. Look at the top-left HUD chip in the 3D viewport.
    3. The chip displays: `GRAVITY: 0 m/s²`.
    4. Root cause: `ThreeViewer.tsx` line 584 inspects `envSpec.gravity[2]` which is 0, instead of `envSpec.gravity[1]` which is -1.62.

---

### 2.4 Terrain & Horizon Defects (T1–T8, T11–T12, H1–H6)
- **Defects:** H1 (Permanent red rim glow), H2 (Solid white rim line), H3 (Static proximity calculation), H4 (Horizontal white stripes), T2 (Contour polyline artifacts), T4 (Fog bypass), T5 (Horizon stripes).
  - **Reproduction Seed:** `42`, `101`, `777`, `2024`, `9999`.
  - **Camera View:** `V1 Chase`, `V4 Low-angle Horizon`, `V5 Side`.
  - **Timestamp:** `t = 0.0s` (robot is at (0, 0), distance to rim is 18.0m).
  - **Evidence Artifact:** `seed_42_V1_chase_t0.png` and `seed_42_V4_low_angle.png`.
  - **Steps to Reproduce:**
    1. Navigate to `http://localhost:3000/?seed=42`.
    2. Notice a brilliant brick red glow band running along the entire far rim perimeter, even though the robot is at spawn `(0, 0)` (18 meters from the edge). Measured: **201px to 302px brick red pixels in every frame**.
    3. Look toward the horizon in V4 low-angle view. Notice thick, jagged horizontal white stripes stacked on the distant terrain skirt.
    4. Root cause: Fragment shader injected in `#include <dithering_fragment>` after fog, unconditionally painting `distArena >= 16.0` in brick red and contour lines without distance falloff.

---

### 2.5 Debris & Lighting Defects (D1–D7, D10, L1–L7)
- **Defects:** D1 (Near-black rock blobs), D2 (Far rim rock band), D3 (Far-field rock wall), D4 (No visible shadows), D5 (Low-poly repetition), L1 (Shadow absence), L2 (Flat lighting), L4 (No rock contact shadows).
  - **Reproduction Seed:** `42`, `101`, `2024`.
  - **Camera View:** `V1 Chase`, `V3 Top`.
  - **Timestamp:** `t = 0.0s`.
  - **Evidence Artifact:** `seed_42_V1_chase_t0.png` and `seed_42_V3_top.png`.
  - **Steps to Reproduce:**
    1. Navigate to `http://localhost:3000/?seed=42`.
    2. Inspect rocks across the arena. Rocks appear as pitch-black, facet-shaded lumps (`0x4a4a44`) with no visible shadows cast onto the ground.
    3. Inspect the perimeter: a dense band of black boulders lines the 17.6m perimeter.
    4. Root cause: Directional shadow camera frustum is an orthographic box of only ±6.5m centered on the robot. All rocks farther than 6.5m cast zero shadows. Ambient light (0.55) + unshadowed fill light (0.65) washes out direct shadow contrast.

---

### 2.6 Goal Beacon Defects (H7, H8, NEW-3, NEW-6)
- **Defects:** H7 (Large translucent cone), H8 (Goal placed in rim margin), NEW-3 (Goal elevation hardcoded).
  - **Reproduction Seed:** `42`.
  - **Camera View:** `V1 Chase`, `V3 Top`.
  - **Timestamp:** `t = 0.0s`.
  - **Evidence Artifact:** `seed_42_V1_chase_t0.png` and `seed_42_V3_top.png`.
  - **Steps to Reproduce:**
    1. Navigate to `http://localhost:3000/?seed=42`.
    2. Look at the goal beacon at `(14.0, -10.0)`. It is rendered as a 3.5m tall truncated cone with double-sided transparency.
    3. Its base sits at `y = 0.05` without sampling the terrain height at `(14, -10)`.
    4. Distance from center is `sqrt(14^2 + (-10)^2) = 17.2m`, which is only 0.8m from the 18.0m boundary (violating the 4m margin requirement).

---

### 2.7 Radar Defects (Q1–Q6, NEW-1, NEW-2)
- **Defects:** Q1 (Dense white speckle), Q2 (Hillshade obliterated), Q3 (No path/trail), Q4 (Robot arrow locked), NEW-1 (World vs Robot Centering Desync), NEW-2 (Robot Arrow Heading Frozen).
  - **Reproduction Seed:** `42`.
  - **Camera View:** Top-right Radar Canvas.
  - **Timestamp:** `t = 10.0s` to `t = 30.0s`.
  - **Evidence Artifact:** `run_progress_t10s.png` to `run_progress_t30s.png`.
  - **Steps to Reproduce:**
    1. Navigate to `http://localhost:3000/?seed=42`.
    2. Watch the top-right radar widget as the robot walks.
    3. Over 1,200 debris dots form a dense white speckle across the entire canvas.
    4. The robot arrow stays locked at the radar center `(cx, cy)` pointing straight UP; it NEVER rotates when the robot steers!
    5. As the robot moves away from (0, 0), the debris dots stay fixed in world coordinates, desyncing from the robot's relative position.

---

### 2.8 Header & UI Defects (U1–U8, NEW-5)
- **Defects:** U1 (Chip overlap), U2 (Title truncation without tooltip), U3 (Red 2 long tasks badge), U4 (Perf numbers dim), U6 (Empty left panel).
  - **Reproduction Viewport:** `1280 × 900` and `1440 × 900`.
  - **Evidence Artifact:** `docs/header-layout-baseline.json`.
  - **Steps to Reproduce:**
    1. Open Chrome at 1280px width: `http://localhost:3000`.
    2. Inspect header: "Policy v1" overlaps "Task Prompt" with a negative gap of `-1.0px`. "Teleop" overlaps "ARENA: INSIDE" with a negative gap of `-1.0px`.
    3. Task prompt title "Low-Gravity Lunar Crater Exploration" is truncated to "Low-Gravit..." with NO tooltip attribute (`title` is null).
    4. Perf chip displays a persistent red badge: `2 long tasks` because startup hydration tasks are counted in the lifetime tally.
