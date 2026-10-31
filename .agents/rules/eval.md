# Evaluation Rules — Held-Out Seeds & Honesty Engine

- **Held-Out Seed Invariant:** Evaluation runs on 20 deterministic held-out seeds that NEVER appear in training or demonstration sets.
- **Statistical Significance (95% Bootstrap CI):** Every metric (success rate, goal progress, collisions, stall time, reward) reports mean and 95% bootstrap confidence intervals.
- **Honest Verdict Rules:**
  - `improved`: The 95% paired confidence interval on the primary metric (success rate) strictly excludes zero on the positive side.
  - `no significant change`: The confidence interval encompasses zero.
  - `worse`: The confidence interval strictly excludes zero on the negative side.
- **Zero Inflated Claims:** The UI must NEVER claim improvement unless statistically supported. An unflattering result ("No significant change") must be displayed transparently with a prompt to collect further demonstrations.
- **Ghost Visualization:** The viewer renders Policy v1 as a translucent cream ghost alongside solid sage Policy v2 stepping on the identical seed in lockstep.
