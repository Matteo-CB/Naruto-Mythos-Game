export const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REPEAT_FULL_THRESHOLD = 3;
export const REPEAT_HALF_THRESHOLD = 5;

export type RepeatOpponentTier = 'full' | 'half' | 'zero';

export interface RepeatOpponentDecay {
  tier: RepeatOpponentTier;
  multiplier: number;
  priorPairGamesInWindow: number;
}

export function computeRepeatOpponentMultiplier(priorPairGamesInWindow: number): RepeatOpponentDecay {
  if (priorPairGamesInWindow < REPEAT_FULL_THRESHOLD) {
    return { tier: 'full', multiplier: 1, priorPairGamesInWindow };
  }
  if (priorPairGamesInWindow < REPEAT_HALF_THRESHOLD) {
    return { tier: 'half', multiplier: 0.5, priorPairGamesInWindow };
  }
  return { tier: 'zero', multiplier: 0, priorPairGamesInWindow };
}
