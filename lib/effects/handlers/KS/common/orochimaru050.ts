import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleOrochimaru050Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemyChars =
    opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  
  const validTargets: string[] = [];
  for (const char of enemyChars) {
    if (char.isHidden) {
      validTargets.push(char.instanceId);
    }
  }

  
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Orochimaru (050): No hidden enemy characters in this mission.',
      'game.log.effect.noTarget', { card: 'OROCHIMARU', id: 'KS-050-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU050_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.orochimaru050ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-050-C', 'AMBUSH', handleOrochimaru050Ambush);
}
