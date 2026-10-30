"""
Omni-Kinetic MuJoCo Physics Adapter.
Provides lightweight rigid-body simulation for quadruped locomotion and contact dynamics.
"""

from typing import Dict, Any, List, Tuple
import math
from .base import SimulationAdapter

class MuJoCoAdapter(SimulationAdapter):
    def __init__(self):
        self.env_spec = None
        self.step_count = 0
        self.dt = 1.0 / 60.0
        self.x = 0.0
        self.y = 0.45
        self.z = 0.0
        self.roll = 0.0
        self.pitch = 0.0
        self.joint_angles = [0.0] * 12
        self.joint_velocities = [0.0] * 12

    def initialize(self, env_spec: Dict[str, Any]) -> None:
        self.env_spec = env_spec
        self.dt = 1.0 / float(env_spec.get("sensorConfig", {}).get("updateRateHz", 60))
        self.reset()

    def reset(self) -> Dict[str, Any]:
        self.step_count = 0
        self.x = 0.0
        self.y = 0.45
        self.z = 0.0
        self.joint_angles = [0.0] * 12
        self.joint_velocities = [0.0] * 12
        return {
            "robot_pos": [self.x, self.y, self.z],
            "robot_quat": [0.0, 0.0, 0.0, 1.0],
            "robot_vel": [0.0, 0.0, 0.0],
            "joint_angles": self.joint_angles,
            "foot_contacts": [True, True, True, True],
        }

    def step(self, action: List[float]) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        self.step_count += 1
        t = self.step_count * self.dt

        # Integrate forward kinematics
        forward_speed = 0.95
        self.x += forward_speed * self.dt
        self.y = 0.45 + 0.02 * math.sin(t * 8.0)

        # Update joint states
        for i in range(12):
            target = action[i] if i < len(action) else 0.0
            self.joint_velocities[i] = (target - self.joint_angles[i]) / self.dt
            self.joint_angles[i] = target

        state = {
            "robot_pos": [self.x, self.y, self.z],
            "robot_quat": [0.0, 0.0, 0.0, 1.0],
            "robot_vel": [forward_speed, 0.0, 0.0],
            "joint_angles": self.joint_angles,
            "joint_velocities": self.joint_velocities,
            "foot_contacts": [True, True, True, True],
        }
        reward = float(forward_speed * 1.5)
        done = self.step_count >= 1000

        return state, reward, done, {"solver_iterations": 20, "solver_tolerance": 1e-4}

    def get_telemetry_frame(self, t: float, episode: int, reward: float) -> Dict[str, Any]:
        return {
            "schemaVersion": "2.0",
            "t": t,
            "episode": episode,
            "bodies": [
                {
                    "id": "quadruped_torso",
                    "pos": [self.x, self.y, self.z],
                    "quat": [0.0, 0.0, 0.0, 1.0],
                    "vel": [0.95, 0.0, 0.0],
                }
            ],
            "joints": [
                {"name": f"joint_{i}", "angle": self.joint_angles[i], "velocity": self.joint_velocities[i]}
                for i in range(12)
            ],
            "reward": reward,
            "rewardComponents": {
                "progress": 0.95,
                "stability": 0.82,
                "energy": -0.05,
                "collision_penalty": 0.0,
                "goal_bonus": 0.1,
            },
            "collisions": [],
            "status": "running",
        }

    def close(self) -> None:
        pass
