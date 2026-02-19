import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 001/130 - HIRUZEN SARUTOBI (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Hokage
 * MAIN: POWERUP 2 another friendly Leaf Village character.
 *
 * Adds 2 power tokens to another friendly Leaf Village character in any mission (not self).
 * This effect is optional (no "you must" in text).
 */
function handleHiruzen001Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Find all valid targets: friendly non-self Leaf Village characters across all missions
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    for (const char of friendlyChars) {
      // Must not be self, must be Leaf Village
      if (char.instanceId === sourceCard.instanceId) continue;

      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.group === 'Leaf Village') {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Hiruzen Sarutobi (001): No valid Leaf Village target for POWERUP 2.',
      'game.log.effect.noTarget', { card: 'HIRUZEN SARUTOBI', id: '001/130' }) } };
  }

  // If exactly one valid target, apply automatically
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    const newState = applyPowerup(state, targetId, 2, sourcePlayer);
    return { state: newState };
  }

  // Multiple valid targets: requires target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'POWERUP_2_LEAF_VILLAGE',
    validTargets,
    description: 'Select a friendly Leaf Village character to give POWERUP 2.',
  };
}

function applyPowerup(state: import('../../EffectTypes').EffectContext['state'], targetInstanceId: string, amount: number, sourcePlayer: import('../../../engine/types').PlayerID): import('../../EffectTypes').EffectContext['state'] {
  let targetName = '';
  const newState = { ...state };
  newState.activeMissions = state.activeMissions.map((mission) => ({
    ...mission,
    player1Characters: mission.player1Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        return { ...char, powerTokens: char.powerTokens + amount };
      }
      return char;
    }),
    player2Characters: mission.player2Characters.map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        return { ...char, powerTokens: char.powerTokens + amount };
      }
      return char;
    }),
  }));
  newState.log = logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT_POWERUP',
    `Hiruzen Sarutobi (001): POWERUP ${amount} on ${targetName}.`,
    'game.log.effect.powerup', { card: 'HIRUZEN SARUTOBI', id: '001/130', amount, target: targetName });
  return newState;
}

export function registerHandler(): void {
  registerEffect('001/130', 'MAIN', handleHiruzen001Main);
}
