# Reward Sandbox & Verification Rules

## 1. ISOLATED EXECUTION
Generated `reward.py` scripts execute in an isolated environment:
- Zero network socket access.
- Zero filesystem access outside a temporary scratch directory.
- Per-call execution timeout: $\le 5\text{ ms}$.
- Imports restricted strictly to allowlisted libraries (`numpy`, `math`).

## 2. FIXTURE TRAJECTORY VALIDATION
Prior to approval, the reward function must evaluate three standard test trajectories:
1. **Stalled Robot**: Stationary pose over 100 steps.
2. **Goal-Reaching Robot**: Steady forward progress along corridor.
3. **Boundary-Hugging Robot**: Skirting the soft perimeter.

## 3. COMPONENT INVARIANTS
- Returned rewards must be finite numbers (zero `NaN` / `Infinity`).
- Named component dictionary keys must match the contract (`forward`, `upright`, `collision_penalty`, `boundary_penalty`, `energy`).
- The sum of components must match the scalar reward within $\pm 10^{-6}$.
