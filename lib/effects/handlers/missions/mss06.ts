import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * MSS 06 - "Sauvetage d'un ami" / "Rescue a Friend"
 *
 * SCORE [arrow]: Draw a card.
 *   - The scoring player draws 1 card from the top of their deck.
 *   - If the deck is empty, nothing happens (no penalty).
 */

function mss06ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };
  const playerState = { ...state[ctx.sourcePlayer] };
  const deck = [...playerState.deck];

  if (deck.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_DRAW',
      'MSS 06 (Rescue a Friend): Deck is empty, no card drawn.',
    );
    return { state: { ...state, log } };
  }

  // Draw 1 card
  const drawnCard = deck.shift()!;
  playerState.deck = deck;
  playerState.hand = [...playerState.hand, drawnCard];

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'SCORE_DRAW',
    'MSS 06 (Rescue a Friend): Drew 1 card.',
  );

  return { state: { ...state, [ctx.sourcePlayer]: playerState, log } };
}

export function registerMss06Handlers(): void {
  registerEffect('MSS 06', 'SCORE', mss06ScoreHandler);
}
