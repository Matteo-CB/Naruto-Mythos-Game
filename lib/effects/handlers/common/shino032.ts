import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 032/130 - SHINO ABURAME "Insectes Destructeurs" (Common)
 * Chakra: 2 | Power: 3
 * Group: Leaf Village | Keywords: Team 8
 * MAIN: Each player draws a card.
 *
 * Both players draw 1 card from their respective decks.
 * If a player's deck is empty, they simply don't draw (no penalty).
 */
function handleShino032Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  let newState = { ...state };

  // Source player draws a card
  const ps = { ...newState[sourcePlayer] };
  if (ps.deck.length > 0) {
    const newDeck = [...ps.deck];
    const drawnCard = newDeck.shift()!;
    ps.deck = newDeck;
    ps.hand = [...ps.hand, drawnCard];
  }
  newState[sourcePlayer] = ps;

  // Opponent draws a card
  const ops = { ...newState[opponentPlayer] };
  if (ops.deck.length > 0) {
    const newDeck = [...ops.deck];
    const drawnCard = newDeck.shift()!;
    ops.deck = newDeck;
    ops.hand = [...ops.hand, drawnCard];
  }
  newState[opponentPlayer] = ops;

  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT_DRAW',
    'Shino Aburame (032): Each player draws a card.',
    'game.log.effect.bothDraw',
    { card: 'SHINO ABURAME', id: '032/130', count: 1 },
  );

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('032/130', 'MAIN', handleShino032Main);
}
