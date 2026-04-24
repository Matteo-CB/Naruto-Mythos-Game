import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleGiantSpider103Main(ctx: EffectContext): EffectResult {
  
  
  
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Giant Spider (103): At end of round, will hide a character with Power <= own Power, then return to hand (continuous).',
    'game.log.effect.continuous',
    { card: 'ARAIGNEE GEANTE', id: 'KS-103-UC' },
  );
  return { state: { ...state, log } };
}

export function registerHandler(): void {
  registerEffect('KS-103-UC', 'MAIN', handleGiantSpider103Main);
}
