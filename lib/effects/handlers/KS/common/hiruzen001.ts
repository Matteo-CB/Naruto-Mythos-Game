import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

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

  // Pre-check: find all valid targets
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    for (const char of friendlyChars) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;

      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (topCard.group === 'Leaf Village') {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Hiruzen Sarutobi (001): No valid Leaf Village target for POWERUP 2.',
      'game.log.effect.noTarget', { card: 'HIRUZEN SARUTOBI', id: 'KS-001-C' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HIRUZEN001_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.hiruzen001ConfirmMain',
  };
}

function applyPowerup(state: import('@/lib/effects/EffectTypes').EffectContext['state'], targetInstanceId: string, amount: number, sourcePlayer: import('@/lib/engine/types').PlayerID): import('@/lib/effects/EffectTypes').EffectContext['state'] {
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
    'game.log.effect.powerup', { card: 'HIRUZEN SARUTOBI', id: 'KS-001-C', amount, target: targetName });
  return newState;
}

export function registerHandler(): void {
  registerEffect('KS-001-C', 'MAIN', handleHiruzen001Main);
}
