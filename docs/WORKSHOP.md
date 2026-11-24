# Droid Workshop & Morphology Specification (Pack C — F-003)

## 1. Overview
The Droid Workshop allows operators to inspect and configure alternative robot morphologies while maintaining strict kinematic compatibility with the base locomotion engine and preserving the byte-identical golden trace baseline on the Scout preset.

---

## 2. Morphology Presets
Omni-Kinetic defines four canonical morphology archetypes:

| Preset | Chassis Mass | Leg Count | Thigh / Shin | Payload Offset | Froude Walk Speed (Moon) | Description |
|---|---|---|---|---|---|---|
| **Scout** | 18.0 kg | 4 | 0.24m / 0.26m | 0.00 m | 0.64 m/s | Agile lunar surveyor; identical to golden baseline |
| **Hauler** | 26.0 kg | 4 | 0.26m / 0.28m | -0.05 m | 0.66 m/s | Reinforced chassis for heavy equipment transport |
| **Strider** | 16.0 kg | 4 | 0.32m / 0.36m | 0.00 m | 0.74 m/s | Long-legged stride morphology for crater rock clearance |
| **Hexapod** | 24.0 kg | 6 | 0.22m / 0.24m | 0.00 m | 0.61 m/s | 6-legged tripod gait stability for loose regolith slopes |

---

## 3. Physical Center of Mass (CoM) Calculation
When payload equipment is attached to the chassis, the longitudinal Center of Mass shifts according to:

$$\Delta z_{\text{CoM}} = \frac{m_{\text{payload}} \cdot z_{\text{payload}}}{m_{\text{chassis}} + m_{\text{payload}}}$$

- On the **Hauler** preset with a $+15.0\text{ kg}$ rearward payload ($z = -0.05\text{ m}$), the CoM shifts rearward by $-0.018\text{ m}$.
- The pitch compensation controller dynamically biases stance offset to maintain level body trim.

---

## 4. Froude Number & Gait Transitions
In low lunar gravity ($g = 1.62\text{ m/s}^2$), dynamic similitude governs walk-to-run transitions via the dimensionless Froude number:

$$\text{Fr} = \frac{v^2}{g \cdot l_{\text{leg}}}$$

At the critical boundary $\text{Fr} \approx 0.5$:

$$v_{\text{transition}} = \sqrt{0.5 \cdot g \cdot (l_{\text{thigh}} + l_{\text{shin}})}$$

Under Moon gravity, the Scout transitions to bound at $v \approx 0.64\text{ m/s}$, whereas under Earth gravity ($9.81\text{ m/s}^2$), the transition occurs at $v \approx 1.57\text{ m/s}$.
