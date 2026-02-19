import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 011/130 - SAKURA HARUNO (Common)
 * Chakra: 2 | Power: 2
 * Group: Leaf Village | Keywords: Team 7
 * MAIN: If there's another Team 7 character in this mission, draw a card.
 *
 * Checks if there is at least one other friendly non-hidden Team 7 character in the same
 * mission. If so, the player draws 1 card from their deck.
 */
function handleSakura011Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Check for another Team 7 character in this mission (not self, not hidden)
  const hasOtherTeam7 = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    return topCard.keywords && topCard.keywords.includes('Team 7');
  });

  if (!hasOtherTeam7) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakura Haruno (011): No other Team 7 character in this mission.',
      'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: '011/130' }) } };
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
    `Sakura Haruno (011): Drew 1 card (Team 7 synergy).`,
    'game.log.effect.draw',
    { card: 'Sakura Haruno', id: '011/130', count: 1 },
  );

  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('011/130', 'MAIN', handleSakura011Main);
}
