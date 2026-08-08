import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const NARUTO_005_ID = 'SS-005-M';
export const NARUTO_005_NAME = 'NARUTO UZUMAKI';

function placeFromDeck(ctx: EffectContext, confirmType: string, descriptionKey: string): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  if (state[sourcePlayer].deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Naruto Uzumaki (SS-005): the deck is empty.',
          'game.log.effect.noTarget', { card: NARUTO_005_NAME, id: NARUTO_005_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: confirmType,
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey,
  };
}

function naruto005Main(ctx: EffectContext): EffectResult {
  return placeFromDeck(ctx, 'SS005_CONFIRM_MAIN', 'game.effect.desc.ss005ConfirmMain');
}

function naruto005Ambush(ctx: EffectContext): EffectResult {
  return placeFromDeck(ctx, 'SS005_CONFIRM_AMBUSH', 'game.effect.desc.ss005ConfirmAmbush');
}

export function registerNaruto005Handlers(): void {
  registerEffect(NARUTO_005_ID, 'MAIN', naruto005Main);
  registerEffect(NARUTO_005_ID, 'AMBUSH', naruto005Ambush);
}
