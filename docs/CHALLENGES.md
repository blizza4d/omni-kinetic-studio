# Daily Challenge, Achievements & Progression (Pack I — F-009)

## 1. Overview
The Daily Challenge and Progression system introduces deterministic daily procedural missions, data-driven achievement unlocks, and player XP leveling to drive exploration and mastery across the studio's features.

---

## 2. Deterministic Daily Challenge
Every day at `00:00:00 UTC`, a deterministic pseudo-random seed is derived using:

$$\text{Seed} = \text{hash32}(Y \cdot 10000 + M \cdot 100 + D)$$

- **Deterministic Across Clients:** Every user anywhere in the world receives the exact same terrain roughness, boulder distribution, target objective, and environmental gravity modifier on any given calendar day.
- **Daily Modifiers:**
  - *Ultra Low Gravity:* $0.88\text{ m/s}^2$ (approaching Ceres / Asteroid surface dynamics).
  - *Lunar Nominal:* $1.62\text{ m/s}^2$ standard crater exploration.
  - *High Surface Gravity:* $3.71\text{ m/s}^2$ (Martian gravity profile).
- **Bonus Reward:** Completing the daily challenge awards $+150\text{ XP}$.

---

## 3. Achievement Registry
The system tracks 8 data-driven achievements evaluated at episode completion:

| ID | Title | Description | XP Reward | Condition |
|---|---|---|---|---|
| `first_steps` | First Steps | Complete your first lunar simulation episode | 50 XP | $t_{\text{elapsed}} \ge 2.0\text{ s}$ |
| `hop_master` | Low-G Leap | Complete a hop maneuver over crater/boulder | 100 XP | Mission `low-g-leaps` succeeded |
| `rock_dodger` | Clean Traversal | Complete an episode with 0 collisions | 150 XP | Succeeded & collisions $= 0$ |
| `marathon` | Lunar Marathon | Traverse $\ge 50\text{ m}$ in a single episode | 200 XP | Distance $\ge 50.0\text{ m}$ |
| `gold_standard` | Gold Standard | Earn a Gold Medal in any official mission | 250 XP | Medal = `gold` |
| `speed_demon` | Speed Demon | Reach and sustain speed $\ge 1.4\text{ m/s}$ | 120 XP | Succeeded & $t \ge 5.0\text{ s}$ |
| `precision_surveyor` | Precision Surveyor | Complete crater rim run with high margin | 180 XP | Mission `crater-rim-run` succeeded |
| `perseverance` | Lunar Pioneer | Attain Level 2+ progression | 300 XP | Total Distance $\ge 40.0\text{ m}$ |

---

## 4. Player XP & Leveling
Level thresholds scale quadratically:

$$\text{Level} = \left\lfloor 1 + \sqrt{\frac{\text{XP}}{100}} \right\rfloor$$

Titles awarded at each rank:
1. **Level 1:** Lunar Trainee ($0\text{–}99\text{ XP}$)
2. **Level 2:** Surveyor ($100\text{–}399\text{ XP}$)
3. **Level 3:** Pioneer ($400\text{–}899\text{ XP}$)
4. **Level 4:** Commander ($900\text{–}1599\text{ XP}$)
5. **Level 5:** Grand Master ($1600+\text{ XP}$)
