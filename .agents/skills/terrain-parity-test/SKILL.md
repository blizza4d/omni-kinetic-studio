---
name: terrain-parity-test
description: Operational procedure for sampling 10,000 random coordinates to verify exact height agreement between canonical sampler, 3D mesh, radar, debris, and physics heightfield.
---

# Terrain Parity Test Procedure

## Purpose
Enforces the single-source-of-truth principle by validating that all subsystems evaluate mathematically identical elevation across the entire $48\text{m} \times 48\text{m}$ domain.

## Tolerances
- **Mesh Raycast vs Sampler**: Difference $\le 0.01\text{m}$ across 10,000 points.
- **Debris Embed vs Sampler**: Difference $\le 0.02\text{m}$.
- **Radar vs Sampler**: Deviation $\le 0.02\text{m}$.
- **Cross-Tier Hash Invariance**: SHA-256 hash of the canonical 257x257 height grid must be identical across Ultra, High, Medium, Low, and Potato tiers.

## Execution
Run `npx tsx test/phase8_terrain_parity.test.ts`.
