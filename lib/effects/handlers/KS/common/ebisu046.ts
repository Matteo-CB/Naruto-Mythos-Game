import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleEbisu046Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  
  const sourcePower = calculateCharacterPower(state, sourceCard, sourcePlayer);

  
  const hasLesserFriendly = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const charPower = calculateCharacterPower(state, char, sourcePlayer);
    return charPower < sourcePower;
  });

  if (!hasLesserFriendly) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Ebisu (046): No friendly character with less Power in this mission.',
      'game.log.effect.noTarget', { card: 'EBISU', id: 'KS-046-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'EBISU046_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.ebisu046ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-046-C', 'MAIN', handleEbisu046Main);
}
