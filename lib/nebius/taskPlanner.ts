/**
 * Structured Nemotron Task Planner (Agentic Control)
 *
 * Translates natural language engineering goals into structured robotics trajectory plans:
 * - Deterministic schema with 3D waypoints, target speeds, and tolerances
 * - Rigorous safety envelope constraints (max pitch/roll, min obstacle clearance)
 * - Chain-of-thought robotics reasoning from NVIDIA Nemotron
 */

import { getNebiusClient, resolveNebiusModels } from './client';

export interface PlannerWaypoint {
  id: number;
  x: number;
  z: number;
  position: [number, number, number]; // [x, y, z] in meters (Single Frame: +X East, +Y Up, +Z South)
  target_speed: number; // m/s
  arrival_tolerance: number; // meters
  action?: 'survey' | 'scan_sample' | 'accelerate' | 'crouch_navigate' | 'halt';
}

export interface SafetyConstraints {
  max_speed: number; // m/s
  max_tilt_deg: number; // degrees
  max_pitch_deg: number;
  max_roll_deg: number;
  max_linear_vel: number;
  min_obstacle_clearance: number;
}

export interface NemotronTaskPlan {
  task_name: string;
  mission_summary: string;
  summary: string;
  waypoints: PlannerWaypoint[];
  safety_constraints: SafetyConstraints;
  reasoning: string;
  source: 'nemotron_live' | 'deterministic_fixture';
  modelUsed: string;
}

interface RawWaypointInput {
  id?: unknown;
  x?: unknown;
  z?: unknown;
  position?: unknown;
  target_speed?: unknown;
  arrival_tolerance?: unknown;
  action?: unknown;
}

interface RawPlannerResponse {
  task_name?: unknown;
  mission_summary?: unknown;
  summary?: unknown;
  waypoints?: unknown;
  safety_constraints?: {
    max_speed?: unknown;
    max_tilt_deg?: unknown;
    max_pitch_deg?: unknown;
    max_roll_deg?: unknown;
    max_linear_vel?: unknown;
    min_obstacle_clearance?: unknown;
  };
  reasoning?: unknown;
}

function asFiniteNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function parseAction(val: unknown): PlannerWaypoint['action'] {
  if (
    val === 'survey' ||
    val === 'scan_sample' ||
    val === 'accelerate' ||
    val === 'crouch_navigate' ||
    val === 'halt'
  ) {
    return val;
  }
  return 'survey';
}

export const PLANNER_PRESETS = [
  {
    label: 'Survey Western Boulders',
    prompt: 'Survey western boulder cluster while maintaining >= 0.8m clearance from obstacles and maximum roll stability.',
  },
  {
    label: 'High-Speed Crater Ridge Sprint',
    prompt: 'Traverse directly to crater ridge at maximum velocity (1.4 m/s) with dynamic pitch damping.',
  },
  {
    label: 'Precision Perimeter Scan',
    prompt: 'Patrol 12m perimeter boundary, stopping at 4 cardinal observation points to scan terrain regolith.',
  },
];

