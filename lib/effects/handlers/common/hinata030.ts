import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 030/130 - HINATA HYUGA "Poing Souple" (Common)
 * Chakra: 2 | Power: 2
 * Group: Leaf Village | Keywords: Team 8, Taijutsu
 * MAIN: Remove up to 2 Power tokens from an enemy character in play.
 *
 * Targets a non-hidden enemy character across all missions that has at least 1 power token.
 * Removes min(2, target.powerTokens) tokens from the target.
 * If multiple valid targets, requires target selection.
 */
function handleHinata030Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Find all non-hidden enemy characters with powerTokens > 0 across all missions
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (!char.isHidden && char.powerTokens > 0) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Hinata Hyuga (030): No enemy character with Power tokens in play.',
      'game.log.effect.noTarget', { card: 'HINATA HYUGA', id: '030/130' }) } };
  }

  // If exactly one valid target, auto-apply
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    const newState = removePowerTokens(state, targetId, sourcePlayer);
    return { state: newState };
  }

  // Multiple valid targets: requires target selection
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
  sourcePlayer: import('../../../engine/types').PlayerID,
): import('../../EffectTypes').EffectContext['state'] {
  let targetName = '';
  let tokensRemoved = 0;

  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((mission) => ({
    ...mission,
    player1Characters: mission.player1Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        tokensRemoved = Math.min(2, char.powerTokens);
        return { ...char, powerTokens: char.powerTokens - tokensRemoved };
      }
      return char;
    }),
    player2Characters: mission.player2Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        tokensRemoved = Math.min(2, char.powerTokens);
        return { ...char, powerTokens: char.powerTokens - tokensRemoved };
      }
      return char;
    }),
  }));

  newState.log = logAction(
    newState.log, newState.turn, newState.phase, sourcePlayer,
    'EFFECT_REMOVE_TOKENS',
    `Hinata Hyuga (030): Removed ${tokensRemoved} Power token(s) from ${targetName}.`,
    'game.log.effect.removeTokens',
    { card: 'HINATA HYUGA', id: '030/130', amount: tokensRemoved, target: targetName },
  );

  return newState;
}

export function registerHandler(): void {
  registerEffect('030/130', 'MAIN', handleHinata030Main);
}
