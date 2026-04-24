import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';



function kiba113MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  
  const akamaruTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of mission[friendlySide]) {
      if (!char.isHidden) {
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if (topCard.name_fr.toLowerCase().includes('akamaru')) {
          akamaruTargets.push(char.instanceId);
        }
      }
    }
  }

  if (akamaruTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kiba Inuzuka (113): No friendly non-hidden Akamaru in play.',
          'game.log.effect.noTarget',
          { card: 'KIBA INUZUKA', id: 'KS-113-R' },
        ),
      },
    };
  }

  
  
  const kibaMission = state.activeMissions[sourceMissionIndex];
  const hasTarget = kibaMission && [
    ...kibaMission[friendlySide].filter(c => c.instanceId !== sourceCard.instanceId),
    ...kibaMission[enemySide],
  ].some(c => !c.isHidden);
  if (!hasTarget) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kiba Inuzuka (113): No non-hidden character in this mission to target.',
          'game.log.effect.noTarget',
          { card: 'KIBA INUZUKA', id: 'KS-113-R' },
        ),
      },
    };
  }

  
  const extraData = JSON.stringify({
    sourceMissionIndex,
    sourceCardInstanceId: sourceCard.instanceId,
    isUpgrade: isUpgrade ? 'true' : 'false',
  });

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIBA113_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: extraData,
    descriptionKey: 'game.effect.desc.kiba113ConfirmMain',
  };
}

function kiba113UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerKiba113Handlers(): void {
  registerEffect('KS-113-R', 'MAIN', kiba113MainHandler);
  registerEffect('KS-113-R', 'UPGRADE', kiba113UpgradeHandler);
}
