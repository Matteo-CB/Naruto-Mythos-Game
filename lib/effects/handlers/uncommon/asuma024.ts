import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 024/130 - ASUMA SARUTOBI "Lame de Chakra" (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 10
 *
 * AMBUSH: Draw a card. Then, discard a card to POWERUP 3.
 *   - When revealed from hidden:
 *     1. Draw 1 card from deck.
 *     2. Then, may discard 1 card from hand.
 *     3. If a card is discarded, POWERUP 3 on self (add 3 power tokens).
 *   - The discard is conditional ("discard a card to POWERUP 3" implies optional:
 *     the player can choose not to discard, in which case POWERUP 3 doesn't happen).
 *   - Requires target selection for which card to discard from hand.
 */
function handleAsuma024Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  let newState = { ...state };
  const ps = { ...newState[sourcePlayer] };

  // Step 1: Draw a card
  if (ps.deck.length > 0) {
    const newDeck = [...ps.deck];
    const drawnCard = newDeck.shift()!;
    ps.deck = newDeck;
    ps.hand = [...ps.hand, drawnCard];
  }
  newState[sourcePlayer] = ps;

  newState = { ...newState, log: logAction(
    newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT_DRAW',
    'Asuma Sarutobi (024): Drew 1 card (ambush).',
    'game.log.effect.draw',
    { card: 'ASUMA SARUTOBI', id: '024/130', count: 1 },
  ) };

  // Step 2: Discard a card to POWERUP 3
  // If no cards in hand, can't discard, so no POWERUP
  const currentPs = newState[sourcePlayer];
  if (currentPs.hand.length === 0) {
    return { state: { ...newState, log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Asuma Sarutobi (024): No cards in hand to discard for POWERUP 3.',
      'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: '024/130' }) } };
  }

  // Requires target selection: choose a card from hand to discard (for POWERUP 3)
  const validTargets = currentPs.hand.map((_, idx) => `hand_${idx}`);

  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: 'ASUMA_024_DISCARD_FOR_POWERUP',
    validTargets,
    description: 'Discard a card from your hand to give Asuma POWERUP 3. (Optional - decline to skip POWERUP.)',
  };
}

export function registerHandler(): void {
  registerEffect('024/130', 'AMBUSH', handleAsuma024Ambush);
}
