import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 074/130 - GAARA (Common, first version)
 * Chakra: 2 | Power: 2
 * Group: Sand Village | Keywords: Team Baki
 * MAIN: POWERUP X where X is the number of friendly hidden characters in this mission.
 */
function handleGaara074Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Gaara (074): Mission not found.', 'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-074-C' }) } };
  }
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Count friendly hidden characters in this mission (not counting self)
  const hiddenCount = friendlyChars.filter(
    (char) => char.isHidden && char.instanceId !== sourceCard.instanceId,
  ).length;

  if (hiddenCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Gaara (074): No friendly hidden characters in this mission.',
      'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-074-C' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GAARA074_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.gaara074ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-074-C', 'MAIN', handleGaara074Main);
}
