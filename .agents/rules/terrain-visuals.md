# Terrain Visuals & Detrend Rules

1. **Planar Tilt Invariant:**
   - After procedural noise synthesis, subtract the least-squares plane from the heightfield.
   - Mean plane tilt over the arena MUST be $\le 1.0^\circ$.
   - Tilt over any $12\text{ m}$ window MUST be $\le 3.0^\circ$ (excluding craters/ridges).
   - Skirt slope cap $\le 12^\circ$.

2. **Shader Contours (No Polyline Geometry):**
   - Contour lines drawn exclusively in the terrain fragment shader using `fwidth`.
   - Subtle $0.25\text{ m}$ intervals (14% opacity), bold $1.0\text{ m}$ intervals (32% opacity).
   - Contours MUST fade to zero beyond $22\text{ m}$ to prevent horizon banding.
   - Terrain shader chunk MUST be injected before `<fog_fragment>` so contours are fogged.

3. **Smooth Normals & Shading:**
   - Normals computed by central differences from the 257×257 grid.
   - `flatShading = false`.
   - Primary craters must have lit convex rims and shaded concave floors (readable as 3D bowls).
