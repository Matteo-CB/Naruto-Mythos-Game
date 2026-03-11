import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canAffordAsUpgrade } from '@/lib/effects/handlers/KS/shared/upgradeCheck';

/**
 * Card 109/130 - SAKURA HARUNO "Ninja Medical" (R)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Choose one of your Leaf Village characters in your discard pile
 *       and play it anywhere, paying its cost.
 *
 * UPGRADE: MAIN effect: Instead, play the card paying 2 less.
 *
 * Confirmation popup before target selection. Modifier pattern for UPGRADE.
 */

function sakura109MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  // Pre-check with BOTH cost reductions (full cost OR cost-2) to see if anything is affordable
  let hasAffordable = false;
  for (let i = 0; i < playerState.discardPile.length; i++) {
    const card = playerState.discardPile[i];
    if (card.card_type === 'character' && card.group === 'Leaf Village') {
      // Check full cost
      const canFreshFull = playerState.chakra >= card.chakra;
      const canUpgradeFull = canAffordAsUpgrade(state, sourcePlayer, card as { name_fr: string; chakra: number }, 0);
      // Check cost-2 (if this is an upgrade play)
      const freshCost2 = Math.max(0, card.chakra - 2);
      const canFresh2 = playerState.chakra >= freshCost2;
      const canUpgrade2 = canAffordAsUpgrade(state, sourcePlayer, card as { name_fr: string; chakra: number }, 2);
      if (canFreshFull || canUpgradeFull || canFresh2 || canUpgrade2) {
        hasAffordable = true;
        break;
      }
    }
  }

  if (!hasAffordable) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sakura Haruno (109): No affordable Leaf Village character in discard pile.',
      'game.log.effect.noTarget',
      { card: 'SAKURA HARUNO', id: 'KS-109-R' },
    );
    return { state: { ...state, log } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA109_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Sakura Haruno (109) MAIN: Play a Leaf Village character from your discard pile.',
    descriptionKey: 'game.effect.desc.sakura109ConfirmMain',
  };
}

export function registerSakura109Handlers(): void {
  registerEffect('KS-109-R', 'MAIN', sakura109MainHandler);
}
