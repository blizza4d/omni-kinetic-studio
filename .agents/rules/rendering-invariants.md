# Rendering Invariants (I1 through I8)

## 1. INVARIANT DEFINITIONS
- **I1 No Ghost Shadows**: Every shadow cast onto the visible ground must correspond to an active, unculled rock instance in the main render pass. In `?debug=debrisFlat`, all shadow blobs must touch a magenta rock region within 12 px.
- **I2 No Stray Sprites**: Every primitive drawn in the Three.js viewport must belong to a named scene object. Unnamed meshes, debug rays, or unattenuated points fail validation.
- **I3 Surface-Draped Rim**: The arena boundary is evaluated per-fragment within the terrain shader. Floating polylines or mesh cylinders are strictly forbidden.
- **I4 Smooth Horizon**: The perimeter skirt rises gently ($\le 12^\circ$) into a distant ridge ring obscured by exponential fog. Dome or spherical horizon curvature is prohibited.
- **I5 Contact Visible**: Lower leg segments and all four foot tips must be clearly visible and in contact with the ground surface in the default chase camera view.
- **I6 Contrast & Legibility**: Luminance contrast between the robot body and terrain must be $\ge 2.0:1$; rock-to-terrain contrast must be $\ge 1.4:1$.
- **I7 Relief Visible**: Terrain must show distinct contour lines ($0.25\text{m}$ subtle, $1.0\text{m}$ bold), craters, and slope shading.
- **I8 Realistic Rock Shapes**: Debris meshes are generated from noise-displaced subdivided icosahedrons with flattened bottoms. Octahedrons, tetrahedrons, and sharp pyramids are prohibited.
