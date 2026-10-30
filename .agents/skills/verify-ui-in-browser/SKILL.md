---
name: verify-ui-in-browser
description: Standard operational procedure for visual and behavioral verification of the running Omni-Kinetic application using headless/automated browser checks and screenshots.
---

# Verify UI in Browser Skill

This skill documents how to execute acceptance verification and snapshot capturing for Omni-Kinetic.

## Step-by-Step Procedure
1. **Start Development Server:**
   Ensure the Next.js server is actively running on port 3000 (`http://localhost:3000`).
2. **Execute State Inspection Checklist:**
   - **State 1 (Idle Workspace):** Verify header tokens, mode badge `[DEMO: LOCAL RUNNER]` or `[CLOUD: NEBIUS L40S]`, and floating command shortcut `[Ctrl+K]`.
   - **State 2 (Planning & Diff):** Open command palette (`Ctrl+K`), submit task prompt `"quadruped, low-gravity debris field"`, verify streaming log typewriter and diff panels with Approve / Reject buttons.
   - **State 3 (Simulation Running):** Click Approve, verify 3D viewer renders articulated quadruped walking on seeded terrain, minimap active, frame rate >= 55 FPS.
   - **State 4 (Collision Feedback):** Verify collision events display brick-red pulse highlights on robot chassis and log telemetry readouts.
   - **State 5 (CV Teleoperation):** Press `T` to toggle Teleop mode, verify webcam pip appears with skeleton landmark overlay, calibration countdown, and measured glass-to-joint latency < 100 ms.
3. **Capture Artifact Screenshots:**
   Store high-resolution snapshots under `/docs/screenshots/` and reference in phase Walkthrough artifacts.
