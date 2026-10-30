# Omni-Kinetic: Current State Audit & Baseline (Iteration 2)

**Audit Date:** 2026-10-27  
**Baseline Test Status:** 9/9 passing tests (`npx tsx --test test/*.test.ts`)  
**Baseline Screenshot:** `/docs/baseline/baseline_audit.png`  
**Baseline Console Health:** Clean execution, single 404 on `/favicon.ico` (D25)

---

## 1. Defect Verification (D1 through D24)

| Defect ID | Severity | Status | Code Evidence & Root Cause |
| :--- | :--- | :--- | :--- |
| **D1** | Critical | **Confirmed** | `ThreeViewer.tsx`: `scene.background = 0x1a1a1a` + `terrainMat = 0x222222` produces an empty black void with no visible horizon or dust. |
| **D2** | Critical | **Confirmed** | `ThreeViewer.tsx`: `rewardHaloRef` is a `SphereGeometry(0.65)` with `wireframe: true` around torso; camera `dist: 5.5` makes robot tiny sticks. |
| **D3** | Critical | **Confirmed** | `ThreeViewer.tsx`: `renderMinimap` only draws static circles and 1 dot; no debris, trails, goals, or collision pings. |
| **D4** | High | **Confirmed** | `Shell.tsx`: appends `[SIM STATUS] Active streaming...` to log array on every interval, creating 120 repeated lines. |
| **D5** | High | **Confirmed** | `AnalogLogPane.tsx`: `Spec`, `Reward`, `Datagen`, `Gate` tabs hidden behind `{architectOutput && ...}`. |
| **D6** | High | **Confirmed** | `jobs/stream/route.ts`: stream terminates on success; viewport sits frozen with zero summary card or replay controls. |
| **D7** | High | **Confirmed** | No reward curve sparkline or component breakdown; collision pulse is an unmetered border shake. |
| **D8** | High | **Confirmed** | `globals.css`: `body` has `--charcoal-deep: #1A1A1A` instead of workspace `#2A2A2A`; glass panels lack 14px blur and saturation. |
| **D9** | Medium | **Confirmed** | Teleop button appears dimmed/unexplained with no readiness indicator or WebGPU chip. |
| **D10** | Medium | **Confirmed** | Far right icon button is an unlabeled pause/play button with no text or layout dropdown. |
| **D11** | Medium | **Confirmed** | Token meter displays single total string with no per-tier breakdown or resolved model IDs. |
| **D12** | Medium | **Confirmed** | No run history, iteration numbers, or IndexedDB persistence. |
| **D13** | Medium | **Confirmed** | No timeline scrubber, step buttons, or playback speed multipliers. |
| **D14** | Medium | **Confirmed** | 60 FPS measured only on 72 dodecahedrons; 2,000 instances unmeasured. |
| **D15** | Medium | **Confirmed** | Demo vs Cloud badge toggles state string without explaining queue, cold-start, or storage mechanics. |
| **D16** | Medium | **Confirmed** | `?` key produces no response; shortcuts are undocumented. |
| **D17** | Low | **Confirmed** | Left panel fixed at `w-96`; not resizable via drag and no `Ctrl+B` toggle. |
| **D18** | Low | **Confirmed** | Missing contextual glass empty and error states. |
| **D19** | Low | **Confirmed** | `/status` route does not exist. |
| **D20** | Low | **Confirmed** | No first-time onboarding hint card or preset guidance. |
| **D21** | Medium | **Confirmed** | `LocalSimulationRunner` uses analytical sinusoidal trot gait rather than physical terrain contact dynamics. |
| **D22** | Medium | **Confirmed** | Offline fallback does not explicitly badge output as `[RECORDED FIXTURE]`. |
| **D23** | Medium | **Confirmed** | Test suite lacks E2E, contract replay, and visual regression tests. |
| **D24** | Low | **Confirmed** | `README.md` missing Judge Mode (`J`) and Iteration 2 features. |

---

## 2. Additional Defects (D25 – D27)

* **D25 (Missing Favicon):** 404 response on `/favicon.ico`.
* **D26 (Main-Thread Terrain Hitch):** Terrain geometry calculated synchronously on UI thread.
* **D27 (Three.js Resource Disposal):** Geometries, materials, and instanced meshes not disposed on teardown.
