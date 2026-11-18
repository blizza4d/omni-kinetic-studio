/**
 * Missions Framework & Deterministic Scoring Engine (Phase W7)
 *
 * Ships 6 fully playable, deterministic lunar missions with typed objectives,
 * constraints, transparent score breakdowns, medal thresholds, and assist tracking.
 */

import { z } from 'zod';

export type ObjectiveKind =
  | 'reach_ordered'
  | 'collect_any'
  | 'hold_stable'
  | 'traverse_slope'
  | 'hop_cross'
  | 'return_base';

export type MedalTier = 'none' | 'bronze' | 'silver' | 'gold';

export interface MissionMarker {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  kind: 'beacon' | 'sample' | 'trench' | 'base';
  requireHop?: boolean;
}

export interface MissionDefinition {
  id: string;
  title: string;
  subtitle: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  seed: number;
  gravity: number; // m/s^2
  rockCount: number;
  timeLimitSec: number;
  parTimeSec: number;
  energyBudgetJ?: number;
  maxTiltDeg?: number;
  noCollisions?: boolean;
  noHops?: boolean;
  startPos: [number, number];
  startHeading: number;
  objectiveKind: ObjectiveKind;
  markers: MissionMarker[];
  medals: {
    bronze: number;
    silver: number;
    gold: number;
  };
  coachTip: string;
}

export interface MissionScoreBreakdown {
  total: number;
  medal: MedalTier;
  timeBonus: number;
  objectiveBonus: number;
  efficiencyBonus: number;
  smoothnessBonus: number;
  penalties: number;
  noAssistBonus: number;
  completedObjectives: number;
  totalObjectives: number;
  elapsedSec: number;
  distanceMeters: number;
  energyJoules: number;
  collisions: number;
  edgeWarnings: number;
  falls: number;
  maxTiltDeg: number;
  assistsUsed: string[];
  failedReason: string | null;
  succeeded: boolean;
}

export interface MissionProgressSnapshot {
  missionId: string;
  missionTitle: string;
  active: boolean;
  completedIds: string[];
  nextMarker: MissionMarker | null;
  distanceToNextM: number | null;
  bearingToNextRad: number | null;
  completedCount: number;
  totalCount: number;
  status: 'running' | 'succeeded' | 'failed';
  failedReason: string | null;
  score: MissionScoreBreakdown;
}

export const MissionDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  seed: z.number().int(),
  gravity: z.number().positive(),
  rockCount: z.number().int().min(0).max(2000),
  timeLimitSec: z.number().min(10).max(600),
  parTimeSec: z.number().min(5).max(600),
  startPos: z.tuple([z.number(), z.number()]),
  startHeading: z.number(),
  objectiveKind: z.enum([
    'reach_ordered',
    'collect_any',
    'hold_stable',
    'traverse_slope',
    'hop_cross',
    'return_base',
  ]),
  markers: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      x: z.number(),
      z: z.number(),
      radius: z.number().positive(),
      kind: z.enum(['beacon', 'sample', 'trench', 'base']),
      requireHop: z.boolean().optional(),
    })
  ),
  medals: z.object({
    bronze: z.number(),
    silver: z.number(),
    gold: z.number(),
  }),
  coachTip: z.string(),
});

