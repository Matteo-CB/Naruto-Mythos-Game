import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';


function handleAsuma023Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  
  if (state.activeMissions.length <= 1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Asuma Sarutobi (023): No other mission available to move Team 10 character to.',
      'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: 'KS-023-C' }) } };
  }

  
  
  
  const validTargets: string[] = [];
  const allChars = [...mission.player1Characters, ...mission.player2Characters];
  for (const char of allChars) {
    if (char.instanceId === sourceCard.instanceId) continue;
    if (char.isHidden) continue; // Hidden chars are anonymous - can't identify keyword
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    if (topCard.keywords && topCard.keywords.includes('Team 10')) {
      
      const charController = mission.player1Characters.includes(char) ? 'player1' : 'player2';
      
      if (isMovementBlockedByKurenai(state, sourceMissionIndex, charController)) continue;
      
      const charName = topCard.name_fr;
      const controllerSide: 'player1Characters' | 'player2Characters' =
        charController === 'player1' ? 'player1Characters' : 'player2Characters';
      const hasValidDest = state.activeMissions.some((m, i) => {
        if (i === sourceMissionIndex) return false;
        return !m[controllerSide].some((c) => {
          if (c.instanceId === char.instanceId) return false;
          if (c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.name_fr === charName;
        });
      });
      if (!hasValidDest) continue;
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Asuma Sarutobi (023): No other Team 10 character in this mission to move.',
      'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: 'KS-023-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ASUMA023_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.asuma023ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-023-C', 'MAIN', handleAsuma023Main);
}
