# Controller Core Rules — /lib/controller-core

- **Single Shared Module:** All locomotion kinematics, trot gait phase timing, 2-link leg IK, boundary checks, and canonical terrain sampling live in `/lib/controller-core`.
- **Pure Deterministic TypeScript:** The controller core is pure TypeScript with zero DOM and zero Node.js-only API dependencies. It runs identically in:
  1. Browser main thread (ThreeViewer visualization)
  2. Browser web workers (Takeover Sandbox, learning trainer)
  3. Node.js server (Local runner API routes)
  4. Docker container (Headless cloud sim worker)
- **Controller Parity Gate:** Any change to `/lib/controller-core` must pass `controller-parity-test` asserting that simulated robot trajectories agree within $< 1\text{ cm}$ position and $< 0.5^\circ$ joint angle tolerance after 30 seconds across 20 seeded episodes.