export const BUILT_IN_MISSIONS: MissionDefinition[] = [
  {
    id: 'first-steps',
    title: 'First Steps',
    subtitle: 'Take manual control (T) and navigate three lunar survey beacons in sequence.',
    difficulty: 'Beginner',
    seed: 42,
    gravity: 1.62,
    rockCount: 900,
    timeLimitSec: 60,
    parTimeSec: 22,
    startPos: [0, 0],
    startHeading: 0.62,
    objectiveKind: 'reach_ordered',
    markers: [
      { id: 'b1', label: 'Beacon Alpha', x: 5.5, z: -3.5, radius: 1.4, kind: 'beacon' },
      { id: 'b2', label: 'Beacon Beta', x: 10.5, z: -7.0, radius: 1.4, kind: 'beacon' },
      { id: 'b3', label: 'Beacon Gamma', x: 14.0, z: -10.0, radius: 1.5, kind: 'beacon' },
    ],
    medals: { bronze: 550, silver: 780, gold: 920 },
    coachTip: 'Press T to drive with WASD, or click directly on the lunar terrain to set a waypoint.',
  },
  {
    id: 'crater-rim-run',
    title: 'Crater Rim Run',
    subtitle: 'High-speed time trial racing clockwise around the crater perimeter.',
    difficulty: 'Intermediate',
    seed: 108,
    gravity: 1.62,
    rockCount: 1200,
    timeLimitSec: 75,
    parTimeSec: 34,
    startPos: [0, 0],
    startHeading: 0.0,
    objectiveKind: 'reach_ordered',
    markers: [
      { id: 'r1', label: 'North Rim', x: 9.0, z: -8.0, radius: 1.5, kind: 'beacon' },
      { id: 'r2', label: 'East Ridge', x: 11.5, z: 3.5, radius: 1.5, kind: 'beacon' },
      { id: 'r3', label: 'South Rim', x: 2.0, z: 11.0, radius: 1.5, kind: 'beacon' },
      { id: 'r4', label: 'West Overlook', x: -9.5, z: 5.5, radius: 1.5, kind: 'beacon' },
      { id: 'r5', label: 'Finish Gate', x: -2.0, z: -5.0, radius: 1.6, kind: 'base' },
    ],
    medals: { bronze: 580, silver: 800, gold: 940 },
    coachTip: 'Hold Shift to engage lunar bounding gait on straight segments.',
  },
  {
    id: 'sample-collector',
    title: 'Sample Collector',
    subtitle: 'Gather 5 regolith core samples in any order while staying under the energy budget.',
    difficulty: 'Intermediate',
    seed: 77,
    gravity: 1.62,
    rockCount: 1100,
    timeLimitSec: 80,
    parTimeSec: 38,
    energyBudgetJ: 55,
    startPos: [0, 0],
    startHeading: 0.3,
    objectiveKind: 'collect_any',
    markers: [
      { id: 's1', label: 'Sample 01', x: 6.0, z: -2.0, radius: 1.3, kind: 'sample' },
      { id: 's2', label: 'Sample 02', x: 9.5, z: 5.5, radius: 1.3, kind: 'sample' },
      { id: 's3', label: 'Sample 03', x: -4.5, z: 7.5, radius: 1.3, kind: 'sample' },
      { id: 's4', label: 'Sample 04', x: -8.0, z: -4.0, radius: 1.3, kind: 'sample' },
      { id: 's5', label: 'Sample 05', x: 3.0, z: -10.5, radius: 1.3, kind: 'sample' },
    ],
    medals: { bronze: 600, silver: 810, gold: 950 },
    coachTip: 'Plan a short loop to conserve energy—walk/trot uses less energy than sprinting.',
  },
  {
    id: 'boulder-field',
    title: 'Boulder Field',
    subtitle: 'Thread a dense ejecta boulder corridor without a single chassis impact.',
    difficulty: 'Advanced',
    seed: 256,
    gravity: 1.62,
    rockCount: 1800,
    timeLimitSec: 70,
    parTimeSec: 32,
    noCollisions: true,
    startPos: [-10, 8],
    startHeading: 0.65,
    objectiveKind: 'reach_ordered',
    markers: [
      { id: 'bf1', label: 'Entry Gate', x: -4.0, z: 3.0, radius: 1.4, kind: 'beacon' },
      { id: 'bf2', label: 'Mid Slalom', x: 3.0, z: -2.5, radius: 1.4, kind: 'beacon' },
      { id: 'bf3', label: 'Extraction Pad', x: 11.0, z: -9.5, radius: 1.6, kind: 'base' },
    ],
    medals: { bronze: 600, silver: 820, gold: 960 },
    coachTip: 'Use J/L (or Shift+A/D) to strafe tightly around boulders, or toggle LiDAR overlay.',
  },
  {
    id: 'steady-hands',
    title: 'Steady Hands',
    subtitle: 'Transport a delicate seismometer across crater slopes keeping tilt under 18°.',
    difficulty: 'Intermediate',
    seed: 314,
    gravity: 1.62,
    rockCount: 1000,
    timeLimitSec: 65,
    parTimeSec: 30,
    maxTiltDeg: 18,
    startPos: [-8, -6],
    startHeading: -0.3,
    objectiveKind: 'traverse_slope',
    markers: [
      { id: 'sh1', label: 'Ridge Crest', x: 0.0, z: -3.5, radius: 1.5, kind: 'beacon' },
      { id: 'sh2', label: 'Basin Floor', x: 7.5, z: 2.0, radius: 1.5, kind: 'beacon' },
      { id: 'sh3', label: 'Seismic Pad', x: 12.0, z: 7.5, radius: 1.6, kind: 'base' },
    ],
    medals: { bronze: 580, silver: 800, gold: 940 },
    coachTip: 'Hold C to crouch and lower your center of mass on steep slopes.',
  },
  {
    id: 'low-g-leaps',
    title: 'Low-G Leaps',
    subtitle: 'Charge and release Space to bound across three lunar survey trenches in low gravity.',
    difficulty: 'Advanced',
    seed: 512,
    gravity: 1.62,
    rockCount: 850,
    timeLimitSec: 65,
    parTimeSec: 28,
    startPos: [-10, 0],
    startHeading: 0.0,
    objectiveKind: 'hop_cross',
    markers: [
      { id: 'lg1', label: 'Trench Jump 1', x: -3.0, z: 0.0, radius: 2.0, kind: 'trench', requireHop: true },
      { id: 'lg2', label: 'Trench Jump 2', x: 4.0, z: -2.0, radius: 2.0, kind: 'trench', requireHop: true },
      { id: 'lg3', label: 'Landing Zone', x: 11.5, z: -4.0, radius: 1.8, kind: 'base', requireHop: false },
    ],
    medals: { bronze: 600, silver: 830, gold: 960 },
    coachTip: 'Hold Space up to 0.6s to charge a high lunar leap, then release while moving forward!',
  },
];

