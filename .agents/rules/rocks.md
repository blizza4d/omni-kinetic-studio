# ROCKS & DEBRIS RULES
**Contract:** `DebrisInstance` (`/lib/world/debris.ts`)

1. **Geometry Variety (Zero Pyramids):**
   - At least 6 distinct shared geometries (subdivided displaced icosahedrons with flattened bases and fractured angular facets).
   - Minimum 80 triangles per mesh at LOD0. No cone, box, or pyramid primitives.

2. **Colors & Luminance:**
   - Base material color must be pure white (`0xFFFFFF`).
   - Per-instance rock colors vary across 5 geological anorthosite/basalt tones (`#3A3A36` to `#55554E`).
   - Vertex colors apply a normal-Y gradient to ensure rock top faces are noticeably lighter than vertical flanks.
   - Zero rock pixels may fall below $0.05$ luminance in direct light.

3. **Placement & Footholds:**
   - Rocks embedded $15\%\text{–}35\%$ into terrain heightfield; zero floating rocks.
   - Foothold selector enforces a minimum $5\text{cm}$ clearance margin from rock bounding cylinders.
   - Pebbles under $0.12\text{m}$ fade out by $18\text{m}$ distance; radial density is uniform within $\pm 30\%$ apart from the outer margin.
