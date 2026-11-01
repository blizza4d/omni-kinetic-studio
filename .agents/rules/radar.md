# Radar Widget Rules

1. **Coordinate Synchronicity:**
   - The radar MUST transform terrain hillshade, debris dots, path, and goal relative to the robot's real-time position:
     `dx = cx + (worldX - robotPos.x) * scale`
     `dy = cy + (worldZ - robotPos.z) * scale`
   - Eliminates coordinate desync as the robot walks.

2. **Heading & Rotation:**
   - The robot arrow is positioned at the radar center `(cx, cy)` and MUST rotate with the robot's real heading:
     `ctx.rotate(robotHeading)`

3. **Clutter Elimination:**
   - Pebbles under $0.12\text{ m}$ are omitted by default (dot count $< 500$).
   - Obstacle dots are sized proportionally to boulder scale.
   - Visible hillshade with clearly readable relief.

4. **Legends & Path:**
   - Planned path drawn as thin dashed cream line.
   - Footprint trail drawn as fading sage line.
   - $10\text{ m}$ scale bar and +X / North coordinate legend.
   - Positions match the 3D viewport within $0.5\text{ m}$.
