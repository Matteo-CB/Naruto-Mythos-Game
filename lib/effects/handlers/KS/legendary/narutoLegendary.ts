import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';



function narutoLegendaryMainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySideKey: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  
  const thisMission = state.activeMissions[sourceMissionIndex];
  const validTarget1 = thisMission[enemySideKey]
    .filter((c) => !c.isHidden && getEffectivePower(state, c, opponentPlayer) <= 5)
    .map((c) => c.instanceId);

  
  const validTarget2: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySideKey]) {
      if (!char.isHidden && getEffectivePower(state, char, opponentPlayer) <= 2) {
        validTarget2.push(char.instanceId);
      }
    }
  }

  if (validTarget1.length === 0 && validTarget2.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Naruto Uzumaki (Legendary): No valid enemy targets in play.',
      'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-133-L' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO_LEGENDARY_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    description: JSON.stringify({ missionIndex: sourceMissionIndex, useDefeat: false }),
    descriptionKey: 'game.effect.desc.narutoLegendaryConfirmMain',
    isOptional: true,
  };
}

export function registerNarutoLegendaryHandlers(): void {
  registerEffect('KS-133-L', 'MAIN', narutoLegendaryMainHandler);
  registerEffect('KS-133-L', 'UPGRADE', (ctx) => ({ state: ctx.state })); // Handled by MAIN via isUpgrade
}
