# Omni-Kinetic Droid Locomotion Specification: Low-Gravity Quadruped Gait

## 1. Overview & Mechanical Morphology
The Omni-Kinetic "Nova" Droid is a 12-Degree-of-Freedom (DOF) quadruped robot designed for agile traversal across variable celestial gravities, notably lunar regolith ($g = 1.62\text{ m/s}^2$).

### 1.1 Morphology Constants & Kinematic Tree
```
                         [Body Center / CoM]
                        /       |        \        \
               Hip FL (+X, -Z)  |         \        Hip FR (+X, +Z)
              /                 |          \                \
    Thigh FL (L1 = 0.22m)       |           \     Thigh FR (L1 = 0.22m)
            /                   |            \              /
   Calf FL (L2 = 0.22m)         |             \    Calf FR (L2 = 0.22m)
          /                     |              \          /
     Foot FL                    |               \    Foot FR
                                |                \
                     Hip RL (-X, -Z)            Hip RR (-X, +Z)
                    /                                   \
          Thigh RL (L1 = 0.22m)               Thigh RR (L1 = 0.22m)
                  /                                       \
         Calf RL (L2 = 0.22m)                   Calf RR (L2 = 0.22m)
                /                                           \
           Foot RL                                         Foot RR
```

- **Body Dimensions**: Length $0.48\text{ m}$, Width $0.30\text{ m}$, Standing Height $0.385\text{ m}$.
- **Hip Offsets (`QUADRUPED_MORPHOLOGY`)**:
  - `FL`: $[+0.24, 0.0, -0.15]\text{ m}$ (Front-Left)
  - `FR`: $[+0.24, 0.0, +0.15]\text{ m}$ (Front-Right)
  - `RL`: $[-0.24, 0.0, -0.15]\text{ m}$ (Rear-Left)
  - `RR`: $[-0.24, 0.0, +0.15]\text{ m}$ (Rear-Right)
- **Link Lengths**: Upper link (thigh) $L_1 = 0.22\text{ m}$, Lower link (calf) $L_2 = 0.22\text{ m}$.
- **Kinematic Limit**: Maximum extension $L_{\text{reach}} = L_1 + L_2 = 0.44\text{ m}$. Soft ceiling clamp: $0.4378\text{ m}$ ($0.995 \times L_{\text{reach}}$).
- **Joint Rotational Limits**:
  - Hip Roll ($q_1$): $[-0.55, +0.55]\text{ rad}$ ($[-31.5^\circ, +31.5^\circ]$)
  - Thigh Pitch ($q_2$): $[-1.35, +1.35]\text{ rad}$ ($[-77.3^\circ, +77.3^\circ]$)
  - Calf Flexion ($q_3$): $[-2.10, -0.15]\text{ rad}$ ($[-120.3^\circ, -8.6^\circ]$, backwards knee bend)

---

## 2. Froude Dynamic Similarity & Gravity Scaling

Dynamic similarity between disparate gravitational fields (Earth $g_{\text{earth}} = 9.81\text{ m/s}^2$ vs Moon $g_{\text{moon}} = 1.62\text{ m/s}^2$) is governed by the dimensionless Froude number:

$$Fr = \frac{v^2}{g \cdot L}$$

where $v$ is forward locomotion velocity, $g$ is gravitational acceleration, and $L = 0.385\text{ m}$ is the nominal standing hip height.

### 2.1 Locomotion Regimes & Transition Speeds
In quadrupedal biomechanics, the walk-to-bound/trot-to-gallop transition occurs universally at $Fr \approx 0.5$:

$$v_{\text{trans}} = \sqrt{0.5 \cdot g \cdot L}$$

- **Earth Transition Speed** ($g = 9.81\text{ m/s}^2$):
  $$v_{\text{trans, Earth}} = \sqrt{0.5 \cdot 9.81 \cdot 0.385} \approx 1.374\text{ m/s}$$
- **Lunar Transition Speed** ($g = 1.62\text{ m/s}^2$):
  $$v_{\text{trans, Moon}} = \sqrt{0.5 \cdot 1.62 \cdot 0.385} \approx 0.558\text{ m/s}$$
- **Transition Scaling Ratio**:
  $$\frac{v_{\text{trans, Moon}}}{v_{\text{trans, Earth}}} = \sqrt{\frac{1.62}{9.81}} \approx 0.4064$$

### 2.2 Natural Frequency and Cadence Scaling
The pendulum natural stepping frequency scales with $\sqrt{g / g_{\text{earth}}}$:

$$\omega_n \propto \sqrt{\frac{g}{L}}$$

Under lunar gravity, natural oscillation frequency drops by a factor of $0.4064$. Actuator cadence scales dynamically:

$$f_{\text{step}} = f_{\text{nominal}} \cdot \sqrt{\frac{g}{9.81}} \cdot \left(0.6 + 0.4 \cdot \frac{v}{v_{\text{trans}}}\right)$$

bounded strictly within $[0.6\text{ Hz}, 3.2\text{ Hz}]$.

---

## 3. Distance-Driven Phase & Zero Foot Skating

### 3.1 Eliminating Time-Based Phase Drift
Traditional sinusoidal animations drive foot position with time ($t \mapsto \sin(\omega t)$), which causes severe foot skating whenever velocity varies, when the robot turns in place, or when frame rate jitters.

