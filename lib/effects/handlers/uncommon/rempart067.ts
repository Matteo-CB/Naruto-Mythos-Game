import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 067/130 - REMPART (UC)
 * Chakra: 3 | Power: 0
 * Group: Sound Village | Keywords: Summon
 *
 * MAIN [hourglass]: The strongest (highest effective power) non-hidden enemy character
 *   in this mission loses all Power tokens and has effective Power = 0.
 *   - This is a continuous effect handled by the engine during scoring
 *     (PowerCalculation.ts / MissionPhase.ts). The strongest enemy's power
 *     is treated as 0 while Rempart is face-visible in the same mission.
 *   - The handler registers as a no-op since the continuous logic lives in the engine.
 *
 * MAIN [hourglass]: At end of round, must return this character to hand.
 *   - Also a continuous effect handled by EndPhase.ts.
 */

function handleRempart067Main(ctx: EffectContext): EffectResult {
  // Both MAIN effects are continuous [hourglass]:
  // 1. Strongest enemy power = 0 in this mission (engine handles during scoring)
  // 2. Return to hand at end of round (EndPhase handles)
  // No immediate state change needed.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Rempart (067): Strongest enemy in this mission has Power = 0 (continuous). Must return to hand at end of round.',
    'game.log.effect.continuous',
    { card: 'REMPART', id: '067/130' },
  );
  return { state: { ...state, log } };
}

export function registerHandler(): void {
  registerEffect('067/130', 'MAIN', handleRempart067Main);
}
