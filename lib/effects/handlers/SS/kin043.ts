import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const KIN_043_ID = 'SS-043-UC';
export const KIN_043_NAME = 'KIN TSUCHI';
export const KIN_043_DISCOUNT = 1;

function kin043Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const discardSize = state[sourcePlayer].discardPile.length;

  if (discardSize === 0) {
    const refused: GameState = {
      ...state,
      log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
        'Kin Tsuchi (SS-043) MAIN: your discard pile is empty, she was played at full price.',
        'game.log.effect.ss043NoDiscard', { card: KIN_043_NAME, id: KIN_043_ID }),
    };
    return { state: refused };
  }

  const applied: GameState = {
    ...state,
    log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_COST_REDUCTION',
      'Kin Tsuchi (SS-043) MAIN: your discard pile is not empty, she was played paying 1 Chakra less.',
      'game.log.effect.ss043Discount', { card: KIN_043_NAME, id: KIN_043_ID, amount: KIN_043_DISCOUNT }),
  };

  return { state: applied };
}

export function registerKin043Handlers(): void {
  registerEffect(KIN_043_ID, 'MAIN', kin043Main);
}
