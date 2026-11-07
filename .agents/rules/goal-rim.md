# GOAL BEACON & ARENA RIM RULES
**Contract:** `GoalState v1` (`/contracts`)

1. **Goal Marker Dimensions:**
   - Ground ring: cream-dim, radius $0.6\text{m}$, thickness $3\text{cm}$, conforming directly to local terrain heightfield elevation.
   - Light column: thin vertical cylinder, height $2.5\text{m}$, radius $0.25\text{m}$, depth-tested, no depth write, normal blending (not additive), fading to zero beyond $40\text{m}$.
   - The projected beacon must never exceed $18\%$ of the viewport height when viewed from $> 15\text{m}$.

2. **Goal Placement Invariants:**
   - Placed $8\text{m}$ to $30\text{m}$ from spawn.
   - Strictly at least $4.0\text{m}$ inside the $18\text{m}$ arena boundary (never on or near the rim).
   - Local terrain slope $\le 5^\circ$; obstacle clearance radius $\ge 3\text{m}$.

3. **Arena Rim Line:**
   - Surface-draped in the terrain shader only (no separate line/mesh geometry).
   - Screen-space width $\approx 1.5\text{px}$ via `fwidth`.
   - Dashed in world space ($0.5\text{m}$ on / $0.5\text{m}$ off), cream-dim at $35\%$ opacity, fading out beyond $30\text{m}$.
   - Gated proximity warning: brick red glow activates strictly when robot is within $2.5\text{m}$ of margin (`uEdgeDistance <= 2.5m`).
