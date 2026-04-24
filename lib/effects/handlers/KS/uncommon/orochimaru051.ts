import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';



function handleOrochimaru051Main(ctx: EffectContext): EffectResult {
  
  
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Orochimaru (051): If this mission is lost, this character will move to another mission (continuous).',
    'game.log.effect.continuous',
    { card: 'OROCHIMARU', id: 'KS-051-UC' },
  );
  return { state: { ...ctx.state, log } };
}

function handleOrochimaru051Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponentPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  
  const validTargets: string[] = [];
  const targetMissionMap: Record<string, number> = {};

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const char of mission[enemySide]) {
      if (char.isHidden) {
        validTargets.push(char.instanceId);
        targetMissionMap[char.instanceId] = i;
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Orochimaru (051): No hidden enemy character in play to defeat.',
      'game.log.effect.noTarget', { card: 'OROCHIMARU', id: 'KS-051-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'OROCHIMARU051_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.orochimaru051ConfirmUpgrade',
  };
}

export function registerOrochimaru051Handlers(): void {
  registerEffect('KS-051-UC', 'MAIN', handleOrochimaru051Main);
  registerEffect('KS-051-UC', 'UPGRADE', handleOrochimaru051Upgrade);
}
