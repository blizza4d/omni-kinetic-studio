/**
 * SimAdapter Architecture (Iteration 6)
 * Explicit, typed representation of simulation adapters enforcing strict Truth-in-UI.
 * Documented in /docs/SIM_DECISION.md
 */

export interface SimAdapterMetadata {
  id: 'local_kinematics' | 'nebius_serverless' | 'mujoco' | 'groot' | 'cosmos';
  name: string;
  category: 'physics_engine' | 'cloud_runner' | 'foundation_model';
  status: 'active' | 'not_run' | 'stub';
  hardwareRequirement: string;
  uiBadge: string;
  description: string;
  truthTableStatus: 'Live' | 'Cached' | 'Not Run';
}

export const REGISTERED_SIM_ADAPTERS: Record<string, SimAdapterMetadata> = {
  local_kinematics: {
    id: 'local_kinematics',
    name: 'Authoritative Controller Core',
    category: 'physics_engine',
    status: 'active',
    hardwareRequirement: 'Client CPU / Web Worker',
    uiBadge: 'DEMO: LOCAL RUNNER',
    description: 'Deterministic 60 Hz TypeScript kinematics, 2-link IK, and terrain grounding.',
    truthTableStatus: 'Live',
  },
  nebius_serverless: {
    id: 'nebius_serverless',
    name: 'Nebius Serverless L40S Jobs',
    category: 'cloud_runner',
    status: 'active',
    hardwareRequirement: '1x NVIDIA L40S 48GB GPU',
    uiBadge: 'CLOUD: NEBIUS L40S',
    description: 'Headless batch simulation in pinned container streaming chunked JSONL to S3.',
    truthTableStatus: 'Live',
  },
  mujoco: {
    id: 'mujoco',
    name: 'MuJoCo Physics Engine',
    category: 'physics_engine',
    status: 'active',
    hardwareRequirement: 'Linux / Container x86_64',
    uiBadge: 'MUJOCO RUNNER',
    description: 'Continuous rigid-body dynamics solver for multi-body contact.',
    truthTableStatus: 'Live',
  },
  groot: {
    id: 'groot',
    name: 'NVIDIA Isaac GR00T Foundation Model',
    category: 'foundation_model',
    status: 'not_run',
    hardwareRequirement: 'NVIDIA A100/H100 80GB SXM5 + Isaac Sim',
    uiBadge: 'NOT RUN IN THIS BUILD',
    description: 'Generalist robot embodiment foundation model interface stub. Infeasible within hackathon constraints.',
    truthTableStatus: 'Not Run',
  },
  cosmos: {
    id: 'cosmos',
    name: 'NVIDIA Cosmos World Foundation Model',
    category: 'foundation_model',
    status: 'not_run',
    hardwareRequirement: 'NVIDIA L40S/H100 48GB+ (TensorRT-LLM)',
    uiBadge: 'NOT RUN IN THIS BUILD',
    description: 'Diffusion physical AI world simulator interface stub for observation augmentation.',
    truthTableStatus: 'Not Run',
  },
};

export function getSimAdapter(id: string): SimAdapterMetadata {
  return REGISTERED_SIM_ADAPTERS[id] || REGISTERED_SIM_ADAPTERS.local_kinematics;
}

export function listSimAdapters(): SimAdapterMetadata[] {
  return Object.values(REGISTERED_SIM_ADAPTERS);
}
