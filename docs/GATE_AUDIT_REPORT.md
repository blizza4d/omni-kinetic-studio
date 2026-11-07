# GATE AUDIT REPORT: WHY EARLIER GATES DID OR DID NOT FAIL
**Project:** Omni-Kinetic Browser-Native Sim-to-Real Embodied AI Studio  
**Gate:** Gate 1 (Planning Gate / Baseline Reconciliation — Item 5 & B4)  
**Date:** 2026-11-02  
**Baseline Git Tag:** `fix3-baseline` (`aa9ea1d`)  

---

## 1. Executive Summary
In Section 2.1 (B4), the user asked:
> "Earlier gates (header overlap, long-task badge, rock luminance, shadows) either were never implemented or are not enforced in CI. Report which."

This audit examines every previous test gate, explains why each passed while visual defects remained present, and defines the mandatory enforcement mechanism for Fix Pass 3.

---

## 2. Gate-by-Gate Post-Mortem

### 1. Header Overlap Gate (Defect H1)
- **Was it implemented?** YES, as a standalone script: [`scripts/audit_header_layout.ts`](file:///d:/project%20all/nvidia/scripts/audit_header_layout.ts).
- **Did it fail when run?** YES. When executed directly, `audit_header_layout.ts` reported:
  ```text
  [Width 1920px] Overlaps/Touches: 2, Title: "Low-Gravity Lunar Crater Exploration"
     - OVERLAP/CROWDING: "6.9msp50/7.2msp951 long taskhi" vs "1 long task" (gap: -1px)
  [Width 1280px] Overlaps/Touches: 5
     - OVERLAP/CROWDING: "Policy v1" vs "Task PromptCtrl+K" (gap: -1px)
  ```
- **Why was it not caught in CI?**
  `package.json` defines `"test": "node --test dist-test/**/*.test.js || tsx --test **/*.test.ts"`. Node test runner executes files in `test/`, but `scripts/audit_header_layout.ts` lived in `scripts/` and was **never hooked into `npm test` or a git pre-commit hook**. It was treated as a diagnostic script rather than a blocking CI gate.
- **Fix Pass 3 Enforcement:** Authored [`test/layout_overlap_gate.test.ts`](file:///d:/project%20all/nvidia/test) executed during `npm test`, asserting bounding box non-intersection and $\ge 4\text{px}$ gap across 1280, 1440, 1917, and 1920 px viewports.

---

### 2. Long-Task Badge Gate (Defect H4)
- **Was it implemented?** NO, not as an automated assertion.
- **Why did it pass?**
  Performance tests ([`verify_phase3_6_perf.ts`](file:///d:/project%20all/nvidia/scripts/verify_phase3_6_perf.ts)) verified that the simulation frame rate maintained p50 $\le 12\text{ms}$ and p95 $\le 16.7\text{ms}$. However, the test inspected internal telemetry timing arrays, **never asserting the DOM state or CSS classes of `FpsBadge.tsx`**. Because Next.js hydration generated 2 startup long tasks (65ms and 110ms), `probe.getSnapshot().longTaskCount` was permanently $\ge 2$, causing the UI badge to render in red brick continuously.
- **Fix Pass 3 Enforcement:** Create `test/perf_badge_gate.test.ts` asserting that `FpsBadge` counts only tasks occurring after steady-state entry ($t > 5\text{s}$) in a rolling 60s window, and that the DOM badge contains 0 long tasks with neutral coloring during steady-state runs.

---

### 3. Rock Luminance Gate (Defect K1)
- **Was it implemented?** PARTIALLY, but with a flawed metric.
- **Why did it pass?**
  In [`scripts/audit_visual_metrics.py`](file:///d:/project%20all/nvidia/scripts/audit_visual_metrics.py), `crushed_black_fraction` was computed across the entire $1920\times 1080$ frame with a threshold of $\text{luminance} < 0.03$. The terrain ground has luminance $\approx 0.06$ (above 0.03), and sky background is $\approx 0.16$. Because rocks occupy only $\approx 1.5\%$ of the total pixels, an image-wide 95th percentile metric `crushed_black_p95` returned **0.00%**!
  The metric evaluated the overall canvas rather than segmenting rock pixel clusters. The rocks were at **0.0046 luminance (pure black)**, but the global percentile test was completely blind to them!
- **Fix Pass 3 Enforcement:** In P1, `test/rock_luminance_gate.test.ts` will specifically crop and segment rock clusters (using `?debug=rocksNormals` and object masks), asserting:
  1. Fraction of rock pixels with luminance $< 0.05$ is $\le 10\%$.
  2. Ratio of lit rock face luminance to ground luminance is between $1.2$ and $2.2$.
  3. Crushed black pixels on non-shadow regions $\le 1.5\%$.

---

### 4. Shadow Presence Gate (Defect K2 / K3)
- **Was it implemented?** NO, only boolean state flags were checked.
- **Why did it pass?**
  Tests in `test/phase3_5.test.ts` checked `renderer.shadowMap.enabled === true` and `dirLight.castShadow === true`. Having shadow flags enabled in code does not guarantee that shadows are physically perceptible on screen. Because the rock material was crushed to 0.0046, rocks self-shadowed into 0.0000, and key light was set to an excessively steep $58^\circ$ angle, shadows were virtually invisible.
- **Fix Pass 3 Enforcement:** In P1, implement a pixel-differential shadow presence test: compare rendered pixels under `?debug=shadowsOnly` against unshadowed passes, proving that $\ge 90\%$ of rocks within 14m produce a contiguous attached shadow with luminance contrast $\ge 35\%$.

---

## 3. Summary Table: Gate Status & CI Enforcement

| Subsystem | Previous State in CI | Why Defect Escaped | Fix Pass 3 CI Enforcement |
| :--- | :--- | :--- | :--- |
| **Header Overlap** | Standalone script only | Not in `npm test` pipeline | Add `test/layout_overlap_gate.test.ts` (1280, 1440, 1917, 1920 px) |
| **Long-Task Badge** | Timing array checked | DOM badge state was never tested | Add `test/perf_badge_gate.test.ts` (steady-state window verification) |
| **Rock Luminance** | Global image p95 metric | Global metric diluted 1.5% rock area | Add `test/rock_luminance_gate.test.ts` (segmented rock mask analysis) |
| **Shadow Presence**| Boolean flags checked | Flags were true, but contrast was 0 | Add `test/shadow_presence_gate.test.ts` (pixel differential check) |
| **Build Stamp** | Hardcoded strings in test | Test looked for hardcoded '21842619' | Add `test/build_stamp_freshness.test.ts` (git rev-parse dynamic test) |
