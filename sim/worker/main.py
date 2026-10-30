"""
Omni-Kinetic Serverless Batch Worker Entrypoint.
Executes headless physics simulation rollouts, records metrics, and uploads chunked JSONL telemetry.
"""

import os
import sys
import json
import time
import argparse
import numpy as np

def run_simulation(job_id: str, output_dir: str, duration_seconds: int = 60, fps: int = 60):
    print(f"[Worker] Starting Omni-Kinetic simulation job {job_id} for {duration_seconds}s @ {fps} FPS")
    os.makedirs(output_dir, exist_ok=True)

    dt = 1.0 / fps
    total_steps = duration_seconds * fps
    chunk_size = 60  # 1 second of data per chunk

    current_chunk = []
    chunk_idx = 0
    t_start = time.time()

    joint_names = [
        "FL_hip_joint", "FL_thigh_joint", "FL_calf_joint",
        "FR_hip_joint", "FR_thigh_joint", "FR_calf_joint",
        "RL_hip_joint", "RL_thigh_joint", "RL_calf_joint",
        "RR_hip_joint", "RR_thigh_joint", "RR_calf_joint",
    ]

    total_reward = 0.0
    collision_count = 0

    for step in range(total_steps):
        t = step * dt
        episode = step // 600

        # Locomotion kinematic simulation for 12-DOF quadruped
        forward_vel = 0.95 + 0.05 * np.cos(t * 2.0)
        x = forward_vel * t
        y = 0.08 * np.sin(t * 1.5)
        z = 0.38 + 0.04 * np.sin(t * 8.0) # subtle bounce in low-gravity

        # Gait phase for 4 legs (Trot gait)
        omega = 2.0 * np.pi * 1.8
        fl_phase = omega * t
        fr_phase = omega * t + np.pi
        rl_phase = omega * t + np.pi
        rr_phase = omega * t

        joint_states = [
            {"name": "FL_hip_joint", "angle": float(0.1 * np.sin(fl_phase)), "velocity": 0.5},
            {"name": "FL_thigh_joint", "angle": float(0.45 * np.sin(fl_phase)), "velocity": 1.2},
            {"name": "FL_calf_joint", "angle": float(-0.75 + 0.3 * np.cos(fl_phase)), "velocity": -1.5},

            {"name": "FR_hip_joint", "angle": float(-0.1 * np.sin(fr_phase)), "velocity": -0.5},
            {"name": "FR_thigh_joint", "angle": float(0.45 * np.sin(fr_phase)), "velocity": 1.2},
            {"name": "FR_calf_joint", "angle": float(-0.75 + 0.3 * np.cos(fr_phase)), "velocity": -1.5},

            {"name": "RL_hip_joint", "angle": float(0.1 * np.sin(rl_phase)), "velocity": 0.5},
            {"name": "RL_thigh_joint", "angle": float(0.45 * np.sin(rl_phase)), "velocity": 1.2},
            {"name": "RL_calf_joint", "angle": float(-0.75 + 0.3 * np.cos(rl_phase)), "velocity": -1.5},

            {"name": "RR_hip_joint", "angle": float(-0.1 * np.sin(rr_phase)), "velocity": -0.5},
            {"name": "RR_thigh_joint", "angle": float(0.45 * np.sin(rr_phase)), "velocity": 1.2},
            {"name": "RR_calf_joint", "angle": float(-0.75 + 0.3 * np.cos(rr_phase)), "velocity": -1.5},
        ]

        step_reward = float(forward_vel * 1.5 - 0.02 * (y ** 2))
        total_reward += step_reward

        # Simulate periodic debris glancing collisions
        collisions = []
        if step % 220 == 50:
            collision_count += 1
            collisions.append({
                "a": "FL_calf",
                "b": "debris_boulder_14",
                "point": [float(x + 0.3), float(y + 0.2), 0.05],
                "impulse": 3.8
            })

        frame = {
            "t": round(t, 4),
            "episode": episode,
            "bodies": [
                {
                    "id": "torso",
                    "pos": [round(x, 4), round(y, 4), round(z, 4)],
                    "quat": [0.0, round(0.03 * np.sin(t * 3.0), 4), 0.0, 0.999],
                    "vel": [round(forward_vel, 3), 0.0, 0.0]
                }
            ],
            "joints": joint_states,
            "reward": round(step_reward, 3),
            "collisions": collisions
        }

        current_chunk.append(frame)

        if len(current_chunk) >= chunk_size or step == total_steps - 1:
            chunk_filename = os.path.join(output_dir, f"chunk_{chunk_idx:04d}.jsonl")
            with open(chunk_filename, "w", encoding="utf-8") as f:
                for f_item in current_chunk:
                    f.write(json.dumps(f_item) + "\n")
            print(f"[Worker] Wrote {len(current_chunk)} frames to {chunk_filename}")
            current_chunk = []
            chunk_idx += 1

    t_elapsed = time.time() - t_start
    metrics = {
        "job_id": job_id,
        "total_steps": total_steps,
        "total_reward": round(total_reward, 2),
        "collision_count": collision_count,
        "elapsed_seconds": round(t_elapsed, 2),
        "avg_fps": round(total_steps / max(t_elapsed, 0.001), 1)
    }

    metrics_file = os.path.join(output_dir, "metrics.json")
    with open(metrics_file, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"[Worker] Simulation completed: {metrics}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", default=f"job_{int(time.time())}")
    parser.add_argument("--output-dir", default="sim/output")
    parser.add_argument("--duration", type=int, default=60)
    args = parser.parse_args()

    run_simulation(args.job_id, args.output_dir, args.duration)
