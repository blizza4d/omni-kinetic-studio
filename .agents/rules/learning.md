# Learning Loop Rules — DAgger, Residual Policies & Training

- **Small, Honest Method:** Learning uses behavior cloning with a residual MLP adding bounded corrections to the command layer: $\mathbf{a} = \mathbf{a}_{\text{base}} + \Delta \mathbf{a}_{\text{MLP}}(\mathbf{s})$.
- **Compact Observation Vector:** Input features include a 7x7 relative terrain height patch ahead of the robot, velocity, roll/pitch, heading error to goal, and arena margin distance.
- **Strict Bounded Corrections:** The residual MLP output is clamped by hard safety bounds: feet offsets $\le \pm 0.04\text{m}$, roll offset $\le \pm 15^\circ$, speed offset $\le \pm 0.3\text{m/s}$. A malformed or unlearned model can never violate kinematics.
- **Local Worker Training:** Training runs client-side in `/workers/learning/trainer.worker.ts` with Adam optimizer, early stopping on an episode-level validation split, completing in $< 60\text{ seconds}$ for up to 10 demonstrations.
- **Lineage Integrity:** Lineage transitions (Policy v1 $\rightarrow$ v2 $\rightarrow$ v3) track source demonstration IDs and weights hashes in `PolicyCheckpoint v1`.
