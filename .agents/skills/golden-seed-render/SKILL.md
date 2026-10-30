---
name: golden-seed-render
description: Automated visual regression procedure capturing 5 deterministic golden seeds under fixed camera presets to prevent visual, lighting, or mesh regressions.
---

# Golden Seed Render Procedure

## Purpose
Captures high-resolution reference screenshots of seeds 42, 101, 777, 2024, and 9999 under fixed camera poses (chase, top, side, orbit) to verify relief, craters, contours, and debris layout.

## Verification Checklist
- [ ] Craters are visible as distinct bowls with raised lit rims.
- [ ] World-space contour lines render every $0.25\text{m}$ (subtle) and $1.0\text{m}$ (prominent).
- [ ] Debris does not form dense perimeter rings or wall-like horizon bands.
- [ ] No pyramid-like octahedron artifacts exist in the debris field.
- [ ] Dashed arena boundary is draped on the terrain surface.

## Execution
Run `npx tsx scripts/capture_golden_seeds.ts`.
