# Defect Process & Verification Rules

1. **Defect-First, Proof-First Rule:**
   - Every bug must be isolated and assigned an ID (`W1`–`W18`, `R1`–`R12`, `G1`–`G6`, `T1`–`T12`, `D1`–`D10`, `H1`–`H8`, `L1`–`L7`, `C1`–`C6`, `Q1`–`Q6`, `U1`–`U8`, `A1`–`A8`, `NEW-*`).
   - A defect is considered fixed ONLY when:
     1. A deterministic test exists that fails on `bugfix-baseline`.
     2. The test passes on the fix commit.
     3. Before/after screenshots at the same seed, camera view, and time are attached.
     4. A one-sentence plain-English "what you will now see" explanation is written.

2. **Never Hide a Bug by Disabling a Feature:**
   - Disabling shadows, rocks, contours, the rim glow, or beacons to pass an audit is strictly forbidden.
   - Any commit that sets `visible = false`, `castShadow = false`, or clamps opacity to zero without explicit architectural review will be rejected.

3. **Defect Card Artifact:**
   - Every fix produces a versioned `DefectCard v1` documenting ID, severity, repro seed/camera/time, root cause, fix, test name, before/after metrics, before/after crops, and checklist verdict.
