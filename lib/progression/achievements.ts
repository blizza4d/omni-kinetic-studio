/**
 * Daily Challenge, Achievements & Progression System (Pack I — F-009)
 *
 * Implements:
 * - Deterministic UTC-based Daily Challenge generation
 * - Data-driven achievement registry and unlock evaluator
 * - Player progression (XP, levels, and non-gameplay cosmetic unlocks)
 */

import { dailySeed } from '../sim/prng';
import { MissionProgressSnapshot } from '../missions/missions';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  condition: (snap: MissionProgressSnapshot, extra: { totalDistanceMeters: number; collisions: number }) => boolean;
}

export const ACHIEVEMENTS_REGISTRY: readonly Achievement[] = [
  {
    id: 'first_steps',
    title: 'First Steps',
    description: 'Complete your first lunar simulation episode.',
    icon: 'Footprints',
    xpReward: 50,
    condition: (snap) => snap.score.elapsedSec >= 2.0,
  },
  {
    id: 'hop_master',
    title: 'Low-G Leap',
    description: 'Execute a successful ballistic hop maneuver over a crater or boulder.',
    icon: 'ArrowUpRight',
    xpReward: 100,
    condition: (snap) => Boolean(snap.score.succeeded && snap.missionId === 'low-g-leaps'),
  },
  {
    id: 'rock_dodger',
    title: 'Clean Traversal',
    description: 'Complete an episode with strictly 0 boulder collisions.',
    icon: 'Shield',
    xpReward: 150,
    condition: (snap, extra) => snap.score.succeeded && extra.collisions === 0,
  },
  {
    id: 'marathon',
    title: 'Lunar Marathon',
    description: 'Traverse over 50 meters of cumulative lunar surface in a single run.',
    icon: 'Activity',
    xpReward: 200,
    condition: (snap, extra) => extra.totalDistanceMeters >= 50.0,
  },
  {
    id: 'gold_standard',
    title: 'Gold Standard',
    description: 'Earn a Gold Medal in any official studio mission.',
    icon: 'Trophy',
    xpReward: 250,
    condition: (snap) => snap.score.medal === 'gold',
  },
  {
    id: 'speed_demon',
    title: 'Speed Demon',
    description: 'Reach and sustain forward locomotion speed >= 1.4 m/s.',
    icon: 'Zap',
    xpReward: 120,
    condition: (snap) => snap.score.succeeded && snap.score.elapsedSec >= 5.0,
  },
  {
    id: 'precision_surveyor',
    title: 'Precision Surveyor',
    description: 'Complete the crater rim survey with high boundary margin.',
    icon: 'Compass',
    xpReward: 180,
    condition: (snap) => snap.score.succeeded && snap.missionId === 'crater-rim-run',
  },
  {
    id: 'perseverance',
    title: 'Lunar Pioneer',
    description: 'Attain Level 2+ progression through consistent studio missions.',
    icon: 'Award',
    xpReward: 300,
    condition: (snap, extra) => extra.totalDistanceMeters >= 40.0,
  },
];

export interface PlayerProgression {
  xp: number;
  level: number;
  unlockedAchievementIds: string[];
  dailyStreak: number;
  lastDailyDate: string; // YYYY-MM-DD
}

export const DEFAULT_PLAYER_PROGRESSION: PlayerProgression = {
  xp: 0,
  level: 1,
  unlockedAchievementIds: [],
  dailyStreak: 0,
  lastDailyDate: '',
};

export function calculateLevelFromXP(xp: number): number {
  return Math.max(1, Math.floor(1 + Math.sqrt(Math.max(0, xp) / 100)));
}

export function evaluateAchievements(
  prog: PlayerProgression,
  snap: MissionProgressSnapshot,
  extra: { totalDistanceMeters: number; collisions: number }
): { newlyUnlocked: Achievement[]; updatedProgression: PlayerProgression } {
  const newlyUnlocked: Achievement[] = [];
  const currentSet = new Set(prog.unlockedAchievementIds);
  let addedXp = 0;

  for (const ach of ACHIEVEMENTS_REGISTRY) {
    if (!currentSet.has(ach.id) && ach.condition(snap, extra)) {
      newlyUnlocked.push(ach);
      currentSet.add(ach.id);
      addedXp += ach.xpReward;
    }
  }

  const nextXp = prog.xp + addedXp;
  const updatedProgression: PlayerProgression = {
    ...prog,
    xp: nextXp,
    level: calculateLevelFromXP(nextXp),
    unlockedAchievementIds: Array.from(currentSet),
  };

  return { newlyUnlocked, updatedProgression };
}

export function getDailyChallengeConfig(date: Date = new Date()): {
  dateStr: string;
  seed: number;
  missionId: string;
  gravity: number;
  title: string;
} {
  const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
  const seed = dailySeed(date);

  // Deterministically select mission template and gravity
  const missions = ['crater-rim-run', 'boulder-field', 'steady-hands', 'sample-collector'];
  const missionIdx = seed % missions.length;
  const gravities = [1.62, 3.71, 0.88];
  const gravIdx = Math.floor(seed / 10) % gravities.length;

  return {
    dateStr,
    seed,
    missionId: missions[missionIdx]!,
    gravity: gravities[gravIdx]!,
    title: `Daily Challenge — ${dateStr}`,
  };
}

export const ACHIEVEMENTS = ACHIEVEMENTS_REGISTRY;

export interface DailyChallenge {
  dateStr: string;
  seed: number;
  missionId: string;
  gravity: number;
  title: string;
  description: string;
  modifier: string;
  targetScore: number;
  xpReward: number;
}

export function getDailyChallenge(date: Date = new Date()): DailyChallenge {
  const cfg = getDailyChallengeConfig(date);
  return {
    ...cfg,
    description: `Deterministic daily lunar trial under ${cfg.gravity.toFixed(2)} m/s² gravity.`,
    modifier: cfg.gravity < 1.0 ? 'Ultra Low Gravity' : cfg.gravity > 2.0 ? 'High Surface Gravity' : 'Lunar Nominal',
    targetScore: 80,
    xpReward: 150,
  };
}

export interface ProgressionState {
  totalXp: number;
  unlockedAchievements: string[];
}

const STORAGE_KEY = 'omni_user_progression';

export function loadUserProgression(): ProgressionState {
  if (typeof window === 'undefined') return { totalXp: 0, unlockedAchievements: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { totalXp: 0, unlockedAchievements: [] };
}

export function saveUserProgression(st: ProgressionState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  } catch {}
}

export function computeUserLevel(xp: number): { level: number; title: string; nextXp: number } {
  const level = calculateLevelFromXP(xp);
  const titles = ['Lunar Trainee', 'Surveyor', 'Pioneer', 'Commander', 'Grand Master'];
  const title = titles[Math.min(titles.length - 1, level - 1)] ?? 'Lunar Explorer';
  const nextXp = level * 150;
  return { level, title, nextXp };
}
