import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleUkon063Main(ctx: EffectContext): EffectResult {
  
  
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Ukon (063): Can be played as upgrade over any Sound Village character (continuous).',
    'game.log.effect.continuous',
    { card: 'UKON', id: 'KS-063-UC' },
  );
  return { state: { ...ctx.state, log } };
}

export function registerHandler(): void {
  registerEffect('KS-063-UC', 'MAIN', handleUkon063Main);
}
