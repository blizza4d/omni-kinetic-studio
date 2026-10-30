# Ground Contact & Kinematic IK Invariants

## 1. CONTACT INVARIANTS
- **Zero Foot Penetration**: Zero frames where any foot tip is $> 1\text{ cm}$ below the canonical terrain surface in either the simulation runner or the 3D viewport.
- **Zero Hull Penetration**: Zero frames where the robot chassis bottom hull penetrates the terrain by $> 2\text{ cm}$.
- **Stance & Swing Phasing**: Feet in stance phase are pinned to the surface ($< 2\text{ cm}$ slip); feet in swing phase lift with $0.08\text{m}$ to $0.15\text{m}$ parabolic clearance.

## 2. KINEMATIC RESOLUTION IN AUTHORITATIVE RUNNER
- **Foothold Sampling**: Footholds are selected from the planned path and sampled against the canonical `TerrainField.sampleHeight(x, z)`.
- **Plane Fit Orientation**: Body height is derived from stance foot elevations plus nominal standing height ($0.28\text{m}$). Body pitch and roll are calculated from least-squares plane fitting across the 4 feet, clamped to $\pm 25^\circ$.
- **Analytic 2-Link Leg IK**: Each leg computes hip, thigh, and calf angles via 2-link IK in the body frame. If a foothold is unreachable, the controller lifts the body or shortens the stride rather than allowing ground penetration.
- **Hull Bottom Sampling**: The runner samples at least 8 boundary points on the lower chassis hull. If penetration $> 1\text{ cm}$ occurs, an upward projection is applied and `contactCorrections` counter increments.

## 3. VIEWPORT VERIFICATION & SAFETY NET
- **Authoritative Pose Rendering**: Viewport renders joint transforms directly from the telemetry stream; it NEVER applies an independent fixed height offset.
- **Raycast Safety Net**: The viewer raycasts the hull against the rendered mesh each frame. If penetration $> 1\text{ cm}$ is detected, an upward emergency correction is applied, `viewerContactFix` counter increments, and a throttled UI alert fires.
- **Golden Seed Assertion**: In automated CI tests over golden seeds, `viewerContactFix` must remain exactly 0. The safety net must never silently mask a simulation bug.
