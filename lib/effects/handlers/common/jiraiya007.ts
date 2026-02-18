import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 007/130 - JIRAYA (Common)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Sannin
 * MAIN: Play a Summon character anywhere, paying 1 less.
 *
 * This effect triggers a sub-play action: the player may play a card with the "Summon" keyword
 * from their hand to any mission, with a 1 chakra cost reduction. This is optional.
 * The actual sub-play is handled by the game engine's action resolution when the player
 * selects a Summon card from their hand.
 */
function handleJiraiya007Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  // Find all Summon cards in hand
  const summonCardIndices: string[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.keywords && card.keywords.includes('Summon')) {
      summonCardIndices.push(String(i));
    }
  }

  // If no summon cards in hand, effect fizzles
  if (summonCardIndices.length === 0) {
    return { state };
  }

  // Request the player to choose a Summon card from hand to play
  // The game engine will handle the actual sub-play with cost reduction
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'PLAY_SUMMON_FROM_HAND',
    validTargets: summonCardIndices,
    description: 'Select a Summon character from your hand to play anywhere, paying 1 less chakra.',
  };
}

export function registerHandler(): void {
  registerEffect('007/130', 'MAIN', handleJiraiya007Main);
}
