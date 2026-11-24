# Policy Lab & In-Browser CEM Optimizer (Pack B — F-002)

## 1. Overview
Policy Lab allows interactive parameter tuning and automated policy optimization of the droid's quadruped locomotion gait entirely in-browser using the **Cross-Entropy Method (CEM)**.

---

## 2. Parameterized Policy Family
The policy operates on 6 continuous physical gains and kinematic thresholds:

| Parameter | Range | Default | Unit | Description |
|---|---|---|---|---|
| `goalGain` | 0.2 .. 4.0 | 1.25 | scalar | Proportional heading attraction to active goal |
| `edgeAvoidGain` | 0.2 .. 5.0 | 2.00 | scalar | Repulsion gain away from arena boundary catch lines |
| `maxSpeed` | 0.4 .. 2.4 | 1.45 | m/s | Commanded forward velocity target |
| `turnRate` | 0.4 .. 3.0 | 1.80 | rad/s | Angular yaw rate capability |
| `obstacleAvoidWeight` | 0.1 .. 4.0 | 1.50 | scalar | Repulsion steering weighting against rangefinder obstacles |
| `gaitThreshold` | 0.6 .. 2.0 | 1.35 | m/s | Velocity threshold transitioning between trot and bound |

---

## 3. Cross-Entropy Method (CEM) Algorithm
The in-browser optimizer converges without neural network backpropagation or external GPU servers:
1. **Sample Distribution:** Samples a population of $N$ parameter vectors $\theta_i \sim \mathcal{N}(\mu, \Sigma)$ using a deterministic Box-Muller Gaussian sampler seeded with `mulberry32`.
2. **Deterministic Evaluation:** Simulates $N$ parallel or serialized rollout evaluations across multiple terrain seeds.
3. **Elite Selection:** Ranks rollouts by score and selects the top elite fraction (default $30\%$, top $K = \lceil 0.3 N \rceil$).
4. **Distribution Update:** Computes new mean $\mu_{t+1}$ and diagonal variance $\sigma_{t+1}^2$ from the elite set with a noise floor (`minStd = 0.05`) to prevent premature collapse.
5. **Convergence:** Produces a generation-by-generation learning curve and outputs the optimal vector.
