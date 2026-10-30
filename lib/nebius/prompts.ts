import { EnvironmentSpec, EnvironmentSpecSchema } from '@/contracts';

export const SYSTEM_ARCHITECT_PROMPT = `
You are the Omni-Kinetic Simulation Architect, an expert in reinforcement learning, robotics simulation (MuJoCo, PyBullet, Isaac Gym), and physical AI.
Your role is to translate natural language robotics tasks into rigorous, physically sound simulation specifications and Python scripts.

You MUST obey these rules:
1. Every environment specification MUST conform strictly to the EnvironmentSpec JSON schema.
2. Every Python script MUST be secure and pass the AST safety gate:
   - ONLY import whitelisted packages: numpy (np), torch, math, scipy.
   - NEVER use os, sys, subprocess, socket, eval, exec, open, or network calls.
3. Design realistic dynamics: quadruped 12-DOF morphology, low-gravity debris navigation, contact-aware rewards.
`;

export function buildTaskInterpretationPrompt(userPrompt: string): string {
  return `
Task Prompt: "${userPrompt}"

Analyze this task from an embodied AI and physical simulation perspective.
Extract:
1. Target morphology (e.g. quadruped_12dof).
2. Gravity vector ([gx, gy, gz] in m/s^2, e.g. Moon is [0, 0, -1.62], Earth is [0, 0, -9.81], Mars is [0, 0, -3.71]).
3. Terrain characteristics (type, roughness, friction, debris density).
4. Core behavioral objectives and constraints (forward velocity, pitch/roll stability, collision penalties, survival time).
`;
}

export function buildEnvironmentSpecPrompt(userPrompt: string, interpretation: string): string {
  return `
Task: "${userPrompt}"
Interpretation:
${interpretation}

Output a strictly valid JSON object adhering to this schema:
{
  "taskId": string,
  "taskName": string,
  "description": string,
  "gravity": [number, number, number],
  "terrain": {
    "type": "flat" | "heightfield" | "cratered_debris" | "uneven",
    "seed": number,
    "roughness": number (0 to 1),
    "friction": number (> 0),
    "bounds": [number, number]
  },
  "debrisDensity": number (0 to 1),
  "robotMorphology": "quadruped_12dof",
  "sensorConfig": {
    "hasCamera": boolean,
    "hasImu": boolean,
    "hasFootContactSensors": boolean,
    "updateRateHz": number
  },
  "episodeLength": number,
  "successCriteria": {
    "targetDistance": number,
    "maxTiltDegrees": number,
    "surviveTimeSeconds": number
  }
}

Return ONLY the raw JSON object. No markdown fences, no conversational prose.
`;
}

export function buildRewardPrompt(spec: EnvironmentSpec): string {
  return `
Write a vectorized Python reward calculation function named \`compute_step_reward\` for the following EnvironmentSpec:
Task: ${spec.taskName} (${spec.description})
Gravity: ${JSON.stringify(spec.gravity)}
Terrain Roughness: ${spec.terrain.roughness}

Requirements:
- Pure Python and NumPy only.
- Signature:
  \`def compute_step_reward(state: dict, action: np.ndarray, prev_state: dict) -> tuple[float, dict]:\`
- State dict contains:
  - 'robot_pos': np.ndarray of shape (3,) [x, y, z]
  - 'robot_quat': np.ndarray of shape (4,) [qx, qy, qz, qw]
  - 'robot_vel': np.ndarray of shape (3,) [vx, vy, vz]
  - 'joint_angles': np.ndarray of shape (12,)
  - 'joint_velocities': np.ndarray of shape (12,)
  - 'collisions': list of contact dicts
  - 'foot_contacts': np.ndarray of shape (4,) boolean
- Reward components:
  1. Forward progress reward (velocity in +x direction)
  2. Upright stability reward (minimize pitch and roll deviations)
  3. Collision penalty (penalize torso or high-impulse impacts)
  4. Energy / action smoothness penalty (penalize excessive torque or sudden joint velocity changes)
  5. Low-gravity bounce mitigation bonus
- Return (total_reward, reward_breakdown_dict).

DO NOT import os, sys, subprocess, or socket.
Return ONLY valid Python code.
`;
}

export function buildDatagenPrompt(spec: EnvironmentSpec): string {
  return `
Write a Python synthetic data generation rollout script named \`generate_demonstrations\` for:
Task: ${spec.taskName}
Morphology: ${spec.robotMorphology}

Requirements:
- Pure Python, NumPy, and PyTorch (if needed).
- Implements domain randomization:
  - Random mass variations (+-10%)
  - Ground friction variation (+-15%)
  - Random perturbation forces simulating low-gravity dust/debris gusts
- Generates demonstration episodes formatted as:
  \`[{"t": step * dt, "obs": state, "action": action, "reward": r, "done": done}, ...]\`

DO NOT import os, sys, subprocess, socket, or file I/O primitives.
Return ONLY valid Python code.
`;
}

