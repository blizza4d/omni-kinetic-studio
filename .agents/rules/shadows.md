# SHADOW INTEGRITY & FRUSTUM RULES
**Contract:** `ShadowState v1` (`/contracts`)

1. **Frustum & Map Bounds:**
   - Directional shadow frustum covers a full 24m envelope (`[-12, 12, 12, -12]`, far 48m).
   - Shadow camera tracks robot position in world space and snaps to texel steps to eliminate shadow edge shimmering.
   - Shadow map resolution: 2048×2048 on Ultra/High tiers, 1024×1024 on Medium.

2. **Casters & Receivers:**
   - Robot torso, legs, and all rocks within 14m cast shadows (`castShadow = true`).
   - Terrain mesh must retain standard shadow chunks (`receiveShadow = true`).
   - Pre-fog custom shaders must preserve shadow map evaluation chunks (`<lights_fragment_end>`).

3. **Contact Shadows & Bias:**
   - Directional bias set to $-0.0003$, normal bias to $0.02$, ensuring shadows remain attached to rock and foot bases without acne.
   - Instanced contact blob shadows under each rock ($0.35$ opacity, $1.2\times$ rock radius).
   - Foot contact blobs directly under planted feet (sage when stance, fading cream-dim when swing).
