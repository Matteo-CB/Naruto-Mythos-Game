import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * MSS 06 - "Sauvetage d'un ami" / "Rescue a Friend"
 *
 * SCORE [arrow]: Draw a card.
 *   - The scoring player draws 1 card from the top of their deck.
 *   - If the deck is empty, nothing happens (no penalty).
 */

function mss06ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };
  const deck = state[ctx.sourcePlayer].deck;

  if (deck.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_DRAW',
      'MSS 06 (Rescue a Friend): Deck is empty, no card drawn.',
      'game.log.effect.noTarget',
      { card: 'Sauvetage d\'un ami', id: 'KS-006-MMS' },
    );
    return { state: { ...state, log } };
  }

  // CONFIRM popup before drawing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS06_CONFIRM_SCORE',
    validTargets: ['KS-006-MMS'],
    description: 'MSS 06 (Rescue a Friend): Draw a card.',
    descriptionKey: 'game.effect.desc.mss06ConfirmScore',
  };
}

export function registerMss06Handlers(): void {
  registerEffect('KS-006-MMS', 'SCORE', mss06ScoreHandler);
}
