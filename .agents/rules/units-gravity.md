# Physical Units & Gravity Rules

1. **Units Mandate:**
   - Every physical quantity in the UI, telemetry frames, contracts, logs, and docs MUST declare its physical unit explicitly:
     - Gravity: $\text{m/s}^2$ and $\text{g}$
     - Speed / Velocity: $\text{m/s}$
     - Distance / Position: $\text{m}$
     - Angles / Orientation: $\text{deg}$ or $\text{rad}$
     - Time / Duration: $\text{s}$ or $\text{ms}$

2. **Gravity Representation:**
   - Internally represented as `{ value: number, unit: "m/s2", source: string, displayName: string }`.
   - Vertical downward gravity: Earth $9.81\text{ m/s}^2$, Mars $3.71\text{ m/s}^2$, Moon $1.62\text{ m/s}^2$.
   - Display format: `"1.62 m/s² (0.165 g, Moon)"`.
   - Never print raw floating point or rounded "0 m/s²".

3. **Compiler Clamping & Safety:**
   - Requested gravity $\le 0$ or NaN results in a visible `SpecCompileReport` adjustment clamped to minimum $0.1\text{ m/s}^2$. Zero gravity never reaches the simulator.
   - The displayed gravity, compiler spec, runner kinematics, gait dynamics, and debris physics MUST consume the identical scalar value.
