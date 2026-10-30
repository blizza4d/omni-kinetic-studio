# World Bounds Invariants & Safety Nets (@world-bounds.md)

## 1. Physical Arena Parameters
- `shape`: Cylinder or Rectangle (default rectangle centered at origin `(0, 0)`).
- `halfExtent`: Default 18.0 m along X and Z.
- `softMargin`: 2.0 m inside the boundary (`dist > 16.0m` triggers soft warning).
- `hardMargin`: 20.0 m absolute boundary (`dist > 20.0m` triggers hard clamp and termination).
- `floorCatchPlane`: Horizontal static catch plane at `y = -5.0m`.

## 2. Defense-in-Depth Protocol
1. **Simulation Level:** The runner / simulator calculates boundary penalties in reward shaping (`boundary_penalty = max(0, dist - 16.0) * -2.5`). Soft steering assist redirects policy inward when autonomous.
2. **Ingestion & Validation Level:** Telemetry frames arriving at the client or runner boundary are validated via `TelemetryFrameSchema`. Any coordinates with `|x| > 22` or `|z| > 22` or `NaN` or unnormalized quaternions are flagged `valid: false` and sanitized.
3. **Viewer Clamping Level:** The 3D robot transform clamp prevents visual representation from ever leaving `arena + 3.0m`. The camera target is clamped strictly to `halfExtent + 1.0m` to prevent looking into void.
4. **Visual Boundary Rim:** A visible cream dashed perimeter line rendered on the terrain. When the robot enters the 2m soft margin, the rim glows brick red with a 1.2s pulse.
5. **Episode Termination & Reset:** When the robot crosses the hard margin (`dist > 20.0m`) or contacts the floor catch plane, the episode terminates with status `out_of_bounds` or `fell_through_world`. A reset toast displays in the UI, and the next episode respawns cleanly at `(0, 0)`.

## 3. Clear Zones & Reachability
- Spawn zone `(0, 0)` is strictly cleared of all debris boulders within a 2.5m radius.
- Goal zone `(14, -10)` is strictly cleared of all debris boulders within a 2.5m radius.
- A navigable corridor is guaranteed between spawn and goal using deterministic Dijkstra / A* reachability check (`checkNavigablePath(debris, spawn, goal, minCorridorWidth: 1.2m)`).
