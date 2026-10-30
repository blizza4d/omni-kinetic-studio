---
name: contact-audit
description: Automated audit procedure for measuring foot tip clearance, chassis hull penetration depth, and stance slip over 100 seeded simulation episodes.
---

# Contact Audit Operational Procedure

## Purpose
Validates ground-contact invariants across 100 seeds with 3 policies (scripted trot, random gait, adversarial perturbation) to produce `contact-report.json`.

## Invariant Checks
1. **Foot Tip Ground Clearance**: $\min(\text{foot}_y - \text{terrain}_y) \ge -0.01\text{m}$.
2. **Hull Penetration Depth**: $\max(\text{terrain}_y - \text{hullBottom}_y) \le 0.02\text{m}$.
3. **Stance Phase Slip**: Foot movement during contact phase $\le 0.02\text{m}$.
4. **Correction Counters**: `contactCorrections` in runner $< 0.1\%$ of frames; `viewerContactFix` in viewport $= 0$.

## Execution
Run `npx tsx test/phase8_contact_audit.test.ts`.
