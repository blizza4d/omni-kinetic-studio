---
name: visual-invariants-check
description: Automated Playwright and WebGL pixel verification procedure enforcing rendering invariants I1 through I8.
---

# Visual Invariants Check Operational Procedure

## Purpose
Validates the 8 rendering invariants (no ghost shadows, no stray sprites, surface-draped rim, smooth horizon, visible contact, contrast ratio, relief visibility, realistic rock shapes) producing `VisualReport v1`.

## Execution
Run `npx tsx test/visual_invariants.test.ts`.
