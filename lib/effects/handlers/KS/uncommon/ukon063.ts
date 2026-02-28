import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 063/130 - UKON (UC)
 * Chakra: 4 | Power: 3
 * Group: Sound Village | Keywords: Sound Four
 *
 * MAIN [continuous]: This character can be played as an upgrade over any character
 * with a printed cost of 4 or less (regardless of name match).
 *   - This is a continuous/passive effect. The actual upgrade validation logic is
 *     handled in PlayValidation.ts checkFlexibleUpgrade() and the action validation engine.
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *   - Note: The upgrade still requires strictly higher chakra cost. Only the name
 *     restriction is relaxed for targets with cost ≤ 4.
 */

function handleUkon063Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - can upgrade over any character with cost ≤ 4.
  // This is passively enforced in PlayValidation.ts.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Ukon (063): Can be played as upgrade over any character with cost 4 or less (continuous).',
    'game.log.effect.continuous',
    { card: 'UKON', id: 'KS-063-UC' },
  );
  return { state: { ...ctx.state, log } };
}

export function registerHandler(): void {
  registerEffect('KS-063-UC', 'MAIN', handleUkon063Main);
}
