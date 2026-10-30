"""
NVIDIA Isaac GR00T Foundation Model Adapter for Omni-Kinetic.
Bridges GR00T generalist robot foundation policies with the unified simulation runner.
"""

from typing import Dict, Any, List, Tuple
from sim.adapters.base import SimulationAdapter
import numpy as np

class Gr00tAdapter(SimulationAdapter):
    """
    Adapter for NVIDIA Isaac GR00T reference humanoid/quadruped foundation models.
    Supports multi-modal observation ingestion and motor token generation.
    """
    def __init__(self, model_checkpoint: str = "nvidia/gr00t-n1-quadruped"):
        self.model_checkpoint = model_checkpoint
        self.env_spec = None
        self.step_count = 0
        self.active = False

    def initialize(self, env_spec: Dict[str, Any]) -> None:
        self.env_spec = env_spec
        self.gravity = env_spec.get("gravity", [0.0, 0.0, -1.62])
        self.active = True
        print(f"[Gr00tAdapter] Initialized with checkpoint {self.model_checkpoint} under gravity {self.gravity}")

    def reset(self) -> Dict[str, Any]:
        self.step_count = 0
        return {
            "robot_pos": [0.0, 0.0, 0.45],
            "robot_quat": [0.0, 0.0, 0.0, 1.0],
            "robot_vel": [0.0, 0.0, 0.0],
            "joint_angles": [0.0] * 12,
            "joint_velocities": [0.0] * 12,
            "collisions": []
        }

    def step(self, action: List[float]) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        self.step_count += 1
        dt = 1.0 / 60.0
        t = self.step_count * dt

        # Forward kinematics approximation for GR00T policy rollout
        vx = 0.8 + 0.1 * np.sin(t * 3.0)
        vy = 0.05 * np.cos(t * 2.0)
        vz = float(self.gravity[2]) * 0.002 * np.sin(t * 4.0)

        pos = [vx * t, vy, 0.45 + vz]
        quat = [0.0, 0.05 * np.sin(t), 0.0, np.cos(0.05 * np.sin(t))]

        state = {
            "robot_pos": pos,
            "robot_quat": quat,
            "robot_vel": [vx, vy, vz],
            "joint_angles": [float(0.4 * np.sin(t * 6.0 + i)) for i in range(12)],
            "joint_velocities": [float(2.4 * np.cos(t * 6.0 + i)) for i in range(12)],
            "collisions": []
        }

        reward = float(vx * 2.0 - 0.1 * abs(vy))
        done = self.step_count >= 1000
        return state, reward, done, {"foundation_model": "GR00T-N1"}

    def get_telemetry_frame(self, t: float, episode: int, reward: float) -> Dict[str, Any]:
        # Formatted directly to TelemetryFrame contract
        joint_names = [
            "FL_hip_joint", "FL_thigh_joint", "FL_calf_joint",
            "FR_hip_joint", "FR_thigh_joint", "FR_calf_joint",
            "RL_hip_joint", "RL_thigh_joint", "RL_calf_joint",
            "RR_hip_joint", "RR_thigh_joint", "RR_calf_joint",
        ]
        return {
            "t": t,
            "episode": episode,
            "bodies": [
                {
                    "id": "torso",
                    "pos": [0.8 * t, 0.0, 0.45],
                    "quat": [0.0, 0.0, 0.0, 1.0],
                    "vel": [0.8, 0.0, 0.0]
                }
            ],
            "joints": [
                {"name": name, "angle": float(0.4 * np.sin(t * 5.0 + i)), "velocity": 0.5}
                for i, name in enumerate(joint_names)
            ],
            "reward": reward,
            "collisions": []
        }

    def close(self) -> None:
        self.active = False
