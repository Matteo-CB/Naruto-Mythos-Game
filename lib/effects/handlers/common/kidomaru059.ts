import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 059/130 - KIDOMARU (Common)
 * Chakra: 3 | Power: 2
 * Group: Sound Village | Keywords: Sound Four
 * MAIN: Move X friendly character(s). X is the number of missions where you have at least
 * one friendly Sound Four character.
 *
 * Counts missions with friendly Sound Four characters, then allows the player to move
 * that many friendly characters to different missions. This effect is optional.
 */
function handleKidomaru059Main(ctx: EffectContext): EffectResult {
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
    return { state };
  }

  // Find all movable friendly characters across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    for (const char of friendlyChars) {
      // Hidden characters can be moved
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state };
  }

  // Requires target selection: select up to X characters to move
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_X_FRIENDLY_CHARACTERS',
    validTargets,
    description: `Select up to ${soundFourMissionCount} friendly character(s) to move to different missions.`,
  };
}

export function registerHandler(): void {
  registerEffect('059/130', 'MAIN', handleKidomaru059Main);
}
