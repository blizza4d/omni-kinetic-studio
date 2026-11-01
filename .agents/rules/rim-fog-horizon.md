# Rim, Fog, Horizon & Goal Rules

1. **Surface-Draped Arena Rim:**
   - Arena boundary drawn strictly in the terrain fragment shader in screen-space width ($1.5\text{ px}$ via `fwidth`).
   - World-space dashed pattern ($0.5\text{ m}$ on, $0.5\text{ m}$ off) at $\le 35\%$ opacity, fading out beyond $30\text{ m}$.
   - Never render a thick solid white line at distance.

2. **Proximity Glow:**
   - Gated strictly by `uEdgeDistance` (uniform from authoritative arena bounds).
   - Brick red glow is computed as `smoothstep(softMargin, 0, uEdgeDistance)`.
   - Intensity is EXACTLY zero whenever the robot is farther than $2.5\text{ m}$ from the arena edge.

3. **Fog & Skirt Invariants:**
   - Fog color equals the clear background color (`0x2a2a2a`).
   - All visible materials that extend to the distance MUST support exponential fog.
   - Zero horizontal stripe stacking near the horizon.

4. **Goal Marker:**
   - Ground ring (cream-dim, $0.6\text{ m}$ radius) and soft light column (opacity $0.25$, height $2.5\text{ m}$, fading with distance).
   - Base raycasted directly onto terrain surface (`sampleHeight`).
   - Placed $8\text{ m}$ to $30\text{ m}$ from spawn, at least $4\text{ m}$ inside arena boundary.
