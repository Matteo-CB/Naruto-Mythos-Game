import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 023/130 - ASUMA SARUTOBI (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: Move another Team 10 character from this mission.
 *
 * Select another friendly non-hidden Team 10 character in this mission and move it to a
 * different mission. This effect is optional (no "you must").
 */
function handleAsuma023Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Find other Team 10 characters in this mission (hidden characters can be moved)
  const validTargets: string[] = [];
  for (const char of friendlyChars) {
    if (char.instanceId === sourceCard.instanceId) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.keywords && topCard.keywords.includes('Team 10')) {
      validTargets.push(char.instanceId);
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state };
  }

  // Requires target selection: which character to move, and to which mission
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_TEAM10_CHARACTER',
    validTargets,
    description: 'Select a Team 10 character in this mission to move to a different mission.',
  };
}

export function registerHandler(): void {
  registerEffect('023/130', 'MAIN', handleAsuma023Main);
}
