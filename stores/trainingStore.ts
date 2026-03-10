'use client';

/**
 * Training Mode Store - completely separate from the main game store.
 * Tracks coaching state for the training mode only.
 * Zero impact on normal gameplay.
 */

import { create } from 'zustand';
import type { GameState, PlayerID } from '@/lib/engine/types';
import type { CoachAdvice } from '@/lib/ai/coaching/CoachTypes';

export type MoveQuality = 'great' | 'good' | 'ok' | 'mistake' | 'blunder';

export interface TrainingStore {
  /** Whether training mode is active */
  isTrainingMode: boolean;

  /** Latest coaching advice from the AI */
  coachAdvice: CoachAdvice | null;

  /** Is the coach currently computing advice? */
  isAnalysing: boolean;

  /** Quality of the last player move */
  lastMoveQuality: MoveQuality | null;

  /** Win probability delta from last move (positive = improved position) */
  lastMoveDelta: number | null;

  /** Whether the coaching panel is expanded/visible */
  isPanelOpen: boolean;

  // ─── Actions ──────────────────────────────────────────────────────────────

  enable: () => void;
  disable: () => void;
  togglePanel: () => void;
  setAdvice: (advice: CoachAdvice | null) => void;
  setAnalysing: (val: boolean) => void;
  setLastMoveQuality: (quality: MoveQuality | null, delta: number | null) => void;
  reset: () => void;
}

export const useTrainingStore = create<TrainingStore>((set) => ({
  isTrainingMode: false,
  coachAdvice: null,
  isAnalysing: false,
  lastMoveQuality: null,
  lastMoveDelta: null,
  isPanelOpen: true,

  enable: () => set({ isTrainingMode: true, isPanelOpen: true }),
  disable: () => set({ isTrainingMode: false }),
  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
  setAdvice: (advice) => set({ coachAdvice: advice, isAnalysing: false }),
  setAnalysing: (val) => set({ isAnalysing: val }),
  setLastMoveQuality: (quality, delta) => set({ lastMoveQuality: quality, lastMoveDelta: delta }),
  reset: () => set({
    coachAdvice: null,
    isAnalysing: false,
    lastMoveQuality: null,
    lastMoveDelta: null,
  }),
}));

// ─── Move quality classification ─────────────────────────────────────────────

/**
 * Classify a move based on the change in win probability.
 * delta = newWinProb - oldWinProb (from the player's perspective)
 */
export function classifyMove(delta: number): MoveQuality {
  if (delta >= 0.08) return 'great';
  if (delta >= 0.02) return 'good';
  if (delta >= -0.03) return 'ok';
  if (delta >= -0.10) return 'mistake';
  return 'blunder';
}

export const MOVE_QUALITY_COLORS: Record<MoveQuality, string> = {
  great:   '#4ade80', // green
  good:    '#86efac', // light green
  ok:      '#c4a35a', // gold / neutral
  mistake: '#f97316', // orange
  blunder: '#ef4444', // red
};

export const MOVE_QUALITY_LABELS: Record<MoveQuality, { fr: string; en: string }> = {
  great:   { fr: 'Excellent coup !', en: 'Excellent move!' },
  good:    { fr: 'Bon coup', en: 'Good move' },
  ok:      { fr: 'Coup acceptable', en: 'Acceptable move' },
  mistake: { fr: 'Erreur', en: 'Mistake' },
  blunder: { fr: 'Grosse erreur', en: 'Blunder' },
};
