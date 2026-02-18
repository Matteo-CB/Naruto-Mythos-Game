import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';

/**
 * Card 092/130 - KISAME HOSHIGAKI (Common)
 * Chakra: 3 | Power: 4
 * Group: Akatsuki | Keywords: Rogue Ninja
 * AMBUSH: Remove up to 2 Power tokens from an enemy character in this mission and put
 * them on this character.
 *
 * This effect only triggers when Kisame is revealed from hidden (AMBUSH).
 * Select an enemy character in the same mission that has power tokens.
 * Remove up to 2 tokens from it and add them to Kisame.
 */
function handleKisame092Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemyChars =
    opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Find enemy characters with power tokens in this mission
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (char.powerTokens > 0) {
      validTargets.push(char.instanceId);
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state };
  }

  // If exactly one target, apply automatically
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    const newState = transferPowerTokens(state, targetId, sourceCard.instanceId, 2, sourceMissionIndex);
    return { state: newState };
  }

  // Multiple targets: requires selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'STEAL_POWER_TOKENS_ENEMY_THIS_MISSION',
    validTargets,
    description: 'Select an enemy character in this mission to steal up to 2 Power tokens from.',
  };
}

function transferPowerTokens(
  state: import('../../EffectTypes').EffectContext['state'],
  fromInstanceId: string,
  toInstanceId: string,
  maxTransfer: number,
  missionIndex: number,
): import('../../EffectTypes').EffectContext['state'] {
  // First, find how many tokens the target actually has
  let tokensAvailable = 0;
  const mission = state.activeMissions[missionIndex];
  for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
    if (char.instanceId === fromInstanceId) {
      tokensAvailable = char.powerTokens;
      break;
    }
  }

  const tokensToTransfer = Math.min(maxTransfer, tokensAvailable);

  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((m, idx) => {
    if (idx !== missionIndex) return m;
    return {
      ...m,
      player1Characters: m.player1Characters.map((char) => {
        if (char.instanceId === fromInstanceId) {
          return { ...char, powerTokens: char.powerTokens - tokensToTransfer };
        }
        if (char.instanceId === toInstanceId) {
          return { ...char, powerTokens: char.powerTokens + tokensToTransfer };
        }
        return char;
      }),
      player2Characters: m.player2Characters.map((char) => {
        if (char.instanceId === fromInstanceId) {
          return { ...char, powerTokens: char.powerTokens - tokensToTransfer };
        }
        if (char.instanceId === toInstanceId) {
          return { ...char, powerTokens: char.powerTokens + tokensToTransfer };
        }
        return char;
      }),
    };
  });

  return newState;
}

export function registerHandler(): void {
  registerEffect('092/130', 'AMBUSH', handleKisame092Ambush);
}
