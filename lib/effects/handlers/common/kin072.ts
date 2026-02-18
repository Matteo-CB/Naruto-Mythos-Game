import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 072/130 - KIN TSUCHI (Common)
 * Chakra: 1 | Power: 3
 * Group: Sound Village | Keywords: Team Dosu
 * MAIN: Opponent draws a card.
 *
 * Makes the opponent draw 1 card from their deck. This is a drawback effect on an otherwise
 * efficient card. The effect is mandatory.
 */
function handleKin072Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  const newState = { ...state };
  const opponentState = { ...newState[opponentPlayer] };
  if (opponentState.deck.length > 0) {
    const newDeck = [...opponentState.deck];
    const drawnCard = newDeck.shift()!;
    opponentState.deck = newDeck;
    opponentState.hand = [...opponentState.hand, drawnCard];
  }
  newState[opponentPlayer] = opponentState;

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('072/130', 'MAIN', handleKin072Main);
}
