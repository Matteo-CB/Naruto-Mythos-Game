import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 036/130 - NEJI HYUGA (Common)
 * Chakra: 2 | Power: 2
 * Group: Leaf Village | Keywords: Team Guy
 * MAIN: Remove up to 2 Power tokens from an enemy character in play.
 *
 * Select an enemy character in play that has at least 1 power token.
 * Remove up to 2 power tokens from that character. This effect is optional.
 */
function handleNeji036Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Find all enemy characters with power tokens across all missions
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    const enemyChars =
      opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    for (const char of enemyChars) {
      if (char.powerTokens > 0) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state };
  }

  // If exactly one target, apply automatically
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    const newState = removePowerTokens(state, targetId, 2);
    return { state: newState };
  }

  // Multiple targets: requires selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'REMOVE_POWER_TOKENS_ENEMY',
    validTargets,
    description: 'Select an enemy character to remove up to 2 Power tokens from.',
  };
}

function removePowerTokens(
  state: import('../../EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  maxRemove: number,
): import('../../EffectTypes').EffectContext['state'] {
  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((mission) => ({
    ...mission,
    player1Characters: mission.player1Characters.map((char) =>
      char.instanceId === targetInstanceId
        ? { ...char, powerTokens: Math.max(0, char.powerTokens - maxRemove) }
        : char,
    ),
    player2Characters: mission.player2Characters.map((char) =>
      char.instanceId === targetInstanceId
        ? { ...char, powerTokens: Math.max(0, char.powerTokens - maxRemove) }
        : char,
    ),
  }));
  return newState;
}

export function registerHandler(): void {
  registerEffect('036/130', 'MAIN', handleNeji036Main);
}
