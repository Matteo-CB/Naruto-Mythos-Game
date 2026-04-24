import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleDosu069Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Dosu Kinuta (069): No hidden characters in play to look at.',
      'game.log.effect.noTarget',
      { card: 'DOSU KINUTA', id: 'KS-069-UC' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DOSU069_CONFIRM_UPGRADE',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.dosu069ConfirmUpgrade',
  };
}

function handleDosu069Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Dosu Kinuta (069): No hidden enemy characters in play.',
      'game.log.effect.noTarget',
      { card: 'DOSU KINUTA', id: 'KS-069-UC' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DOSU069_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.dosu069ConfirmMain',
  };
}

export function registerDosu069Handlers(): void {
  registerEffect('KS-069-UC', 'UPGRADE', handleDosu069Upgrade);
  registerEffect('KS-069-UC', 'MAIN', handleDosu069Main);
}
