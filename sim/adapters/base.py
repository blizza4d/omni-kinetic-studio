"""
Omni-Kinetic Simulation Adapter Base Interface.
Provides a unified abstraction across Isaac GR00T, Cosmos, MuJoCo, PyBullet, and Local Kinematics.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Tuple

class SimulationAdapter(ABC):
    @abstractmethod
    def initialize(self, env_spec: Dict[str, Any]) -> None:
        """Configures the physics environment, terrain, gravity, and robot morphology."""
        pass

    @abstractmethod
    def reset(self) -> Dict[str, Any]:
        """Resets the environment to initial conditions and returns the initial state."""
        pass

    @abstractmethod
    def step(self, action: List[float]) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        """
        Applies action to robot actuators.
        Returns: (state, reward, done, info)
        """
        pass

    @abstractmethod
    def get_telemetry_frame(self, t: float, episode: int, reward: float) -> Dict[str, Any]:
        """Formats the current simulation state into the compact TelemetryFrame contract."""
        pass

    @abstractmethod
    def close(self) -> None:
        """Cleans up simulation instances, GPU contexts, or threads."""
        pass
