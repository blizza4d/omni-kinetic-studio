---
name: motion-trace
description: Standard operational procedure for tracing simulation pacing, jitter-buffer depth, stale-frame ratio, and interpolation continuity over multi-minute runs.
---

# Motion Trace Operational Procedure

## Purpose
Collects per-rendered-frame motion telemetry (wall timestamp, sim playhead $t$, buffer depth, interpolation $\alpha$, rendered 3D pose, stale frame flag, and discontinuity flag) to produce `motion-report.json`.

## Metrics Tracked
- **Sim-Rate Ratio**: $\text{elapsedSimSec} / \text{elapsedWallSec}$ (target $1.00 \pm 0.02$).
- **Effective Telemetry Hz**: Arrival frequency of state updates (target $\ge 55\text{ Hz}$ p5).
- **Jitter Buffer Depth**: Rolling buffer latency (target $100\text{ ms} \pm 30\text{ ms}$).
- **Stale-Frame Ratio**: Percentage of rendered frames where robot pose is static while commanded speed $> 0.1\text{ m/s}$ (target $< 2\%$).
- **Max Pose Jump**: Maximum displacement between adjacent frames (target $< 0.15\text{ m}$, excluding resets).
- **Net Progress Rate**: Average displacement along planned path (target $\ge 0.35\text{ m/s}$).

## Verification Script
Run `npx tsx scripts/measure_motion_trace.ts` against the running production server at `http://localhost:3000`.
