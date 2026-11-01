# Robot Model Specification & Parity Rules

1. **Single Source of Truth (`RobotModelSpec v1`):**
   - Link lengths, hip offsets, joint axes, joint limits, body dimensions, and mass are defined once in `RobotModelSpec v1`.
   - Both the controller's IK/FK and the Three.js mesh builder are generated from this specification.

2. **Kinematic FK Parity Gate:**
   - For 1,000 random joint configurations, every foot's world position from the Three.js mesh hierarchy MUST equal the controller's FK within $5\text{ mm}$ (`robot-fk-parity` test).

3. **Machine Visual Details:**
   - Beveled chassis shell with panel seams and cream accent panel.
   - Front stereo camera sensor head (dual dark lens cylinders with sage emissive ring) and sloped nose.
   - Rear lidar-style sensor puck on top rear.
   - Actuator cylinder housings at all 12 joints (hip roll, hip pitch, knee flexion).
   - Tapered sturdy legs with compliant rubber foot pads and ankle shocks.
   - Telemetry-driven LED status strips.
   - Contrast ratio relative to terrain $\ge 2.0:1$.

4. **Performance & Budgets:**
   - LOD0 ($< 8\text{ m}$): $\le 25\text{k}$ triangles, $\le 30$ draw calls.
   - LOD1 ($8$–$20\text{ m}$): $\le 6\text{k}$ triangles.
   - LOD2 ($> 20\text{ m}$): $\le 1.5\text{k}$ triangles.
