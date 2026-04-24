import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleGai043Main(ctx: EffectContext): EffectResult {
  
  
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Gai Maito (043): Power tokens will be retained at end of round (continuous).',
    'game.log.effect.continuous',
    { card: 'GAI MAITO', id: 'KS-043-UC' },
  );
  return { state: { ...ctx.state, log } };
}

function handleGai043Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GAI043_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.gai043ConfirmUpgrade',
  };
}

export function registerGai043Handlers(): void {
  registerEffect('KS-043-UC', 'MAIN', handleGai043Main);
  registerEffect('KS-043-UC', 'UPGRADE', handleGai043Upgrade);
}
