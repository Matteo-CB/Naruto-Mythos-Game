import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 103/130 - KYODAIGUMO (UC)
 * Chakra: 3 | Power: 4
 * Group: Sound Village | Keywords: Summon
 *
 * MAIN [hourglass]: At end of round, hide a character with Power equal to or less than
 *   this character's Power, then must return this character to hand.
 *   - This is a continuous effect. The actual logic is handled in EndPhase.ts:
 *     1. Before returning Kyodaigumo to hand, the engine finds characters (any player)
 *        with effective Power <= Kyodaigumo's current effective Power (base + tokens).
 *     2. The player selects one to hide.
 *     3. Then Kyodaigumo returns to hand.
 *   - The handler registers as a no-op since it is purely continuous/engine-driven.
 */

function handleKyodaigumo103Main(ctx: EffectContext): EffectResult {
  // Continuous [hourglass]:
  // At end of round: hide a character with Power <= this character's Power, then return to hand.
  // All logic is handled in EndPhase.ts.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Kyodaigumo (103): At end of round, will hide a character with Power <= own Power, then return to hand (continuous).',
    'game.log.effect.continuous',
    { card: 'KYODAIGUMO', id: '103/130' },
  );
  return { state: { ...state, log } };
}

export function registerHandler(): void {
  registerEffect('103/130', 'MAIN', handleKyodaigumo103Main);
}
