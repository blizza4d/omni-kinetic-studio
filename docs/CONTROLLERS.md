# Controller Playground Specification (Pack A — F-001)

## 1. Overview
The Controller Playground provides a sandboxed execution runtime allowing users to author, compile, and execute autonomous locomotion controllers directly in the browser. 

Controllers receive an authoritative `Observation` snapshot of the droid and arena state each step and produce a validated `LocomotionCommand`.

---

## 2. Observation Contract
Controllers do not have access to mutable Three.js scene graphs, physics engines, or DOM APIs. They receive an immutable snapshot:

```typescript
export interface Observation {
  t: number;                                      // Simulation time in seconds
  dt: number;                                     // Control step period (default 1/60s)
  pose: {
    x: number;
    z: number;
    heading: number;
    pitch: number;
    roll: number;
  };
  vel: {
    forward: number;
    lateral: number;
    yawRate: number;
  };
  gravity: number;                                // Physical gravity in m/s^2 (e.g. 1.62)
  battery?: number;                               // Battery charge level (0.0 .. 1.0)
  contacts: [boolean, boolean, boolean, boolean]; // Foot ground contacts [FL, FR, RL, RR]
  goal?: {
    x: number;
    z: number;
    distance: number;
    bearing: number;                              // Relative angle in radians (-PI .. PI)
  };
  edgeDistance: number;                           // Distance in meters to arena boundary
  rays?: number[];                                // Rangefinder / LiDAR distances (meters)
}
```

---

## 3. Sandboxing & AST Security Rules
User code is analyzed before execution:
1. **Forbidden Identifier Rejection:** Any identifier matching `window`, `document`, `fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`, `localStorage`, `eval`, `Function`, `process`, or `import` causes immediate compilation rejection.
2. **Watchdog Budget:** Each step is budgeted at **2.0 ms** execution time. If execution exceeds the budget or enters an infinite loop, the watchdog trips and fails safe to neutral zero commands.
3. **Execution Isolation:** Runs inside a scoped execution closure with a deterministic, seeded pseudo-random generator bound to `Math.random`.

---

## 4. Built-In Controller Templates
- **Go-To-Goal:** Proportional pursuit steering toward active waypoint goals with terminal deceleration.
- **Edge Avoidance:** Boundary-monitoring controller that turns and reverses when approaching arena catch lines.
- **Boulder Avoidance:** Rangefinder-driven obstacle clearance maintaining $\ge 0.5\text{ m}$ safety margins.
- **Smooth Stop:** Smooth S-curve deceleration with exponential braking and stance lowering.
- **Speed-Adaptive Gait:** Automatically transitions gears between trot and bound as speed increases.
