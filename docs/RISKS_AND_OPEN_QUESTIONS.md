# RISKS AND OPEN QUESTIONS — FIX PASS 3: "RECONCILE, PROVE, THEN FIX"
**Project:** Omni-Kinetic Browser-Native Sim-to-Real Embodied AI Studio  
**Gate:** Gate 1 (Planning Gate / Baseline Reconciliation — Zero Production Code Modifications)  
**Date:** 2026-11-02  
**Baseline Git Tag:** `fix3-baseline` (`aa9ea1d`)  

---

## 1. Core Risk & Diagnostic Assessment (Mandated by Section 10)

### Question 1: Is the Browser Agent Rendering on Software or Hardware GPU?
- **Empirical Measurement:**  
  During the live reproduction run of `scripts/reproduce_fix3_user_view.ts`, the browser agent queried `WEBGL_debug_renderer_info`:
  ```json
  {
    "vendor": "Google Inc. (NVIDIA)",
    "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU (0x000025A2) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "webgl2": true
  }
  ```
- **Conclusion:** The browser agent is running on **genuine hardware GPU acceleration** via Direct3D11 on an NVIDIA GeForce RTX 3050 Laptop GPU. Performance metrics ($6.9\text{ ms}$ p50 / $7.1\text{ ms}$ p95) and shader executions reflect real hardware rendering, not software SwiftShader emulation.

---

### Question 2: Do Any Uncommitted Changes Exist?
- **Empirical Measurement:**  
  `git status` outputs:
  ```text
  On branch main
  Your branch is up to date with 'origin/main'.
  nothing to commit, working tree clean
  ```
  Tagged baseline commit: `fix3-baseline` (`aa9ea1d`).
- **Conclusion:** **Zero uncommitted files exist.** The tree is 100% clean. All baseline measurements and reproductions represent committed, reproducible code.

---

### Question 3: Is the User's Browser Serving Cached Assets?
- **Empirical Measurement:**  
  Next.js App Router chunks client JavaScript with unique content hashes (e.g. `117-37743225d74b84a7.js`). However, `next.config.mjs` lacked explicit `Cache-Control` headers on the HTML entrypoint. In browsers that cache HTML aggressively, a soft page refresh might continue executing previously loaded bundles if the HTML document itself is served from memory cache.
- **Risk Mitigation:**
  1. Add `Cache-Control: no-cache, no-store, must-revalidate` for all HTML routes in `next.config.mjs`.
  2. Implement an automated `/api/stamp` endpoint and a client-side polling detector in `ThreeViewer.tsx` that notifies the user if their client bundle SHA mismatches the server's running SHA.
  3. Ensure BuildStamp v2 is baked directly into the corner of the canvas viewport so any screenshot definitively proves whether the client has updated.

---

### Question 4: Why Do Episode Resets Occur Every 12 to 18 Seconds?
- **Empirical Measurement & Root Cause:**  
  In [`lib/telemetry/local_runner.ts:105-199`](file:///d:/project%20all/nvidia/lib/telemetry/local_runner.ts#L105-L199):
  1. The robot spawns at $(0, 0)$ and the goal is hardcoded at $(14.0, 0, -10.0)$.
  2. The Euclidean distance between spawn and goal is:
     $$\text{dist} = \sqrt{14^2 + 10^2} = \sqrt{296} \approx 17.20\text{ meters}$$
  3. Under the pure pursuit path tracker implemented in Pass 2, the quadruped walks straight toward the goal at a forward velocity of $\approx 1.10\text{ m/s}$.
  4. The required travel time to reach the goal is:
     $$t = \frac{17.20\text{ m}}{1.10\text{ m/s}} \approx \mathbf{15.6\text{ seconds}}$$
  5. At line 194 of `local_runner.ts`:
     ```typescript
     } else if (goalDist < 1.0) {
       status = 'goal_reached';
       episodeEvent = 'success';
       this.needsResetNextStep = true;
       this.resetReason = 'success';
     }
     ```
     When the robot arrives within $1.0\text{ m}$ of the goal, it triggers a successful goal completion and sets `needsResetNextStep = true`.
  6. The runner resets to spawn and increments `currentEpisode++`.
  7. At $t=32\text{s}$, the robot completes Episode 2 and resets to begin Episode 3.
  8. **The Defect:** Although the robot was successfully completing its navigation goal, **zero log lines were emitted to the Console**, the playback scrubber rendered a continuous timeline without boundary ticks, and zero Run Summary cards were displayed. To the user, this appeared as an unexplained recurring crash/reset!
- **Conclusion:** The reset is functionally correct (`goal_reached` / `success`), but the UI failed to truthfully inform the user. In P3, we will emit typed `EpisodeEvent` records, log clean completion lines to the Console (`"Episode 1 ended: goal reached in 15.2s, 17.2m, reward: 28.4"`), and mark episode boundaries on the scrubber.

---

## 2. Additional Project Risks & Mitigation Strategies

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Shadow Frustum Aliasing** | Expanding directional light to 24m could cause shadow edge shimmering if unaligned. | Snap directional shadow camera to integer shadow texel increments in world space; use soft PCF filtering. |
| **Performance Overhead of Detailed Robot** | Adding sensor head, actuators, and panels could increase draw calls above the 30 call budget. | Merge static geometry into single `BufferGeometry` per material; implement 3 LOD levels (LOD0 $\le 25\text{k}$ tris, LOD1 $\le 6\text{k}$ tris, LOD2 $\le 1.5\text{k}$ tris). |
| **Header Layout Breakage on Mobile / Small Screens** | Adding tooltips and responsive labels could wrap the header. | Strict flex row layout with `min-width: 0`, 32px chip height, and automatic icon-only collapse when viewport width $< 1400\text{px}$. |
| **Contour Line Shimmering** | Screen-space derivatives (`fwidth`) can produce moiré patterns at extreme distances. | Apply a smooth distance fade starting at $22\text{m}$ down to zero at $35\text{m}$, preventing distant contour aliasing while preserving near/mid-ground depth cues. |
| **Goal Drift into Obstacles** | Randomizing goal position could place it inside a crater bowl or boulder. | Goal selector checks terrain slope ($\le 5^\circ$) and rejects coordinates within rock colliders plus $3\text{m}$ margin. |