export function getMissionById(id: string): MissionDefinition | undefined {
  return BUILT_IN_MISSIONS.find((m) => m.id === id);
}

export class MissionRuntime {
  private mission: MissionDefinition;
  private completedSet = new Set<string>();
  private status: 'running' | 'succeeded' | 'failed' = 'running';
  private failedReason: string | null = null;
  private elapsedSec = 0;
  private distanceMeters = 0;
  private energyJoules = 0;
  private collisions = 0;
  private edgeWarnings = 0;
  private falls = 0;
  private maxTiltDeg = 0;
  private jerkSqSum = 0;
  private jerkSamples = 0;
  private prevSpeed = 0;
  private assistsUsed = new Set<string>();
  private wasHoppingNearMarker = false;

  constructor(mission: MissionDefinition = BUILT_IN_MISSIONS[0]) {
    this.mission = mission;
  }

  public loadMission(mission: MissionDefinition): void {
    this.mission = mission;
    this.reset();
  }

  public getMission(): MissionDefinition {
    return this.mission;
  }

  public reset(): void {
    this.completedSet.clear();
    this.status = 'running';
    this.failedReason = null;
    this.elapsedSec = 0;
    this.distanceMeters = 0;
    this.energyJoules = 0;
    this.collisions = 0;
    this.edgeWarnings = 0;
    this.falls = 0;
    this.maxTiltDeg = 0;
    this.jerkSqSum = 0;
    this.jerkSamples = 0;
    this.prevSpeed = 0;
    this.assistsUsed.clear();
    this.wasHoppingNearMarker = false;
  }

  public registerAssist(name: string): void {
    this.assistsUsed.add(name);
  }

