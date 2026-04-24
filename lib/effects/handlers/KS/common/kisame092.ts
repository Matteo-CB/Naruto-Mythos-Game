import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleKisame092Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemyChars =
    opponentPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  
  const hasTokenTarget = enemyChars.some((char) => char.powerTokens > 0);

  if (!hasTokenTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kisame Hoshigaki (092): No enemy with Power tokens in this mission.',
      'game.log.effect.noTarget', { card: 'KISAME HOSHIGAKI', id: 'KS-092-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KISAME092_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kisame092ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-092-C', 'AMBUSH', handleKisame092Ambush);
}