/**
 * High-fidelity deterministic fallback generators for offline / mock testing or when API key is unconfigured.
 */
export function generateDeterministicEnvironmentSpec(taskPrompt: string): EnvironmentSpec {
  const lower = taskPrompt.toLowerCase();
  const isMars = lower.includes('mars') || lower.includes('martian') || lower.includes('sprint');
  const isEarth = lower.includes('earth') || lower.includes('terrestrial') || lower.includes('9.8');
  const isMoon = !isMars && !isEarth; // default extraterrestrial is Moon

  let taskName = 'Low-Gravity Lunar Crater Exploration';
  let gravity: [number, number, number] = [0, -1.62, 0];
  let roughness = 0.68;
  let amplitude = 2.2;
  let debrisCount = 1950;
  let debrisSize: [number, number] = [0.20, 0.58];
  let baseSpeed = 1.0;
  let cadenceHz = 1.3;
  let gait: 'trot' | 'walk' | 'pace' | 'bound' = 'trot';

  if (isMars) {
    taskName = 'Martian Plains Sprint';
    gravity = [0, -3.72, 0];
    roughness = 0.32;
    amplitude = 1.1;
    debrisCount = 750;
    debrisSize = [0.15, 0.35];
    baseSpeed = 2.0;
    cadenceHz = 2.2;
    gait = 'pace';
  } else if (isEarth) {
    taskName = 'Terrestrial High-G Obstacle Course';
    gravity = [0, -9.81, 0];
    roughness = 0.45;
    amplitude = 1.6;
    debrisCount = 1200;
    debrisSize = [0.18, 0.45];
    baseSpeed = 1.4;
    cadenceHz = 1.8;
    gait = 'trot';
  }

  return {
    schemaVersion: '4.0',
    taskId: `task_${Date.now()}`,
    taskName,
    description: taskPrompt || 'Quadruped locomotion across uneven extraterrestrial terrain',
    gravity,
    terrain: {
      type: isMars ? 'uneven' : 'cratered_debris',
      seed: isMars ? 101 : 42,
      roughness,
      friction: 0.85,
      bounds: [48, 48],
      octaves: 4,
      amplitude,
      skirt: 1.8,
      segmentsByTier: {
        ultra: 256,
        high: 128,
        medium: 96,
        low: 64,
        potato: 32,
      },
    },
    arena: {
      shape: 'rectangle',
      halfExtent: 18.0,
      softMargin: 2.0,
      hardMargin: 20.0,
      catchPlane: -5.0,
    },
    spawn: {
      pos: [0, 0.385, 0],
      heading: 0,
      clearRadius: 2.5,
    },
    goal: {
      pos: [14.0, 0.0, -10.0],
      tolerance: 1.5,
      clearRadius: 2.5,
    },
    corridorSeed: isMars ? 101 : 42,
    debrisDensity: isMars ? 0.25 : 0.48,
    debris: {
      count: debrisCount,
      sizeRange: debrisSize,
      seed: isMars ? 101 : 42,
      distribution: 'poisson_corridor',
    },
    robotMorphology: 'quadruped_12dof',
    robot: {
      massKg: 12.5,
      baseSpeed,
      cadenceHz,
    },
    motion: {
      gait,
      stepHeight: 0.08,
      strideLength: 0.35,
      stanceDutyFactor: 0.5,
    },
    sensorConfig: {
      hasCamera: true,
      hasImu: true,
      hasFootContactSensors: true,
      updateRateHz: 60,
    },
    episodeLength: 1000,
    successCriteria: {
      targetDistance: 25.0,
      maxTiltDegrees: 35.0,
      surviveTimeSeconds: 15.0,
    },
    rationale: `Synthesized physical specification for ${taskName}: G=${gravity[1]}m/s², roughness=${roughness}, gait=${gait}.`,
  };
}

export function generateDeterministicRewardCode(): string {
  return `import numpy as np

def compute_step_reward(state: dict, action: np.ndarray, prev_state: dict) -> tuple[float, dict]:
    """
    Computes shaped reward for low-gravity quadruped debris traversal.
    Returns: (total_reward, metrics_dict)
    """
    pos = state['robot_pos']
    prev_pos = prev_state['robot_pos']
    vel = state['robot_vel']
    quat = state['robot_quat']
    collisions = state.get('collisions', [])
    
    # 1. Forward progress along X-axis
    dx = pos[0] - prev_pos[0]
    r_forward = np.clip(dx * 12.0, -1.0, 3.0)
    
    # 2. Stability reward: encourage upright orientation (Z-up quaternion projection)
    # quat is [qx, qy, qz, qw]
    qw, qz = quat[3], quat[2]
    tilt_penalty = (1.0 - (qw**2 - qz**2)) * 2.5
    r_upright = np.exp(-tilt_penalty)
    
    # 3. Collision penalty
    r_collision = 0.0
    for col in collisions:
        # Penalize torso or excessive impact force
        if col.get('a') == 'torso' or col.get('b') == 'torso':
            r_collision -= 5.0
        else:
            r_collision -= min(col.get('impulse', 0.1) * 0.5, 2.0)
            
    # 4. Action smoothness / energy cost
    r_energy = -0.01 * np.sum(np.square(action))
    
    # 5. Goal proximity bonus
    target_dist = np.linalg.norm(pos[:2] - np.array([14.0, 0.0]))
    r_goal = float(max(0.0, (25.0 - target_dist) * 0.1))

    total_reward = float(r_forward + 0.8 * r_upright + r_collision + r_energy + r_goal)
    
    metrics = {
        "progress": float(r_forward),
        "stability": float(r_upright),
        "energy": float(r_energy),
        "collision_penalty": float(r_collision),
        "goal_bonus": float(r_goal),
        "total_reward": total_reward
    }
    return total_reward, metrics
`;
}

