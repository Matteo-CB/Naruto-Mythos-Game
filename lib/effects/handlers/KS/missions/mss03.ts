import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * MSS 03 - "Trouver le traitre" / "Find the Traitor"
 *
 * SCORE [arrow]: Opponent discards a card from hand.
 *   - The opponent of the scoring player must discard 1 card from their hand.
 *   - For automated play: discard the first card in hand.
 *   - If opponent has no cards in hand, nothing happens.
 */

function mss03ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };
  const opponentId = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentState = state[opponentId];

  if (opponentState.hand.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 03 (Find the Traitor): Opponent has no cards in hand to discard.',
      'game.log.effect.noTarget',
      { card: 'Trouver le traitre', id: 'KS-003-MMS' },
    );
    return { state: { ...state, log } };
  }

  // CONFIRM popup before forcing opponent discard
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS03_CONFIRM_SCORE',
    validTargets: ['KS-003-MMS'],
    description: 'MSS 03 (Find the Traitor): Opponent discards a card from hand.',
    descriptionKey: 'game.effect.desc.mss03ConfirmScore',
  };
}

export function registerMss03Handlers(): void {
  registerEffect('KS-003-MMS', 'SCORE', mss03ScoreHandler);
}
