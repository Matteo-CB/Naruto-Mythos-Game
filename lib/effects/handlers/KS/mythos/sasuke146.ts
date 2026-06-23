import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function sasuke146MainHandler(ctx: EffectContext): EffectResult {
  const log = logAction(
    ctx.state.log, ctx.state.turn, ctx.state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Sasuke Uchiwa (146): Enemy hidden characters in this mission have -1 Power while you hold the Edge token (continuous).',
    'game.log.effect.continuous',
    { card: 'SASUKE UCHIWA', id: 'KS-146-M' },
  );
  return { state: { ...ctx.state, log } };
}

export function registerHandler(): void {
  registerEffect('KS-146-M', 'MAIN', sasuke146MainHandler);
}
