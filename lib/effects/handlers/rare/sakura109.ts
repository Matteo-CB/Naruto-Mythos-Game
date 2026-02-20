import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

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

  // Find affordable Leaf Village characters in discard pile
  const validIndices: string[] = [];
  for (let i = 0; i < playerState.discardPile.length; i++) {
    const card = playerState.discardPile[i];
    if (card.card_type === 'character' && card.group === 'Leaf Village') {
      const cost = Math.max(0, card.chakra - costReduction);
      if (playerState.chakra >= cost) {
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
      { card: 'SAKURA HARUNO', id: '109/130' },
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
  };
}

export function registerSakura109Handlers(): void {
  registerEffect('109/130', 'MAIN', sakura109MainHandler);
}
