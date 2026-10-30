# Design System ("Analog AI") Rules

1. **Aesthetic Tone & Direction:**
   - Linear-inspired, tactile workstation interface.
   - Strictly prohibit stock generic dashboard templates, rainbow badge arrays, or standard component library presets.
   - Glassmorphism panels: `backdrop-filter: blur(12px)`, 1px subtle borders (`rgba(253, 251, 247, 0.12)`), soft shadow layers.

2. **Color Palette Tokens:**
   - Workspace background: `--charcoal: #2A2A2A`
   - Deep background: `--charcoal-deep: #1A1A1A`
   - Success & metrics: `--sage: #6B705C`
   - Error & collisions: `--brick: #B83B2F`
   - Primary high-contrast text: `--cream: #FDFBF7`
   - Muted text & telemetry labels: `--cream-muted: rgba(253, 251, 247, 0.65)`

3. **Typography:**
   - Monospace / Typewriter (Courier Prime or monospace stack) for:
     - Streaming log tokens and error explanations
     - Telemetry coordinate values and joint readouts
     - Code diffs and Python syntax views
     - Token count meters and FPS HUD
   - Clean Sans-serif (Inter / System) for workspace layout chrome, modal titles, and navigation hints.

4. **Keyboard-First Experience:**
   - Every primary workflow must be reachable via hotkeys:
     - `Cmd/Ctrl + K`: Command Palette
     - `T`: Toggle CV Teleop mode
     - `Space`: Pause / Resume physics playback
     - `R`: Reset camera / trajectory
     - `Esc`: Close open overlays
   - Visible keyboard badge hints (e.g. `[Ctrl+K]`) next to actionable headers.
