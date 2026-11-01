# Lighting, Shadows & Tone Rules

1. **Directional Shadows:**
   - Single directional key light with shadow frustum wide enough ($24\text{ m}$) to encompass the robot and immediate rock obstacles.
   - Soft PCF filtering on High/Ultra tier.
   - Directional light follows the robot with texel snapping.
   - All rocks within $14\text{ m}$ and the robot MUST cast attached shadows.

2. **Invariant I1 (No Ghost Shadows & No Missing Casters):**
   - Every visible shadow MUST have an active visible caster.
   - Never turn shadows off to satisfy I1.

3. **Lighting Balance & Contrast:**
   - Key light (directional): 1.5 intensity.
   - Ambient light: 0.35 intensity.
   - Fill light (directional, opposite hemisphere): 0.30 intensity.
   - Prevents washing out shadow contrast while maintaining visibility in crevices.
   - Color space: `outputColorSpace = THREE.SRGBColorSpace`.
   - Procedural PMREM gradient environment map for metallic robot components.
   - Cheap circular contact shadow blobs under rocks and feet.
