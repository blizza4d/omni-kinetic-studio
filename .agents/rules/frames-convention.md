# Frames Convention Rules

1. **Single Authoritative Module:**
   - All frame, axis, and orientation transforms MUST live in `/lib/frames`.
   - Ad-hoc conversions in viewer, controller, telemetry, or radar are banned.

2. **Axis Standards:**
   - **World Frame:** Right-handed, Y-up, units in meters (Three.js standard).
   - **Robot Body Frame:** +X forward, +Y up, +Z right. Left limbs have negative Z coordinate.
   - **Yaw Definition:** Yaw $\theta$ is rotation about +Y. It maps forward $(1, 0, 0)$ to $(\cos\theta, 0, -\sin\theta)$.
   - `headingFromVector(v) = Math.atan2(-v.z, v.x)`.
   - **Euler Composition Order:** Yaw, then Pitch, then Roll in the body-local frame.

3. **Parity Tests:**
   - Round-trip test for 1,000 random orientations within $10^{-6}$.
   - Forward-vector identity for 100 yaw angles.
   - Chirality test: from behind, left feet project to left of right feet.
   - Mesh forward axis MUST equal controller forward axis.
