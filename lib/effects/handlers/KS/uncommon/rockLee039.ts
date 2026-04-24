import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function rockLeeMainHandler(ctx: EffectContext): EffectResult {
  
  
  
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Rock Lee: Power tokens will be retained at end of round (continuous).',
    'game.log.effect.powerupSelf', { card: 'ROCK LEE', id: 'KS-039-UC', amount: 0 },
  );
  return { state: { ...state, log } };
}

function rockLeeUpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ROCKLEE039_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.rockLee039ConfirmUpgrade',
  };
}

export function registerRockLee039Handlers(): void {
  registerEffect('KS-039-UC', 'MAIN', rockLeeMainHandler);
  registerEffect('KS-039-UC', 'UPGRADE', rockLeeUpgradeHandler);
}
