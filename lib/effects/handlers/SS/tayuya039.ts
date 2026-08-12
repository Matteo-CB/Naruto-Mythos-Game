import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const TAYUYA_039_ID = 'SS-039-C';
export const TAYUYA_039_NAME = 'TAYUYA';
export const TAYUYA_039_CHAKRA = 2;

function tayuya039FirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const ps = state[sourcePlayer];

  const newState = {
    ...state,
    [sourcePlayer]: { ...ps, chakra: ps.chakra + TAYUYA_039_CHAKRA },
  };

  return {
    state: {
      ...newState,
      log: logAction(newState.log, newState.turn, newState.phase, sourcePlayer, 'EFFECT',
        `Tayuya (039) FIRST STRIKE: gained ${TAYUYA_039_CHAKRA} Chakra.`,
        'game.log.effect.gainChakra',
        { card: TAYUYA_039_NAME, id: TAYUYA_039_ID, amount: String(TAYUYA_039_CHAKRA) }),
    },
  };
}

export function registerTayuya039Handlers(): void {
  registerEffect(TAYUYA_039_ID, 'FIRST_STRIKE', tayuya039FirstStrike);
}
