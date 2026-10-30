---
name: run-perf-profile
description: Standard operational procedure for profiling 60 FPS rendering performance, memory heap stability, and draw call counts under 2,000 debris instances.
---

# Run Performance Profile Skill

This skill documents how to profile graphics performance and memory hygiene in Omni-Kinetic.

## Step-by-Step Procedure
1. **Launch Automated Performance Script:**
   Execute `npx tsx scripts/profile_performance.ts`.
2. **Collect Metrics Over 60–300 Seconds:**
   - Sample frame duration (target: <= 16.6 ms).
   - Sample GPU draw calls via Three.js `renderer.info.render.calls`.
   - Sample memory heap via `performance.memory.usedJSHeapSize`.
3. **Verify Compliance:**
   - Sustained p95 FPS >= 55 FPS.
   - Zero unbounded memory growth (< 10% heap expansion over 5 minutes).
   - Verify proper geometry and material disposal on scene transitions.
