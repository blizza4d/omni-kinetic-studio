# Takeover Sandbox Rules — Zero-Latency Physical Intervention

- **Instant Handoff ($< 300\text{ ms}$):** Pressing `T` or stall detection triggers a `TakeoverSession v1` capturing playhead state snapshot (pose, velocities, joint angles, feet contacts, terrain hash).
- **Client-Side Simulation:** Takeover runs locally at a fixed 60 Hz inside a client-side Takeover Sandbox powered by the shared `/lib/controller-core`, guaranteeing zero network latency even for cloud-trained runs.
- **Continuous Invariant Enforcement:** Commanded teleop inputs are target goals, not raw joint overrides. All motion passes through the controller's 2-link IK, ground contact solver, and arena boundary collision clamps. Zero feet below terrain $> 1\text{cm}$; zero hull penetration $> 2\text{cm}$.
- **Smooth Autonomy Blending:** Releasing control (or 1.5s idle timeout) smoothly blends back to autonomous policy over 0.5s time-based window. Zero snap.
