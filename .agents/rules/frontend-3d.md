# Frontend 3D & Graphics Rules

1. **Rendering Performance:**
   - Imperative Three.js animation loops inside `requestAnimationFrame`.
   - Never trigger React state updates or React re-renders on per-frame telemetry ticks.
   - Target rock-solid 60 FPS on mid-tier hardware.

2. **Procedural Worlds & Instancing:**
   - Generate terrain from `EnvironmentSpec.terrain.seed` deterministically using heightfields.
   - Use `THREE.InstancedMesh` for rocks, boulders, and debris to minimize draw calls and GPU state changes.
   - Orient gravity in accordance with `EnvironmentSpec.gravity`.

3. **Articulated Quadruped Model:**
   - 12-DOF articulated hierarchy (Torso chassis -> 4 legs x 3 revolute joints each).
   - Joint rotations driven directly by incoming `TelemetryFrame.joints`.
   - In Demo / Local mode, integrate with `cannon-es` rigid bodies for local physical fidelity and contact resolution.

4. **Visual Telemetry Feedback:**
   - Collisions: Render contact point markers and trigger brick-red (`#B83B2F`) pulse overlay.
   - Reward: Render sage-green (`#6B705C`) glowing aura around chassis when reward is trending upward.
   - Motion Trail: Draw a decaying ribbon trail following the robot center of mass.
