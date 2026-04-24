import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleHinata031Main(ctx: EffectContext): EffectResult {
  
  
  
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Hinata Hyuga (031): Byakugan active - gain 1 Chakra when a non-hidden enemy character is played in this mission (continuous).',
    'game.log.effect.continuous',
    { card: 'HINATA HYUGA', id: 'KS-031-UC' },
  );
  return { state: { ...state, log } };
}

export function registerHandler(): void {
  registerEffect('KS-031-UC', 'MAIN', handleHinata031Main);
}
