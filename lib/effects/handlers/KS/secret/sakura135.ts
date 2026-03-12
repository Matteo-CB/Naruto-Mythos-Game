import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 135/130 - SAKURA HARUNO "Corps Medical du Village de la Feuille" (S)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Look at the top 3 cards of your deck. Play one character anywhere
 *       and discard the other cards.
 *
 * UPGRADE (effect:): Instead, play the card paying 4 less.
 *
 * Two-stage target selection:
 *   Stage 1: SAKURA135_CHOOSE_CARD - choose which character card from top 3 to play
 *   Stage 2: SAKURA135_CHOOSE_MISSION - choose which mission to play it on
 *
 * The handler draws the top 3 cards and stores them in the pending state.
 * The EffectEngine methods handle the rest.
 */

function sakura135MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.deck.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sakura Haruno (135): Deck is empty, no cards to look at.',
      'game.log.effect.noTarget',
      { card: 'SAKURA HARUNO', id: 'KS-135-S' },
    );
    return { state: { ...state, log } };
  }

  // Return CONFIRM popup instead of drawing cards and showing selection
  // The deck draw and card selection will happen in the EffectEngine CONFIRM case
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA135_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ costReduction: ctx.isUpgrade ? 4 : 0 }),
    descriptionKey: ctx.isUpgrade
      ? 'game.effect.desc.sakura135ConfirmMainUpgrade'
      : 'game.effect.desc.sakura135ConfirmMain',
  };
}

export function registerSakura135Handlers(): void {
  registerEffect('KS-135-S', 'MAIN', sakura135MainHandler);
  registerEffect('KS-135-MV', 'MAIN', sakura135MainHandler);
}
