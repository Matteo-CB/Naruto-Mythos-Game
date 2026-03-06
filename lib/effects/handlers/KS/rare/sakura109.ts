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
 * Two-stage target selection:
 *   Stage 1: SAKURA109_CHOOSE_DISCARD — choose which Leaf Village char from discard
 *   Stage 2: SAKURA109_CHOOSE_MISSION — choose which mission to play it on
 */

function sakura109MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];
  const costReduction = ctx.isUpgrade ? 2 : 0;

  // Find affordable Leaf Village characters in discard pile (fresh play OR upgrade)
  const validIndices: string[] = [];
  for (let i = 0; i < playerState.discardPile.length; i++) {
    const card = playerState.discardPile[i];
    if (card.card_type === 'character' && card.group === 'Leaf Village') {
      const freshCost = Math.max(0, card.chakra - costReduction);
      const canFresh = playerState.chakra >= freshCost;
      const canUpgrade = canAffordAsUpgrade(state, sourcePlayer, card as { name_fr: string; chakra: number }, costReduction);
      if (canFresh || canUpgrade) {
        validIndices.push(String(i));
      }
    }
  }

  if (validIndices.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sakura Haruno (109): No affordable Leaf Village character in discard pile.',
      'game.log.effect.noTarget',
      { card: 'SAKURA HARUNO', id: 'KS-109-R' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA109_CHOOSE_DISCARD',
    validTargets: validIndices,
    description: ctx.isUpgrade
      ? 'Sakura Haruno (109): Choose a Leaf Village character from your discard pile to play (paying 2 less).'
      : 'Sakura Haruno (109): Choose a Leaf Village character from your discard pile to play.',
    descriptionKey: ctx.isUpgrade
      ? 'game.effect.desc.sakura109PlayFromDiscardUpgrade'
      : 'game.effect.desc.sakura109PlayFromDiscard',
  };
}

export function registerSakura109Handlers(): void {
  registerEffect('KS-109-R', 'MAIN', sakura109MainHandler);
}
