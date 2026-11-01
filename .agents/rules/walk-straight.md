# Walk Straight & Locomotion Rules

1. **Non-Holonomic Heading Control:**
   - In autonomous mode, commanded velocity is strictly along body forward (+X).
   - Lateral commanded velocity is zero unless explicitly teleoperated.
   - Slip angle P95 must stay $\le 2.0^\circ$ on flat ground (L0/L1) and $\le 4.0^\circ$ on real terrain (L2).

2. **Heading & Path Tracking:**
   - Heading PD controller operates on heading error to path tangent at lookahead point.
   - Speed-dependent lookahead between $0.8\text{ m}$ and $1.4\text{ m}$.
   - Continuous yaw unwrapping to prevent $\pm\pi$ jumps.
   - Yaw rate limit $\ge 90^\circ/\text{s}$ with smooth acceleration limit.

3. **Gait Symmetry & Footholds:**
   - Left and right limbs mirrored by explicit `side` sign.
   - Stance widths equal within $5\text{ mm}$; stride lengths equal within 1%.
   - Diagonal trot phase offset exactly 0.5.
   - Stance feet pinned during stance; stance slip $< 2\text{ cm}$.

4. **Terrain Orientation Reaction:**
   - Least-squares stance plane fit filtered with gain 0.6 and low-pass response ($0.2\text{ s}$).
   - Pitch and roll clamped to $\pm 20^\circ$. Roll/pitch RMS $< 1^\circ$ on flat ground.
