import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 061/130 - SAKON (Common)
 * Chakra: 3 | Power: 2
 * Group: Sound Village | Keywords: Sound Four
 * MAIN: Draw X card(s). X is the number of missions where you have at least one friendly
 * Sound Four character.
 *
 * Counts missions with friendly Sound Four characters, then draws that many cards.
 */
function handleSakon061Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Count missions with at least one friendly Sound Four character
  let soundFourMissionCount = 0;
  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    const hasSoundFour = friendlyChars.some((char) => {
      if (char.isHidden) return false;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      return topCard.keywords && topCard.keywords.includes('Sound Four');
    });

    if (hasSoundFour) {
      soundFourMissionCount++;
    }
  }

  if (soundFourMissionCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakon (061): No missions with friendly Sound Four characters.',
      'game.log.effect.noTarget', { card: 'SAKON', id: '061/130' }) } };
  }

  // Draw X cards
  const newState = { ...state };
  const playerState = { ...newState[sourcePlayer] };
  const newDeck = [...playerState.deck];
  const newHand = [...playerState.hand];

  for (let i = 0; i < soundFourMissionCount; i++) {
    if (newDeck.length === 0) break;
    const drawnCard = newDeck.shift()!;
    newHand.push(drawnCard);
  }

  playerState.deck = newDeck;
  playerState.hand = newHand;
  newState[sourcePlayer] = playerState;

  const drawnCount = newHand.length - state[sourcePlayer].hand.length;
  const log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_DRAW',
    `Sakon (061): Drew ${drawnCount} card(s).`,
    'game.log.effect.draw',
    { card: 'Sakon', id: '061/130', count: String(drawnCount) },
  );

  return { state: { ...newState, log } };
}

export function registerHandler(): void {
  registerEffect('061/130', 'MAIN', handleSakon061Main);
}
