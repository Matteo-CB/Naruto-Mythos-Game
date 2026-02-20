import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 147/130 - SAKURA HARUNO (M)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN [continuous]: If you don't have the Edge token, CHAKRA +2.
 *   - Continuous no-op. The chakra bonus is handled by the engine during the
 *     Start Phase (StartPhase.ts chakra calculation).
 *   - When the controlling player does NOT hold the Edge token, this character
 *     provides +2 additional chakra during the Start Phase.
 */

function sakura147MainHandler(ctx: EffectContext): EffectResult {
  // Continuous chakra bonus - handled by engine's StartPhase chakra calculation
  const log = logAction(
    ctx.state.log, ctx.state.turn, ctx.state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Sakura Haruno (147): CHAKRA +2 while you do not hold the Edge token (continuous).',
    'game.log.effect.continuous',
    { card: 'SAKURA HARUNO', id: '147/130' },
  );
  return { state: { ...ctx.state, log } };
}

export function registerHandler(): void {
  registerEffect('147/130', 'MAIN', sakura147MainHandler);
}
