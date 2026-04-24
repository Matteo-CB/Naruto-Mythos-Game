import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleTenten118Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  
  let hasHiddenTarget = false;
  for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
    if (char.isHidden) {
      hasHiddenTarget = true;
      break;
    }
  }

  
  if (!hasHiddenTarget) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tenten (118): No hidden characters in this mission to defeat.',
      'game.log.effect.noTarget', { card: 'TENTEN', id: 'KS-118-R' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TENTEN118_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Tenten (118) AMBUSH: Defeat a hidden character in this mission.',
    descriptionKey: 'game.effect.desc.tenten118ConfirmAmbush',
  };
}

export function registerTenten118Handlers(): void {
  registerEffect('KS-118-R', 'AMBUSH', handleTenten118Ambush);
  
  registerEffect('KS-118-RA', 'AMBUSH', handleTenten118Ambush);
}
