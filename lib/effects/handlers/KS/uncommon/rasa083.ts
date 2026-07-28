import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { characterHasGroup } from '@/lib/effects/groupUtils';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleRasa083Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = mission[friendlySide];

  
  const hasOtherSandVillage = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    return characterHasGroup(char, 'Sand Village');
  });

  if (!hasOtherSandVillage) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'SCORE_NO_TARGET', 'Rasa (083): No other friendly Sand Village character in this mission. No bonus point.',
      'game.log.effect.noTarget', { card: 'RASA', id: 'KS-083-UC' });
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'RASA083_CONFIRM_SCORE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.rasa083ConfirmScore',
  };
}

export function registerHandler(): void {
  registerEffect('KS-083-UC', 'SCORE', handleRasa083Score);
}
