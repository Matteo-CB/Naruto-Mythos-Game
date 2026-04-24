import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';



function kidomaru124AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' as const : 'player1' as const;
  
  
  const wasUpgraded = sourceCard && sourceCard.stack?.length >= 2;
  const powerLimit = wasUpgraded ? 5 : 3;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue; // Skip this mission
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (getEffectivePower(state, char, opponentPlayer) <= powerLimit) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Kidomaru (124) AMBUSH: No enemy with Power ${powerLimit} or less in other missions.`,
          'game.log.effect.noTarget',
          { card: 'KIDOMARU', id: 'KS-124-R' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU124_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    description: JSON.stringify({ wasUpgraded, powerLimit, sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.kidomaru124ConfirmAmbush',
    isOptional: true,
  };
}

function kidomaru124UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerKidomaru124Handlers(): void {
  registerEffect('KS-124-R', 'AMBUSH', kidomaru124AmbushHandler);
  registerEffect('KS-124-R', 'UPGRADE', kidomaru124UpgradeHandler);
}
