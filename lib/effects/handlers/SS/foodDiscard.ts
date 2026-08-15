import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';

export const CHOJI_009 = 'SS-009-C';

export function indicesDeNourriture(state: GameState, player: PlayerID): number[] {
  const main = state[player].hand as unknown as CardData[];
  const indices: number[] = [];
  for (let i = 0; i < main.length; i++) {
    if ((main[i]?.keywords ?? []).includes('Food')) indices.push(i);
  }
  return indices;
}

function choji009(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const indices = indicesDeNourriture(state, sourcePlayer);
  if (indices.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Choji Akimichi (009): no Food card in hand.',
          'game.log.effect.noTarget', { card: 'CHOJI AKIMICHI', id: CHOJI_009 }),
      },
    };
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS009_DISCARD_FOOD',
    validTargets: indices.map((i) => String(i)),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss009DiscardFood',
  }, sourceCard.instanceId, 'SS009_CONFIRM_MAIN');
}

export function registerFoodDiscardHandlers(): void {
  registerEffect(CHOJI_009, 'MAIN', choji009);
}
