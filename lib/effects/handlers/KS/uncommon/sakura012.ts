import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 012/130 - SAKURA HARUNO "Maitrise du Chakra" (UC)
 * Chakra: 3 | Power: 2
 * Group: Leaf Village | Keywords: Team 7
 *
 * MAIN [continuous]: CHAKRA +1.
 *   - Continuous effect. The character provides +1 extra chakra during the Start Phase.
 *   - The actual chakra calculation is handled in StartPhase.ts.
 *   - The handler here is a no-op.
 *
 * UPGRADE: Draw 1 card. If you do so, you must discard 1 card.
 *   - When triggered as an upgrade, draw 1 card from deck. If a card was drawn,
 *     the player must discard 1 card from hand. Requires target selection for which
 *     card to discard.
 */
function handleSakura012Main(ctx: EffectContext): EffectResult {
  // Continuous CHAKRA +1 effect - actual calculation happens in StartPhase.ts
  return { state: ctx.state };
}

function handleSakura012Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Check deck is not empty before offering confirmation
  if (state[sourcePlayer].deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakura Haruno (012): Deck is empty, cannot draw (upgrade effect fizzles).',
      'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-012-UC' }) } };
  }

  // Confirmation popup before draw+discard
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA012_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.sakura012ConfirmUpgrade',
  };
}

export function registerSakura012Handlers(): void {
  registerEffect('KS-012-UC', 'MAIN', handleSakura012Main);
  registerEffect('KS-012-UC', 'UPGRADE', handleSakura012Upgrade);
}
