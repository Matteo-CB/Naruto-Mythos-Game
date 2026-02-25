import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 141/130 - NARUTO UZUMAKI (M)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Discard a card from hand. If you do, hide an enemy with Power 4 or less
 *       in this mission.
 *   - "If you do" = optional. Player can skip the entire effect.
 *   - Stage 1: Player chooses which card to discard from hand (or skips).
 *   - Stage 2: EffectEngine handles the hide target selection.
 *   - If no cards in hand, the effect fizzles.
 */

function naruto141MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const playerState = state[ctx.sourcePlayer];

  // Check if player has cards in hand to discard
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Naruto Uzumaki (141): No cards in hand to discard, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'KS-141-M' },
    );
    return { state: { ...state, log } };
  }

  // "If you do" = optional. Always show target selection so player can skip.
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO141_CHOOSE_DISCARD',
    validTargets: playerState.hand.map((_, i) => String(i)),
    description: 'Naruto Uzumaki (141): Choose a card from your hand to discard to hide an enemy.',
    descriptionKey: 'game.effect.desc.naruto141Discard',
  };
}

export function registerNaruto141Handlers(): void {
  registerEffect('KS-141-M', 'MAIN', naruto141MainHandler);
}