export function generateDeterministicPlan(
  prompt: string,
  currentPose: [number, number, number] = [0, 0.44, 0]
): NemotronTaskPlan {
  const pLower = prompt.toLowerCase();
  const [cx, cy, cz] = currentPose;

  if (pLower.includes('west') || pLower.includes('boulder')) {
    const missionSummary = 'Perimeter exploration avoiding western hazard field with high safety margin.';
    return {
      task_name: 'Western Boulder Cluster Survey',
      mission_summary: missionSummary,
      summary: missionSummary,
      waypoints: [
        { id: 1, x: cx - 3.5, z: cz + 2.0, position: [cx - 3.5, cy, cz + 2.0], target_speed: 0.65, arrival_tolerance: 0.4, action: 'scan_sample' },
        { id: 2, x: cx - 7.0, z: cz + 0.5, position: [cx - 7.0, cy, cz + 0.5], target_speed: 0.80, arrival_tolerance: 0.5, action: 'crouch_navigate' },
        { id: 3, x: cx - 10.5, z: cz - 2.5, position: [cx - 10.5, cy, cz - 2.5], target_speed: 0.55, arrival_tolerance: 0.3, action: 'survey' },
        { id: 4, x: cx - 6.0, z: cz - 4.0, position: [cx - 6.0, cy, cz - 4.0], target_speed: 0.70, arrival_tolerance: 0.5, action: 'halt' },
      ],
      safety_constraints: {
        max_speed: 0.85,
        max_tilt_deg: 18.0,
        max_pitch_deg: 18.0,
        max_roll_deg: 15.0,
        max_linear_vel: 0.85,
        min_obstacle_clearance: 0.80,
      },
      reasoning: 'Calculated path avoids high-density boulder region at [-5, 0]. Kept speed <= 0.85 m/s to prevent slip on lunar regolith.',
      source: 'deterministic_fixture',
      modelUsed: 'deterministic-planner-v1',
    };
  }

  if (pLower.includes('sprint') || pLower.includes('crater') || pLower.includes('ridge')) {
    const missionSummary = 'Direct sprint to elevated crater rim maintaining forward momentum.';
    return {
      task_name: 'Crater Ridge Sprint Trajectory',
      mission_summary: missionSummary,
      summary: missionSummary,
      waypoints: [
        { id: 1, x: cx + 4.0, z: cz - 1.0, position: [cx + 4.0, cy, cz - 1.0], target_speed: 1.10, arrival_tolerance: 0.6, action: 'accelerate' },
        { id: 2, x: cx + 9.0, z: cz - 2.0, position: [cx + 9.0, cy + 0.3, cz - 2.0], target_speed: 1.35, arrival_tolerance: 0.6, action: 'accelerate' },
        { id: 3, x: cx + 14.0, z: cz - 1.5, position: [cx + 14.0, cy + 0.6, cz - 1.5], target_speed: 0.90, arrival_tolerance: 0.4, action: 'survey' },
      ],
      safety_constraints: {
        max_speed: 1.40,
        max_tilt_deg: 24.0,
        max_pitch_deg: 24.0,
        max_roll_deg: 18.0,
        max_linear_vel: 1.40,
        min_obstacle_clearance: 0.45,
      },
      reasoning: 'Smooth ascent profile following natural terrain contour. Gradual speed taper at waypoint 3 to prevent overshoot over rim catch-plane.',
      source: 'deterministic_fixture',
      modelUsed: 'deterministic-planner-v1',
    };
  }

  // Default perimeter patrol
  const defaultSummary = 'Square patrol circuit sampling 4 cardinal quadrants with perimeter clearance.';
  return {
    task_name: 'Cardinal Perimeter Autonomous Patrol',
    mission_summary: defaultSummary,
    summary: defaultSummary,
    waypoints: [
      { id: 1, x: cx + 5.0, z: cz, position: [cx + 5.0, cy, cz], target_speed: 0.90, arrival_tolerance: 0.5, action: 'scan_sample' },
      { id: 2, x: cx + 5.0, z: cz + 5.0, position: [cx + 5.0, cy, cz + 5.0], target_speed: 0.85, arrival_tolerance: 0.5, action: 'survey' },
      { id: 3, x: cx, z: cz + 5.0, position: [cx, cy, cz + 5.0], target_speed: 0.85, arrival_tolerance: 0.5, action: 'scan_sample' },
      { id: 4, x: cx, z: cz, position: [cx, cy, cz], target_speed: 0.60, arrival_tolerance: 0.3, action: 'halt' },
    ],
    safety_constraints: {
      max_speed: 1.00,
      max_tilt_deg: 20.0,
      max_pitch_deg: 20.0,
      max_roll_deg: 20.0,
      max_linear_vel: 1.00,
      min_obstacle_clearance: 0.50,
    },
    reasoning: 'Established 4-waypoint closed circuit with 5m radius. All waypoints maintain > 10m margin to the 20m arena boundary.',
    source: 'deterministic_fixture',
    modelUsed: 'deterministic-planner-v1',
  };
}

