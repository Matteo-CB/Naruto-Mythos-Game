import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 024/130 - ASUMA SARUTOBI "Lame de Chakra" (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 10
 *
 * AMBUSH: Draw a card. Then, discard a card to POWERUP 3.
 *   - When revealed from hidden:
 *     1. Draw 1 card from deck.
 *     2. Then, may discard 1 card from hand.
 *     3. If a card is discarded, POWERUP 3 on self (add 3 power tokens).
 *   - The discard is conditional ("discard a card to POWERUP 3" implies optional:
 *     the player can choose not to discard, in which case POWERUP 3 doesn't happen).
 *   - Requires target selection for which card to discard from hand.
 */
function handleAsuma024Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Confirmation popup before draw+discard
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ASUMA024_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.asuma024ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-024-UC', 'AMBUSH', handleAsuma024Ambush);
}