  public getNextMarker(px: number, pz: number): MissionMarker | null {
    if (this.mission.objectiveKind === 'collect_any') {
      let best: MissionMarker | null = null;
      let bestDist = Infinity;
      for (const m of this.mission.markers) {
        if (this.completedSet.has(m.id)) continue;
        const d = Math.hypot(m.x - px, m.z - pz);
        if (d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
      return best;
    }

    for (const m of this.mission.markers) {
      if (!this.completedSet.has(m.id)) return m;
    }
    return null;
  }

  public step(params: {
    x: number;
    z: number;
    heading: number;
    speed: number;
    tiltDeg: number;
    hopActive: boolean;
    collided: boolean;
    edgeWarn: boolean;
    fallen: boolean;
    energyDeltaJ: number;
    dt: number;
  }): MissionProgressSnapshot {
    if (this.status === 'running') {
      this.elapsedSec += params.dt;
      this.distanceMeters += params.speed * params.dt;
      this.energyJoules += Math.max(0, params.energyDeltaJ);
      if (params.collided) this.collisions++;
      if (params.edgeWarn) this.edgeWarnings++;
      if (params.fallen) this.falls++;
      if (params.tiltDeg > this.maxTiltDeg) this.maxTiltDeg = params.tiltDeg;

      const accel = (params.speed - this.prevSpeed) / Math.max(params.dt, 1e-4);
      this.prevSpeed = params.speed;
      this.jerkSqSum += accel * accel;
      this.jerkSamples++;

      // Check constraints
      if (this.mission.noCollisions && this.collisions > 0) {
        this.status = 'failed';
        this.failedReason = 'Collision constraint violated (0 collisions required).';
      } else if (this.mission.maxTiltDeg && params.tiltDeg > this.mission.maxTiltDeg + 4.0) {
        this.status = 'failed';
        this.failedReason = `Tilt limit exceeded (${params.tiltDeg.toFixed(1)}° > ${this.mission.maxTiltDeg}°).`;
      } else if (this.mission.energyBudgetJ && this.energyJoules > this.mission.energyBudgetJ) {
        this.status = 'failed';
        this.failedReason = `Energy budget exceeded (${this.energyJoules.toFixed(1)} J > ${this.mission.energyBudgetJ} J).`;
      } else if (this.elapsedSec >= this.mission.timeLimitSec) {
        this.status = 'failed';
        this.failedReason = `Time limit reached (${this.mission.timeLimitSec}s).`;
      }

      // Check objective markers
      if (this.status === 'running') {
        const checkMarkers =
          this.mission.objectiveKind === 'collect_any'
            ? this.mission.markers.filter((m) => !this.completedSet.has(m.id))
            : (() => {
                const next = this.getNextMarker(params.x, params.z);
                return next ? [next] : [];
              })();

        for (const m of checkMarkers) {
          const dist = Math.hypot(m.x - params.x, m.z - params.z);
          if (dist <= m.radius) {
            if (m.requireHop) {
              if (params.hopActive) this.wasHoppingNearMarker = true;
              if (this.wasHoppingNearMarker || params.hopActive) {
                this.completedSet.add(m.id);
                this.wasHoppingNearMarker = false;
              }
            } else {
              this.completedSet.add(m.id);
            }
          }
        }

        if (this.completedSet.size >= this.mission.markers.length) {
          this.status = 'succeeded';
        }
      }
    }

    return this.snapshot(params.x, params.z, params.heading);
  }

  public computeScore(): MissionScoreBreakdown {
    const totalObj = Math.max(1, this.mission.markers.length);
    const doneObj = this.completedSet.size;
    const objectiveBonus = Math.round((doneObj / totalObj) * 500);

    const timeRatio = Math.max(
      0,
      Math.min(1, (this.mission.timeLimitSec - this.elapsedSec) / Math.max(1, this.mission.timeLimitSec - this.mission.parTimeSec * 0.5))
    );
    const timeBonus = this.status === 'succeeded' ? Math.round(250 * timeRatio) : 0;

    // Efficiency bonus
    const idealEnergy = this.mission.energyBudgetJ ?? 60;
    const effRatio = Math.max(0, Math.min(1, 1 - this.energyJoules / (idealEnergy * 1.4)));
    const efficiencyBonus = this.status === 'succeeded' ? Math.round(120 * effRatio) : 0;

    // Smoothness (style) bonus from RMS acceleration proxy
    const rmsAccel = this.jerkSamples > 0 ? Math.sqrt(this.jerkSqSum / this.jerkSamples) : 0;
    const smoothnessBonus = Math.round(Math.max(0, Math.min(1, 1 - rmsAccel / 12)) * 80);

    // No-assists bonus
    const assists = Array.from(this.assistsUsed);
    const noAssistBonus = this.status === 'succeeded' && assists.length === 0 ? 50 : 0;

    const penalties = this.collisions * 75 + this.falls * 120 + this.edgeWarnings * 10;
    const total = Math.max(0, objectiveBonus + timeBonus + efficiencyBonus + smoothnessBonus + noAssistBonus - penalties);

    let medal: MedalTier = 'none';
    if (this.status === 'succeeded') {
      if (total >= this.mission.medals.gold && assists.length === 0) medal = 'gold';
      else if (total >= this.mission.medals.silver) medal = 'silver';
      else if (total >= this.mission.medals.bronze) medal = 'bronze';
    }

    return {
      total,
      medal,
      timeBonus,
      objectiveBonus,
      efficiencyBonus,
      smoothnessBonus,
      penalties,
      noAssistBonus,
      completedObjectives: doneObj,
      totalObjectives: totalObj,
      elapsedSec: Number(this.elapsedSec.toFixed(2)),
      distanceMeters: Number(this.distanceMeters.toFixed(2)),
      energyJoules: Number(this.energyJoules.toFixed(2)),
      collisions: this.collisions,
      edgeWarnings: this.edgeWarnings,
      falls: this.falls,
      maxTiltDeg: Number(this.maxTiltDeg.toFixed(1)),
      assistsUsed: assists,
      failedReason: this.failedReason,
      succeeded: this.status === 'succeeded',
    };
  }

  public snapshot(px: number, pz: number, heading: number): MissionProgressSnapshot {
    const next = this.getNextMarker(px, pz);
    const dist = next ? Math.hypot(next.x - px, next.z - pz) : null;
    let bearing: number | null = null;
    if (next) {
      const targetHeading = Math.atan2(-(next.z - pz), next.x - px);
      const diff = targetHeading - heading;
      bearing = Math.atan2(Math.sin(diff), Math.cos(diff));
    }

    return {
      missionId: this.mission.id,
      missionTitle: this.mission.title,
      active: true,
      completedIds: Array.from(this.completedSet),
      nextMarker: next,
      distanceToNextM: dist !== null ? Number(dist.toFixed(2)) : null,
      bearingToNextRad: bearing,
      completedCount: this.completedSet.size,
      totalCount: this.mission.markers.length,
      status: this.status,
      failedReason: this.failedReason,
      score: this.computeScore(),
    };
  }
}
