import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 063/130 - UKON (UC)
 * Chakra: 4 | Power: 3
 * Group: Sound Village | Keywords: Sound Four
 *
 * MAIN [continuous]: This character can be played as an upgrade over any Sound Village
 * character (regardless of name match).
 *   - This is a continuous/passive effect. The actual upgrade validation logic that
 *     allows cross-name upgrades for Sound Village characters is handled in
 *     PlayValidation.ts / the action validation engine.
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *   - Note: The upgrade still requires strictly higher chakra cost. Only the name
 *     restriction is relaxed for Sound Village targets.
 */

function handleUkon063Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - can upgrade over any Sound Village character.
  // This is passively enforced in PlayValidation.ts.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Ukon (063): Can be played as upgrade over any Sound Village character (continuous).',
    'game.log.effect.continuous',
    { card: 'UKON', id: '063/130' },
  );
  return { state: { ...ctx.state, log } };
}

export function registerHandler(): void {
  registerEffect('063/130', 'MAIN', handleUkon063Main);
}
