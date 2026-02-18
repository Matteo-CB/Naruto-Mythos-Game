import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 055/130 - KIMIMARO (Common)
 * Chakra: 3 | Power: 3
 * Group: Sound Village | Keywords: Weapon
 * AMBUSH: Discard a card to hide a character in play with cost 3 or less.
 *
 * This effect only triggers when Kimimaro is revealed from hidden (AMBUSH).
 * 1. The player must discard a card from their hand (cost of the effect).
 * 2. Then select a non-hidden character in play (friendly or enemy) with printed
 *    chakra cost 3 or less.
 * 3. Hide that character (flip face-down).
 *
 * The effect is optional. If the player has no cards to discard, the effect cannot be used.
 */
function handleKimimaro055Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // Must have at least 1 card in hand to discard
  if (playerState.hand.length === 0) {
    return { state };
  }

  // Find all non-hidden characters in play with cost <= 3
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.chakra <= 3) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state };
  }

  // Requires two-step target selection:
  // 1. Choose a card from hand to discard
  // 2. Choose a character in play with cost <= 3 to hide
  // The game engine handles the multi-step resolution.
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIMIMARO_DISCARD_AND_HIDE',
    validTargets,
    description: 'Discard a card from your hand, then select a character in play with cost 3 or less to hide.',
  };
}

export function registerHandler(): void {
  registerEffect('055/130', 'AMBUSH', handleKimimaro055Ambush);
}
