import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 047/130 - IRUKA (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Academy
 * MAIN: Move a Naruto Uzumaki character in play.
 *
 * Select a friendly character named "NARUTO UZUMAKI" in play (any mission) and move it to
 * a different mission. This effect is optional.
 */
function handleIruka047Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Find all friendly Naruto Uzumaki characters in play across all missions
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    for (const char of friendlyChars) {
      // Hidden characters can be moved (they are still "in play")
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      // Match by character name (name_fr is canonical)
      if (topCard.name_fr === 'NARUTO UZUMAKI') {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state };
  }

  // Requires target selection: which Naruto to move and where
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_NARUTO_CHARACTER',
    validTargets,
    description: 'Select a Naruto Uzumaki character in play to move to a different mission.',
  };
}

export function registerHandler(): void {
  registerEffect('047/130', 'MAIN', handleIruka047Main);
}
