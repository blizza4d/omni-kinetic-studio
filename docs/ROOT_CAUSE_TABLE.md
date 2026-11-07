# ROOT CAUSE TABLE & BISECT RESULTS — FIX PASS 3: "RECONCILE, PROVE, THEN FIX"
**Project:** Omni-Kinetic Browser-Native Sim-to-Real Embodied AI Studio  
**Gate:** Gate 1 (Planning Gate / Baseline Reconciliation)  
**Date:** 2026-11-02  
**Baseline Git Tag:** `fix3-baseline` (`aa9ea1d`)  

---

## 1. Git Bisect Results for Core Regressions

### Bisect 1: Pure-Black Rocks (Regression K1)
- **Introducing Commit:** [`aa9ea1dc7a53316fe27e1645bd934fcffa725dad`](file:///d:/project%20all/nvidia) ("fixes")
- **File & Lines:** [`components/viewer/ThreeViewer.tsx:817-856`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L817-L856)
- **Prior Working State:** In commit `2d6716e`, `InstancedMesh` used `debrisMat` with `color: 0x4a4a44` without `instanceColor`. Rocks rendered in flat `#4A4A44` gray (luminance ~18%).
- **What Changed:** In commit `aa9ea1d`, per-instance color variation was added by calling:
  ```typescript
  const col = colorVariation[(d.id + c) % colorVariation.length];
  instancedMesh.setColorAt(i, col);
  ```
- **Root Mechanism:**
  In Three.js r174, calling `setColorAt` allocates `instancedMesh.instanceColor` and causes `WebGLProgram` to inject `#define USE_INSTANCING_COLOR` and `#define USE_COLOR`.
  In `MeshStandardMaterial` (`color_fragment.glsl`):
  ```glsl
  #elif defined( USE_COLOR )
      diffuseColor.rgb *= vColor;
  #endif
  ```
  Where `diffuseColor` is initialized from `material.color`.
  Because `material.color` was already dark gray `0x4a4a44` ($\approx 0.068$ linear RGB), and `vColor` from `instanceColor` was also `0x4a4a44` ($\approx 0.068$ linear RGB):
  $$\text{diffuseColor.rgb} = 0.068 \times 0.068 = \mathbf{0.0046}\text{ linear RGB (0.46\% luminance)}$$
  **Multiplying dark gray by dark gray squared the luminance down to 0.0046**, crushing every single rock to pure black!
- **Prescribed Fix:** Set `debrisMat.color = 0xffffff` (pure white, linear 1.0) so that $\text{diffuseColor.rgb} = 1.0 \times \text{instanceColor} = \text{instanceColor}$. In addition, provide a procedural PMREM environment and normal Y top-face vertex color gradient.

---

### Bisect 2: Contour Lines Removed / Faded (Regression T2)
- **Introducing Commit:** [`aa9ea1dc7a53316fe27e1645bd934fcffa725dad`](file:///d:/project%20all/nvidia) ("fixes")
- **File & Lines:** [`components/viewer/ThreeViewer.tsx:720-730`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L720-L730)
- **Prior Working State:** Earlier builds rendered thick white polylines with `opacity: 0.32` and `0.14` across the entire terrain.
- **What Changed:** Commit `aa9ea1d` attempted to fix the "jagged white polylines" defect by adding distance fading:
  ```glsl
  float camDist = length(vWorldPos - cameraPosition);
  float distFade = 1.0 - smoothstep(12.0, 22.0, camDist);
  if (distFade > 0.001) {
    if (fMajor < 1.0) {
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.99, 0.98, 0.97), 0.08 * distFade);
    }
  }
  ```
- **Root Mechanism:**
  At normal chase camera distance ($\text{camDist} \approx 18\text{m}$ to $35\text{m}$), `distFade` drops to $0.00$, completely eliminating all contours from view. The user perceived this as a feature being turned off rather than fixed.
- **Prescribed Fix:** Retain world-space anti-aliasing via `fwidth(vWorldPos.y)`, maintain faint opacity ($6\%$ to $10\%$) with a calibrated fade envelope out to $35\text{m}$, ensuring contours remain subtly visible in the mid-ground without aliasing.

---

### Bisect 3: Rock Shadows Missing / Weak (Regression K2 / K3)
- **Introducing Commit:** [`2d6716e49ff33d5dc3d2f0c63f43f6823ad731e4`](file:///d:/project%20all/nvidia) ("Clean initial project upload")
- **File & Lines:** [`components/viewer/ThreeViewer.tsx:219-242`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L219-L242), [`components/viewer/ThreeViewer.tsx:754`](file:///d:/project%20all/nvidia/components/viewer/ThreeViewer.tsx#L754)
- **Root Mechanism:**
  1. Directional light was initially capped at $\pm 6.5\text{m}$ orthographic frustum.
  2. In commit `aa9ea1d`, the frustum was expanded to $24\text{m}$, but because the rock material was crushed to $0.0046$ luminance (Bisect 1), self-shadowing and cast shadows produced zero perceptible luminance delta against the dark `#2E2E2E` ground.
  3. The steep $58^\circ$ key light angle created short, stubby shadows that were swallowed by the rock's base.
- **Prescribed Fix:** Fix rock base color to white so instanced colors read at $28\text{–}40\%$ luminance; lower key light elevation to $22^\circ$; ensure terrain `onBeforeCompile` preserves standard Three.js shadow chunks; tune shadow bias to $-0.0003$.

---

## 2. Comprehensive Root Cause Table Across All Areas

| Category | Defect Title | Root Cause (Technical Mechanism) | Introducing Commit | Fix Strategy |
| :--- | :--- | :--- | :---: | :--- |
| **Build Identity** | Hardcoded Stamp (`21842619`) | `lib/build_stamp.ts` line 23 hardcodes static string; no git inspection hook before build. | `2d6716e` | Prebuild script generates `build_stamp_generated.json` with dynamic git rev-parse, dirty flag, UTC timestamp, and bundle hash. |
| **Rocks** | Pure-black rocks ($0.46\%$ lum) | `debrisMat.color` ($0x4a4a44$) multiplied by `instanceColor` ($0x4a4a44$) squares dark value to $0.0046$. | `aa9ea1d` | Set `debrisMat.color = 0xffffff`; add vertex normal Y gradient for lit tops. |
| **Shadows** | Missing rock shadows | Zero luminance contrast due to black rocks; steep key light angle ($58^\circ$). | `2d6716e` | Low-angle key ($22^\circ$ elevation), 24m orthographic shadow frustum, PCF soft filtering. |
| **Episodes** | Resets every 12–18s with no log | Goal reached at $15.6\text{s}$ triggers `needsResetNextStep = true`, but runner emits zero Console log events. | `2d6716e` | Emit `EpisodeEvent` at every reset; log line to Console ("Episode 1 ended: goal reached in 15.2s, 17.2m"). |
| **Goal Beacon** | Giant cone extending off-screen | `CylinderGeometry(0.8, 1.2, 3.5)` placed at static $y=0.05$ without terrain height sampling. | `2d6716e` | Ground ring ($0.6\text{m}$) draped on terrain + thin light cylinder ($2.5\text{m}$ tall, $0.25\text{m}$ radius, alpha gradient). |
| **Goal Location** | Goal placed at $17.2\text{m}$ (on rim) | Hardcoded goal coordinate $(14.0, 0, -10.0)$ is only $0.8\text{m}$ from the $18\text{m}$ arena edge. | `2d6716e` | Dynamic goal placement $8\text{–}30\text{m}$ from spawn, strictly $\ge 4\text{m}$ inside boundary, on slope $\le 5^\circ$. |
| **Rim Dashes** | Thick bright white dashes at horizon | Fragment shader hardcodes `distArena >= 17.88 && distArena <= 18.08` at $0.75$ pure white mix. | `2d6716e` | Screen-space $1.5\text{px}$ dashed line via `fwidth` in terrain shader, cream-dim ($35\%$ opacity), faded beyond $30\text{m}$. |
| **Terrain** | Flat gray plane, no relief | High key light angle ($58^\circ$), subtle slope tint ($0.22$), and lack of regolith micro-normal. | `2d6716e` | Low-angle key ($22^\circ$), regolith micro-normal, slope tint (sage flat, cream-dim convex rims). |
| **Radar** | Dense 747-speckle clutter | Every rock is rendered regardless of size; zero size threshold filtering. | `2d6716e` | Filter rocks $\ge 0.12\text{m}$ (dots sized by rock); pre-render offscreen hillshade; draw 14px arrow, path, goal, scale bar. |
| **Header UI** | Chip collisions (-1px gap) | Flex row uses unconstrained text children with no minimum gap or responsive icon collapse. | `2d6716e` | Flex row with `gap >= 6px`, `min-width: 0`, 32px height, tabular Courier Prime, icon collapse under width caps. |
| **Perf Badge** | Red "2 long tasks" badge | `PerfProbe.longTaskCount` tracks lifetime count since page load (hydration 110ms + terrain 65ms). | `2d6716e` | Filter long tasks to rolling 60s steady-state window; tag startup tasks as "startup"; neutral color at 0. |
| **Camera** | Horizon at 45.5% (nearly flat) | Camera pitch is only ~7° down; looking at origin rather than forward tangent. | `2d6716e` | Pitch 14° down, distance 5.5m, elevation 1.6m, looking 1.0m ahead; enforces horizon at 20%–28% from top. |
