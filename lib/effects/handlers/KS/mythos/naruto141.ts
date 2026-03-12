import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

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

  // Return CONFIRM popup first — EffectEngine will handle the actual discard selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO141_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ handSize: playerState.hand.length }),
    descriptionKey: 'game.effect.desc.naruto141ConfirmMain',
  };
}

export function registerNaruto141Handlers(): void {
  registerEffect('KS-141-M', 'MAIN', naruto141MainHandler);
}
