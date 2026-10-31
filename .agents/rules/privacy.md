# Privacy Rules — Camera & Biometric Guardrails

- **Zero Frame Persist or Upload:** Raw webcam video frames NEVER leave the browser, are NEVER transmitted across the network, and are NEVER written to disk or IndexedDB.
- **Derived Landmarks Only:** Only normalized numerical landmark coordinates ($[x, y, z]$ in $[0, 1]$) are retained, and ONLY after the user explicitly triggers recording with `R`.
- **Visible Stream Status:** The UI must display an honest "Local-only vision" badge with a green camera indicator whenever the webcam track is active.
- **One-Click Instant Stop:** A prominent Stop button must release all `MediaStreamTrack` instances immediately and terminate worker processing.
- **Network Verification Gate:** CI tests must assert that 0 network requests containing image/video payloads are dispatched during teleoperation sessions.
