import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function sakura147MainHandler(ctx: EffectContext): EffectResult {
  
  const log = logAction(
    ctx.state.log, ctx.state.turn, ctx.state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Sakura Haruno (147): CHAKRA +2 while you do not hold the Edge token (continuous).',
    'game.log.effect.continuous',
    { card: 'SAKURA HARUNO', id: 'KS-147-M' },
  );
  return { state: { ...ctx.state, log } };
}

export function registerHandler(): void {
  registerEffect('KS-147-M', 'MAIN', sakura147MainHandler);
}
