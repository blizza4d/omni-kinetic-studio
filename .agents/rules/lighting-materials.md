# LIGHTING & MATERIALS RULES
**Contract:** `VisualReport v1` (`/contracts`)

1. **Light Calibration:**
   - Single directional key light positioned at low angle ($20^\circ\text{–}25^\circ$ elevation), warm cream (`0xFDFBF7`), intensity 1.55.
   - Hemisphere fill light with cool sky (`0x6B705C`) and charcoal ground (`0x2A2A2A`), maintaining shadow ground luminance at $55\%\text{–}65\%$ of lit ground.
   - Zero unshadowed ambient washout; ambient intensity capped at 0.35.

2. **Tone Mapping & Exposure:**
   - `renderer.outputColorSpace = THREE.SRGBColorSpace`.
   - `renderer.toneMapping = THREE.ACESFilmicToneMapping`.
   - Ground mean luminance tuned to $18\%\text{–}22\%$; rock tops to $28\%\text{–}40\%$.
   - Crushed blacks ($< 0.03$) must not exceed $1.5\%$ of non-shadow pixels.

3. **Material Invariants:**
   - When using `InstancedMesh.setColorAt`, the base material color must be pure white (`0xFFFFFF`). Never multiply dark gray by dark gray.
   - Robot body uses `--robot-body #3A3A3A`, metalness 0.35, roughness 0.55, procedural PMREM reflection, ensuring $\ge 2.0:1$ contrast against the ground.