export async function planRoboticsTaskWithNemotron(
  prompt: string,
  currentPose: [number, number, number] = [0, 0.44, 0]
): Promise<NemotronTaskPlan> {
  const client = getNebiusClient();
  if (!client) {
    return generateDeterministicPlan(prompt, currentPose);
  }

  try {
    const models = await resolveNebiusModels();
    const systemPrompt = `You are the NVIDIA Nemotron Autonomous Task Planner for a 12-DOF lunar exploration quadruped.
Current Robot Pose: [${currentPose[0].toFixed(2)}, ${currentPose[1].toFixed(2)}, ${currentPose[2].toFixed(2)}]
Arena: 20m radius crater arena with regolith slope and scattered boulders.

Given an engineering task prompt, generate a structured robotics navigation plan.
Output MUST be strict JSON with no markdown formatting:
{
  "task_name": "string",
  "mission_summary": "string",
  "safety_constraints": {
    "max_speed": number,
    "max_tilt_deg": number,
    "max_pitch_deg": number,
    "max_roll_deg": number,
    "min_obstacle_clearance": number
  },
  "waypoints": [
    { "id": 1, "x": number, "z": number, "target_speed": number, "arrival_tolerance": number, "action": "survey" | "scan_sample" | "accelerate" | "crouch_navigate" | "halt" }
  ],
  "reasoning": "string"
}`;

    const completion = await client.chat.completions.create({
      model: models.reasoningModel || 'nvidia/Nemotron-3-Ultra-550b-a55b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Task Prompt: "${prompt}"` },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });

    const content = completion.choices[0]?.message?.content || '';
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson) as RawPlannerResponse;
    const rawWaypoints = Array.isArray(parsed.waypoints) ? (parsed.waypoints as RawWaypointInput[]) : [];

    const maxSpeed = asFiniteNumber(
      parsed.safety_constraints?.max_speed ?? parsed.safety_constraints?.max_linear_vel,
      1.2
    );
    const maxTiltDeg = asFiniteNumber(
      parsed.safety_constraints?.max_tilt_deg ?? parsed.safety_constraints?.max_pitch_deg,
      20
    );
    const missionSummary =
      (typeof parsed.mission_summary === 'string' && parsed.mission_summary) ||
      (typeof parsed.summary === 'string' && parsed.summary) ||
      'Generated trajectory plan';

    return {
      task_name: typeof parsed.task_name === 'string' && parsed.task_name ? parsed.task_name : 'Autonomous Trajectory Plan',
      mission_summary: missionSummary,
      summary: missionSummary,
      waypoints: rawWaypoints.map((w, idx) => {
        const posArr = Array.isArray(w.position) ? w.position : [];
        const x = asFiniteNumber(w.x ?? posArr[0], currentPose[0]);
        const y = asFiniteNumber(posArr[1], currentPose[1]);
        const z = asFiniteNumber(w.z ?? posArr[2], currentPose[2]);
        return {
          id: asFiniteNumber(w.id, idx + 1),
          x,
          z,
          position: [x, y, z],
          target_speed: Math.min(maxSpeed, asFiniteNumber(w.target_speed, 0.8)),
          arrival_tolerance: asFiniteNumber(w.arrival_tolerance, 0.5),
          action: parseAction(w.action),
        };
      }),
      safety_constraints: {
        max_speed: maxSpeed,
        max_tilt_deg: maxTiltDeg,
        max_pitch_deg: asFiniteNumber(parsed.safety_constraints?.max_pitch_deg, maxTiltDeg),
        max_roll_deg: asFiniteNumber(parsed.safety_constraints?.max_roll_deg, maxTiltDeg),
        max_linear_vel: maxSpeed,
        min_obstacle_clearance: asFiniteNumber(parsed.safety_constraints?.min_obstacle_clearance, 0.6),
      },
      reasoning:
        typeof parsed.reasoning === 'string' && parsed.reasoning
          ? parsed.reasoning
          : 'Nemotron reasoned trajectory plan.',
      source: 'nemotron_live',
      modelUsed: models.reasoningModel,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[NemotronPlanner] Live model query failed; falling back to deterministic fixture:', msg);
    return generateDeterministicPlan(prompt, currentPose);
  }
}
