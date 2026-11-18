# Omni-Kinetic Studio v2 — Controls & Input Reference (`CONTROLS.md`)

All bindings below are registered in the single `ShortcutRegistry` (`lib/control/shortcuts.ts`) with zero conflicts, typing-target suppression, and live user remapping inside **Settings → Controls**.

| Action | Keyboard | Gamepad | Touch | Notes |
|--------|----------|---------|-------|-------|
| Take / Release Control | `T` / `Enter` | `Y` | Mode chip | Switch between manual driving and autonomous Policy v1 |
| Move Forward | `W` / `↑` | Left Stick ↑ | Left Joystick ↑ | Drive droid forward (+X body axis) |
| Move Backward | `S` / `↓` | Left Stick ↓ | Left Joystick ↓ | Reverse droid (-X body axis) |
| Turn Left | `A` / `←` | Right Stick ← | Right Pad ← | Rotate yaw counter-clockwise (+yaw) |
| Turn Right | `D` / `→` | Right Stick → | Right Pad → | Rotate yaw clockwise (-yaw) |
| Strafe Left | `J` / `Shift+A` | Left Stick ← | Left Joystick ← | Translate laterally left (-Z body axis) |
| Strafe Right | `L` / `Shift+D` | Left Stick → | Left Joystick → | Translate laterally right (+Z body axis) |
| Sprint / Bound | `Shift` (hold) | `RT` | Bound button | Accelerate into low-gravity bounding gait |
| Charge & Hop | `Space` (hold/release) | `A` | Hop button | Hold up to 0.6s to charge crouch, release for ballistic hop |
| Crouch | `C` (hold) | `X` | Crouch toggle | Lower chassis height smoothly |
| Stand Tall | `V` (hold) | D-Pad ↑ | Height slider | Raise chassis height smoothly |
| Emergency Stop / Recover | `X` | `B` | Stop button | Immediately brake to neutral stance or stand up |
| Gait Override | `0`–`4` | `LB` / `RB` | Gait pills | `0` Auto, `1` Walk, `2` Trot, `3` Bound, `4` Pronk |
| Click-to-Move Waypoint | Left-Click terrain | — | Tap terrain | `Shift+Click` queues waypoints; `Alt+Click` removes; `Esc` clears |
| Pointer Drive (optional) | Hold Right-Click | — | — | Steer toward cursor ground point (enable in Settings) |
| Frame Droid (Camera) | `F` | `R3` | Double-tap HUD | Reset camera offset smoothly onto droid |
| Camera Modes | `Alt+1`–`Alt+5` | D-Pad → | Camera pills | Follow, Orbit, Top-Down, First-Person (FPV), Free-Fly |
| Task Prompt / Palette | `Ctrl+K` | — | Header button | Open Nemotron task prompt & command palette |
| Toggle Side Panel | `Ctrl+B` | — | Panel chevron | Collapse or expand left Console/Inspector drawer |
| Toggle PerfProbe | `P` | — | FPS badge | Open performance & frame-time diagnostics |
| Cycle Quality Tier | `Q` | — | Settings | Cycle `low` / `medium` / `high` / `ultra` |
| Toggle Control Legend | `H` | — | HUD close | Show or hide on-screen control legend |
| Scenario Editor | `E` | — | Scenario button | Toggle top-down scenario & terrain brush editor |
| Capture 2x Screenshot | `F12` | — | Camera button | Save crisp 2x PNG snapshot & copy to clipboard |
| Shortcuts Dialog | `?` | — | `?` button | Open full controls dialog generated from registry |
| Filter Console Logs | `/` | — | Filter input | Focus console log search box |
| Pause / Clear Waypoints | `Esc` | `Start` | Pause button | Open Pause menu or clear queued waypoints |
