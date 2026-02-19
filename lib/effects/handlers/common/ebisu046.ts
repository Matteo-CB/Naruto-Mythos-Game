import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { calculateCharacterPower } from '../../../engine/phases/PowerCalculation';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 046/130 - EBISU (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Pouvoir
 * MAIN: If there is a friendly non-hidden character with less Power than this character
 * in this mission, draw a card.
 *
 * "Power" includes base power + power tokens + continuous modifiers (effective power).
 */
function handleEbisu046Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Use effective power (base + tokens + continuous modifiers)
  const sourcePower = calculateCharacterPower(state, sourceCard, sourcePlayer);

  // Check for a friendly non-hidden character with less Power
  const hasLesserFriendly = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const charPower = calculateCharacterPower(state, char, sourcePlayer);
    return charPower < sourcePower;
  });

  if (!hasLesserFriendly) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Ebisu (046): No friendly character with less Power in this mission.',
      'game.log.effect.noTarget', { card: 'EBISU', id: '046/130' }) } };
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

  const log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_DRAW',
    `Ebisu (046): Drew 1 card.`,
    'game.log.effect.draw',
    { card: 'Ebisu', id: '046/130', count: '1' },
  );

  return { state: { ...newState, log } };
}

export function registerHandler(): void {
  registerEffect('046/130', 'MAIN', handleEbisu046Main);
}
