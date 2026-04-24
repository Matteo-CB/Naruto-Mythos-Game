import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function naruto145MainHandler(ctx: EffectContext): EffectResult {
  
  const log = logAction(
    ctx.state.log, ctx.state.turn, ctx.state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Naruto Uzumaki (145): Hidden characters in this mission gain +1 Power while you hold the Edge token (continuous).',
    'game.log.effect.continuous',
    { card: 'NARUTO UZUMAKI', id: 'KS-145-M' },
  );
  return { state: { ...ctx.state, log } };
}

export function registerHandler(): void {
  registerEffect('KS-145-M', 'MAIN', naruto145MainHandler);
}
