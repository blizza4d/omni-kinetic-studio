# Terrain Contract & Single Source of Truth Rules

## 1. SINGLE TERRAIN SOURCE OF TRUTH
- **Authoritative Generation**: Terrain elevation is generated strictly once by the authoritative runner/spec compiler into a canonical `TerrainField v1` grid asset.
- **Zero Independent Generation**: The viewer, physics worker, telemetry runner, and radar MUST NEVER regenerate terrain independently from a noise function or random seed.
- **Binary Hash Verification**: The terrain grid is serialized (Int16 mm heights, SHA-256 hash) and downloaded via `/api/terrain/<hash>`. All subsystems verify against this hash.

## 2. CANONICAL GRID SPECIFICATION (257 x 257)
- **Grid Resolution**: $N = 257 \times 257$ samples.
- **Physical Bounds**: Extent $48\text{m} \times 48\text{m}$ ($x, z \in [-24, +24]\text{m}$), halfExtent $18\text{m}$ plus $6\text{m}$ perimeter skirt.
- **Spacing**: Exact $0.1875\text{m}$ uniform spacing.
- **Grid Center Origin**: Origin $(0, 0, 0)$ is at the exact center of the grid ($ix = 128, iz = 128$). Corner origins are strictly prohibited.
- **Fixed Triangulation**: Cell $(ix, iz)$ with vertices $a=(ix, iz), b=(ix+1, iz), c=(ix, iz+1), d=(ix+1, iz+1)$ is consistently triangulated along the $a-d$ diagonal into triangles $(a, b, d)$ and $(a, d, c)$.
- **Barycentric Interpolation**: `sampleHeight(x, z)` uses barycentric interpolation on these exact triangles, ensuring exact mathematical parity between the continuous sampler and the rendered 3D mesh.

## 3. QUALITY TIER INVARIANT
- **Geometry Invariance**: The terrain geometry (257x257 grid, 66,049 vertices, 131,072 triangles) is fixed across ALL quality tiers (Ultra, High, Medium, Low, Potato).
- **Tier Levers**: Quality tiers scale shadow map resolution, debris instance counts, particle drift, and DPR—NEVER terrain geometry or raycast height.

## 4. SHADING & ARENA RIM
- **Analog AI Palette**: Charcoal regolith base (`#2A2A2A`), sage-tinted lowlands, cream-dim contour lines.
- **Surface-Draped Rim**: The arena boundary is rendered directly within the terrain shader using a fragment-distance function. Polylines floating in 3D space are strictly prohibited.
