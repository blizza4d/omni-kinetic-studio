# Sim-to-Real Toolkit Specification (Pack D — F-004)

## 1. Overview
The Sim-to-Real Toolkit equips Omni-Kinetic with physics domain randomization, hardware imperfection injection, and rigorous statistical verification using Wilson Score confidence intervals to evaluate whether learned locomotion policies will transfer reliably onto real physical droids.

---

## 2. Domain Randomization Parameters
During simulation rollouts, physical properties are randomized within bounded intervals:

| Parameter | Nominal Range | Default Range | Unit | Physical Manifestation |
|---|---|---|---|---|
| Regolith Friction ($\mu$) | 0.30 .. 1.20 | 0.60 .. 1.05 | dimensionless | Loose lunar regolith vs solid basalt |
| Total Mass Scale ($m/m_0$) | 0.85 .. 1.25 | 0.90 .. 1.15 | ratio | Payload variations and regolith dust accumulation |
| Motor Latency ($\tau$) | 0 .. 60 | 10 .. 40 | ms | CAN bus communication and actuator phase lag |
| Rangefinder Noise ($\sigma_r$) | 0.00 .. 0.15 | 0.01 .. 0.06 | m | LiDAR beam scattering and dust refraction |
| Heading Gyro Noise ($\sigma_\theta$) | 0.00 .. 0.05 | 0.005 .. 0.03 | rad | IMU drift and vibration bias |
| Local Gravity Jitter ($\Delta g$) | -0.08 .. +0.08 | -0.04 .. +0.04 | m/s^2 | Lunar crustal mass concentration (mascon) anomalies |

---

## 3. Wilson Score Confidence Interval
Rather than relying on noisy point-estimate success rates, the evaluator computes the two-sided **Wilson Score 95% Confidence Interval**:

$$p_{\text{low}}, p_{\text{high}} = \frac{\hat{p} + \frac{z^2}{2n} \pm z \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}$$

where $\hat{p} = \frac{k}{n}$, $n$ is the total number of evaluation episodes, and $z = 1.96$ for a $95\%$ confidence interval.

A policy is certified **Sim-to-Real Robust** only if:
$$p_{\text{low}} \ge 0.70 \quad (70\%\text{ lower confidence bound})$$
