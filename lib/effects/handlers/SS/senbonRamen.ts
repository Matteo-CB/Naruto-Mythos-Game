import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const SENBON_ID = 'SS-079-C';
export const SENBON_NAME = 'SENBON';
export const SENBON_POWERUP = 1;
export const RAMEN_ID = 'SS-081-C';
export const RAMEN_NAME = 'RÂMEN';

function senbon079Main(ctx: EffectContext): EffectResult {
  const { state, sourceCard } = ctx;
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS079_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss079ConfirmMain',
  };
}

function ramen081Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  if (state[sourcePlayer].deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Ramen (SS-081): the deck is empty, no card to draw.',
          'game.log.effect.noTarget', { card: RAMEN_NAME, id: RAMEN_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS081_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss081ConfirmMain',
  };
}

export function registerSenbonRamenHandlers(): void {
  registerEffect(SENBON_ID, 'MAIN', senbon079Main);
  registerEffect(RAMEN_ID, 'MAIN', ramen081Main);
}
