import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 032/130 - SHINO ABURAME "Insectes Destructeurs" (Common)
 * Chakra: 2 | Power: 3
 * Group: Leaf Village | Keywords: Team 8
 * MAIN: Each player draws a card.
 *
 * Both players draw 1 card from their respective decks.
 * If a player's deck is empty, they simply don't draw (no penalty).
 */
function handleShino032Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Confirmation popup before drawing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHINO032_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shino032ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-032-C', 'MAIN', handleShino032Main);
}
