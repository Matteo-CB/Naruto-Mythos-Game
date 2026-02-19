import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 021/130 - SHIKAMARU NARA (Common)
 * Chakra: 1 | Power: 0 (no power stat in data)
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: If you have the Edge, draw a card.
 *
 * Checks if the source player currently holds the Edge token. If so, draws 1 card.
 */
function handleShikamaru021Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Check if this player has the Edge
  if (state.edgeHolder !== sourcePlayer) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (021): Player does not hold the Edge token.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: '021/130' }) } };
  }

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
    'EFFECT_DRAW',
    `Shikamaru Nara (021): Drew 1 card (Edge holder).`,
    'game.log.effect.draw',
    { card: 'Shikamaru Nara', id: '021/130', count: 1 },
  );

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('021/130', 'MAIN', handleShikamaru021Main);
}
