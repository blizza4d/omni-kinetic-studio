---
name: bounds-fuzz-test
description: Automated fuzz testing procedure for verifying simulation bounds, obstacle clearance, and catch-plane integrity across 1,000 randomized seeds.
---

# Bounds Fuzz Test Skill

## Purpose
Rigorously test the robot locomotion runner, physics engine, and telemetry ingest across randomized environment seeds to prove that the robot never escapes the arena, never falls through the ground, never generates NaN transforms, and always terminates with an explicit event.

## Parameters
- Seeds: 1,000 distinct seeds (e.g. seeds 1 to 1000).
- Policies evaluated:
  1. Straight forward locomotion (`vel_x > 0`).
  2. Aggressive zigzag / lateral turning (`omega_z = 2.5 rad/s`).
  3. Random Brownian noise perturbations.
- Duration per episode: 120 seconds (7,200 steps at 60 Hz).

## Assertions
1. `nanCount === 0`: Zero NaN, Infinity, or unnormalized quaternion transforms emitted.
2. `escapeCount === 0`: Zero instances where the robot chassis position exceeds `hardMargin` (20.0 m) for > 1 reset cycle.
3. `fallThroughCount === 0`: Zero un-caught fall-throughs below `y = -5.0m`.
4. `reachabilityPassRate === 100%`: Navigable corridor check between spawn and goal passes for all seeds.
5. `cleanResets`: Every boundary exit or catch-plane contact triggers an explicit status (`out_of_bounds` or `fell_through_world`).
