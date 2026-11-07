# CAMERA RIG & FRAMING RULES
**Contract:** `FramingInfo v1` (`/contracts`)

1. **Roll Lock (Level Horizon):**
   - `camera.up.set(0, 1, 0)` is strictly locked every frame. Zero camera roll under any trajectory or teleop state.

2. **Default Chase Geometry:**
   - Vertical FOV: $50^\circ$.
   - Pitch: $\approx 14^\circ$ down (adjusted dynamically to enforce framing metrics).
   - Distance: $\approx 5.5\text{m}$ behind, $\approx 1.6\text{m}$ elevation above the robot, looking at a point $1.0\text{m}$ ahead along path tangent.
   - Critically damped spring follow (time constant $0.25\text{s}$), $0.4\text{s}$ velocity lookahead, minimum terrain clearance $+0.4\text{m}$.

3. **Mandatory Framing Metrics (`getFramingInfo()`):**
   - **Horizon Position:** Strictly between $20\%$ and $28\%$ from the top of the viewport.
   - **Robot Center Position:** Strictly between $55\%$ and $70\%$ from the top of the viewport.
   - **Robot Screen Height:** Strictly between $16\%$ and $22\%$ of total viewport height.
   - If measured numbers deviate, pitch and distance must be calibrated to satisfy these percentages.
