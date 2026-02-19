import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 081/130 - BAKI (Common)
 * Chakra: 3 | Power: 2
 * Group: Sand Village | Keywords: Team Baki
 * SCORE [arrow]: Draw a card.
 *
 * When the player wins the mission where Baki is assigned, draw 1 card.
 */
function handleBaki081Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Draw a card
  const newState = { ...state };
  const playerState = { ...newState[sourcePlayer] };
  if (playerState.deck.length > 0) {
    const newDeck = [...playerState.deck];
    const drawnCard = newDeck.shift()!;
    playerState.deck = newDeck;
    playerState.hand = [...playerState.hand, drawnCard];
  }
  newState[sourcePlayer] = playerState;

  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'SCORE_DRAW',
    `Baki (081): [SCORE] Drew 1 card.`,
    'game.log.score.draw',
    { card: 'Baki', count: 1 },
  );

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('081/130', 'SCORE', handleBaki081Score);
}