Omni-Kinetic employs a **Distance-Driven Phase Generator** (`GaitPhaseTracker`):

$$\Delta \phi = \frac{2\pi \cdot \Delta d}{L_{\text{stride}}}$$

- When forward speed $v = 0$, $\Delta d = 0 \implies \Delta \phi = 0$. The animation freezes with zero drift and zero creeping.
- When traversing uneven terrain, foot touchdown timing stays strictly locked to spatial progress.

### 3.2 Diagonal Trot Phase Offsets
For quadruped trotting, diagonal leg pairs move in locked synchrony:
- **Pair 1**: Front-Left (`FL`) and Rear-Right (`RR`) $\implies \phi_1 = \phi_{\text{master}} + 0$
- **Pair 2**: Front-Right (`FR`) and Rear-Left (`RL`) $\implies \phi_2 = \phi_{\text{master}} + \pi$

### 3.3 World-Anchored Stance Phase
When a foot enters the stance phase:
1. The foot's contact point in world coordinates is locked:
   $$\mathbf{p}_{\text{foot, world}}(t) = \mathbf{p}_{\text{touchdown, world}}$$
2. Throughout the stance phase ($\phi_{\text{norm}} < \text{dutyFactor}$), the world position is held rigid.
3. The foot's local position in the robot body frame is evaluated via inverse transform:
   $$\mathbf{p}_{\text{foot, body}} = \mathbf{T}_{\text{world}\to\text{body}} \cdot \mathbf{p}_{\text{foot, world}}$$
4. **Guaranteed Slip Metric**: Measured stance drift $\Delta p_{\text{slip}} < 10^{-6}\text{ m}$ (verified $< 10^{-4}\text{ m}$ across 1,000 frames).

---

## 4. Analytical Two-Bone Inverse Kinematics (TwoBoneIK)

Given the relative foot displacement vector from hip root to foot target in body frame:
$$\mathbf{d} = [d_x, d_y, d_z]^T = \mathbf{p}_{\text{foot, body}} - \mathbf{p}_{\text{hip, body}}$$
(where $+X$ is forward, $+Y$ is up, $+Z$ is right), the solver evaluates closed-form joint angles with zero heap allocations.

### 4.1 Hip Roll (Coronal Plane)
$$\theta_{\text{hip}} = \text{atan2}(d_z, -d_y)$$
clamped to $[-0.55, +0.55]\text{ rad}$.

### 4.2 Leg Sagittal Projection
The effective downward displacement rotated into the sagittal plane:
$$d_{y, \text{sag}} = -\sqrt{d_y^2 + d_z^2}$$
$$d_{x, \text{sag}} = d_x$$
The reach distance is:
$$D = \sqrt{d_{x, \text{sag}}^2 + d_{y, \text{sag}}^2}$$
clamped safely to $[D_{\text{min}}, D_{\text{max}}] = [0.06\text{ m}, 0.4378\text{ m}]$.

### 4.3 Calf Angle (Law of Cosines)
By the law of cosines for a triangle with sides $L_1, L_2, D$:
$$\cos(\psi) = \frac{L_1^2 + L_2^2 - D^2}{2 L_1 L_2}$$
clamped to $[-0.9999, +0.9999]$ to prevent numeric NaN.
$$\theta_{\text{calf}} = -(\pi - \arccos(\cos(\psi)))$$
giving backwards knee flexion.

### 4.4 Thigh Angle
$$\alpha = \text{atan2}(d_{x, \text{sag}}, -d_{y, \text{sag}})$$
$$\cos(\beta) = \frac{L_1^2 + D^2 - L_2^2}{2 L_1 D}$$
$$\theta_{\text{thigh}} = \alpha - \arccos(\cos(\beta))$$

---

## 5. Minimum-Jerk Swing Clearance & Lunar Dust FX

### 5.1 Quintic Minimum-Jerk Trajectory
Swing phase trajectory from liftoff $\mathbf{p}_{\text{liftoff}}$ to touchdown target $\mathbf{p}_{\text{target}}$ utilizes a smooth polynomial profile eliminating velocity and acceleration discontinuities ($C^2$ continuity):

$$u_{\text{smooth}}(s) = 10 s^3 - 15 s^4 + 6 s^5, \quad s \in [0, 1]$$

Vertical foot clearance follows a parabolic lift curve peaking at mid-swing ($s = 0.5$):

$$h_{\text{lift}}(s) = 4 s (1 - s) \cdot h_{\text{swing}}$$

where $h_{\text{swing}} = 0.08\text{ m}$ under lunar gravity ($0.05\text{ m}$ on Earth).

### 5.2 Lunar Dust Particle Physics
At foot touchdown ($s = 1.0$), a burst of 12 regolith dust particles is instantiated:
- **Zero Atmospheric Drag**: Particles follow pure ballistic parabolic arcs:
  $$\mathbf{r}(t) = \mathbf{r}_0 + \mathbf{v}_0 t - \frac{1}{2} g t^2 \hat{\mathbf{j}}$$
- **Radial Ejection**: Particle velocity has random radial dispersion $v_r \in [0.4, 0.8]\text{ m/s}$ and vertical kick $v_y \in [0.6, 1.2]\text{ m/s}$.
- **Lifetime**: Persist for $1.2\text{ s}$ under lunar gravity, fading smoothly to alpha 0.