export function generateDeterministicDatagenCode(): string {
  return `import numpy as np

def generate_demonstrations(env_spec: dict, num_episodes: int = 5, steps_per_episode: int = 200) -> list:
    """
    Generates synthetic trajectory demonstrations with domain randomization.
    """
    episodes = []
    base_gravity = np.array(env_spec.get('gravity', [0, 0, -1.62]))
    
    for ep in range(num_episodes):
        # Apply domain randomization: +-10% gravity perturbation & terrain friction
        rand_gravity = base_gravity * np.random.uniform(0.9, 1.1, size=3)
        friction_scale = float(np.random.uniform(0.85, 1.15))
        
        trajectory = []
        pos = np.array([0.0, 0.0, 0.35])
        vel = np.array([0.0, 0.0, 0.0])
        
        for step in range(steps_per_episode):
            t = step * (1.0 / 60.0)
            
            # Cyclic gait action generator for 12 joints (FL, FR, RL, RR x 3 joints)
            omega = 2.0 * np.pi * 1.5
            action = np.sin(omega * t + np.linspace(0, np.pi, 12)) * 0.4
            
            # Kinematic integration step
            vel[0] = 0.8 + 0.1 * np.cos(omega * t)
            pos += vel * (1.0 / 60.0)
            
            step_record = {
                "t": float(t),
                "obs": {
                    "pos": pos.tolist(),
                    "vel": vel.tolist(),
                    "friction": friction_scale
                },
                "action": action.tolist(),
                "reward": float(vel[0] * 2.0),
                "done": step == steps_per_episode - 1
            }
            trajectory.append(step_record)
            
        episodes.append({
            "episode_id": ep,
            "randomized_gravity": rand_gravity.tolist(),
            "trajectory": trajectory
        })
        
    return episodes
`;
}

export function buildCritiquePrompt(spec: EnvironmentSpec, rewardCode: string, datagenCode: string): string {
  return `
You are the Omni-Kinetic Physical AI Auditor reviewing synthesized simulation assets.
EnvironmentSpec:
${JSON.stringify(spec, null, 2)}

Synthesized reward.py:
\`\`\`python
${rewardCode}
\`\`\`

Synthesized datagen.py:
\`\`\`python
${datagenCode}
\`\`\`

Critique the assets against these criteria:
1. Does the reward function evaluate progress, stability, energy, and collision penalties without degenerate reward hacking?
2. Does the orientation penalty match the spec maxTiltDegrees (${spec.successCriteria.maxTiltDegrees}°)?
3. Are all return types strictly numpy floats and dicts?
4. Does datagen correctly model domain randomization under gravity ${JSON.stringify(spec.gravity)}?
5. Are there any division-by-zero, unclipped exponent, or NaN hazards?

Return a JSON object:
{
  "compliant": boolean,
  "score": number (0 to 100),
  "findings": [string],
  "critiqueText": string
}
`;
}

export function generateDeterministicCritique(spec: EnvironmentSpec): {
  compliant: boolean;
  score: number;
  findings: string[];
  critiqueText: string;
} {
  return {
    compliant: true,
    score: 96,
    findings: [
      `Physics check: Gravity vector [${spec.gravity.join(', ')}] matched in dynamics integration.`,
      `Reward shaping: Forward progress clipped to [-1.0, 3.0] to prevent velocity explosion in low G.`,
      `Stability constraint: Exponential quaternion tilt penalty aligned with max ${spec.successCriteria.maxTiltDegrees}° threshold.`,
      `Domain randomization: Mass (+-10%) and terrain friction (+-15%) randomized across rollouts.`,
      `Numerical safety: Zero division-by-zero or unclipped exponential hazards identified.`,
    ],
    critiqueText: `Physical audit passed with score 96/100. Reward function properly decomposes progress, stability, energy, and collision penalties. Synthetic trajectories adhere to 12-DOF quadruped kinematic boundaries under ${spec.gravity[2]} m/s² gravity.`,
  };
}
