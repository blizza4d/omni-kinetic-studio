---
name: debug-render-modes
description: Operational procedure for triggering specialized WebGL shader and viewport debug modes (?debug=...) for diagnosing shadows, culling, and contact.
---

# Debug Render Modes Procedure

## Available Query Modes
- `?debug=shadowsOnly`: Isolates shadow depth map texture rendering.
- `?debug=debrisFlat`: Renders debris in unlit magenta (`#FF00FF`) to audit ghost shadow contact.
- `?debug=wire`: Renders wireframe meshes across terrain and colliders.
- `?debug=normals`: Displays surface normal vectors.
- `?debug=contours`: Forces high-contrast world-space contour lines.
- `?debug=bounds`: Visualizes arena envelope, soft margin, and floor catch plane.
- `?debug=feet`: Draws foot contact spheres (sage = stance, cream = swing) and hull corners.
- `?debug=sceneAudit`: Dumps complete scene graph object hierarchy and bounding boxes to console.
