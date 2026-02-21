import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

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
      { card: 'Trouver le traitre', id: 'MSS 03' },
    );
    return { state: { ...state, log } };
  }

  // If opponent has exactly 1 card, auto-resolve
  if (opponentState.hand.length === 1) {
    const hand = [...opponentState.hand];
    const [discarded] = hand.splice(0, 1);
    const updatedOpponent = {
      ...opponentState,
      hand,
      discardPile: [...opponentState.discardPile, discarded],
    };

    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_DISCARD',
      `MSS 03 (Find the Traitor): Opponent discarded ${discarded.name_fr} from hand.`,
      'game.log.score.discard',
      { card: 'Trouver le traitre', count: 1 },
    );

    return { state: { ...state, [opponentId]: updatedOpponent, log } };
  }

  // Multiple cards: opponent chooses which card to discard
  const handIndices = opponentState.hand.map((_, i) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS03_OPPONENT_DISCARD',
    validTargets: handIndices,
    selectingPlayer: opponentId,
    description: 'MSS 03 (Find the Traitor): Choose a card from your hand to discard.',
  };
}

export function registerMss03Handlers(): void {
  registerEffect('MSS 03', 'SCORE', mss03ScoreHandler);
}
