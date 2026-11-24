'use client';

import React, { useState, useEffect } from 'react';
import { X, Trophy, Calendar, Award, Star, CheckCircle, Shield } from 'lucide-react';
import {
  getDailyChallenge,
  ACHIEVEMENTS,
  computeUserLevel,
  loadUserProgression,
  DailyChallenge,
  ProgressionState,
} from '@/lib/progression/achievements';

interface DailyChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChallenge?: (challenge: DailyChallenge) => void;
}

export function DailyChallengeModal({ isOpen, onClose, onStartChallenge }: DailyChallengeModalProps) {
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [progression, setProgression] = useState<ProgressionState | null>(null);

  useEffect(() => {
    if (isOpen) {
      setChallenge(getDailyChallenge());
      setProgression(loadUserProgression());
    }
  }, [isOpen]);

  if (!isOpen || !challenge) return null;

  const userLevel = progression ? computeUserLevel(progression.totalXp) : { level: 1, title: 'Lunar Trainee', nextXp: 100 };
  const xpProgressPct = progression
    ? Math.min(100, Math.round((progression.totalXp / (userLevel.nextXp || 100)) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-deep/80 backdrop-blur-sm select-none font-mono text-xs">
      <div className="w-full max-w-xl bg-charcoal border border-cream/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-cream animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream/10 bg-charcoal-deep/60">
          <div className="flex items-center space-x-2.5">
            <Trophy className="w-4 h-4 text-sage" />
            <span className="font-bold text-sm tracking-wide uppercase">Daily Challenge & Achievements</span>
            <span className="text-[10px] bg-sage/20 text-sage px-1.5 py-0.5 rounded border border-sage/40">
              PACK I ★
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-cream-dim hover:text-cream hover:bg-charcoal-light transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Daily Challenge Card */}
          <div className="p-4 rounded-xl bg-charcoal-deep/90 border border-sage/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sage font-bold flex items-center space-x-1.5 text-xs">
                <Calendar className="w-3.5 h-3.5" />
                <span>Today&apos;s UTC Challenge: {challenge.dateStr}</span>
              </span>
              <span className="text-[10px] bg-sage/20 text-cream px-2 py-0.5 rounded border border-sage/40 font-bold">
                +{challenge.xpReward} XP
              </span>
            </div>

            <div>
              <div className="font-bold text-base text-cream">{challenge.title}</div>
              <div className="text-[11px] text-cream-dim mt-1 leading-relaxed">{challenge.description}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 border-t border-cream/10">
              <div className="bg-charcoal p-2 rounded border border-cream/10">
                <span className="text-cream-dim block">Modifier</span>
                <span className="text-cream font-bold">{challenge.modifier}</span>
              </div>
              <div className="bg-charcoal p-2 rounded border border-cream/10">
                <span className="text-cream-dim block">Target Objective</span>
                <span className="text-cream font-bold tabular-nums">Score ≥ {challenge.targetScore} pts</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onStartChallenge) onStartChallenge(challenge);
                onClose();
              }}
              className="w-full py-2 rounded-lg bg-sage hover:bg-sage-light text-cream font-bold flex items-center justify-center space-x-2 text-xs shadow-md shadow-sage/20 transition-all"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Launch Daily Challenge (Seed #{challenge.seed})</span>
            </button>
          </div>

          {/* XP & Level Status */}
          <div className="bg-charcoal-deep/70 p-4 rounded-xl border border-cream/10 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-cream flex items-center space-x-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Level {userLevel.level}: {userLevel.title}
                </span>
              </span>
              <span className="text-cream-dim tabular-nums">
                {progression?.totalXp ?? 0} / {userLevel.nextXp} XP
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-charcoal overflow-hidden border border-cream/10">
              <div
                className="h-full bg-sage transition-all duration-300"
                style={{ width: `${xpProgressPct}%` }}
              />
            </div>
          </div>

          {/* Achievements Grid */}
          <div className="space-y-2">
            <span className="text-[11px] text-cream-dim uppercase tracking-wider block">
              Studio Achievements ({progression?.unlockedAchievements.length ?? 0}/{ACHIEVEMENTS.length} Unlocked):
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ACHIEVEMENTS.map((ach) => {
                const isUnlocked = progression?.unlockedAchievements.includes(ach.id) ?? false;
                return (
                  <div
                    key={ach.id}
                    className={`p-2.5 rounded-xl border flex items-start space-x-2.5 ${
                      isUnlocked
                        ? 'bg-sage/10 border-sage/40 text-cream'
                        : 'bg-charcoal-deep/40 border-cream/10 text-cream-dim opacity-75'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-lg border mt-0.5 ${
                        isUnlocked
                          ? 'bg-sage/20 border-sage text-sage'
                          : 'bg-charcoal border-cream/10 text-cream-dim'
                      }`}
                    >
                      {isUnlocked ? <CheckCircle className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    </div>

                    <div className="flex-1">
                      <div className="font-bold text-[11px] text-cream flex items-center justify-between">
                        <span>{ach.title}</span>
                        <span className="text-[10px] text-sage">+{ach.xpReward} XP</span>
                      </div>
                      <div className="text-[10px] text-cream-dim mt-0.5 leading-tight">{ach.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
