---
name: capture-demo-recording
description: Standard operational procedure for capturing video recordings and state progression snapshots of the running Omni-Kinetic application for hackathon reviews.
---

# Capture Demo Recording Skill

This skill documents how to record the live application in headless or automated browser environments.

## Step-by-Step Procedure
1. **Launch Chromium with Media Flags:**
   ```bash
   chrome.exe --enable-usermedia-screen-capturing --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
   ```
2. **Execute Scripted Tour:**
   - Press `J` to launch the 3-minute Judge Mode tour.
   - Record frames or capture snapshot sequences for each key stage:
     - 0:00: Idle Workspace & Preset selection
     - 0:45: Stage Rail & Code Diff Approval
     - 1:30: 3D Viewport with 2,000 Debris instances & 60 FPS
     - 2:15: Collision brick-red pulse & sage-green reward aura
     - 2:45: Teleoperation hand control & DAgger episode harvest
     - 3:00: Iteration 2 ghost comparison
3. **Save Artifacts:**
   Save video or screenshot series under `docs/screenshots/` and copy to the artifact directory.
