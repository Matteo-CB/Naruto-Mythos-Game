import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function sakura135MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.deck.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sakura Haruno (135): Deck is empty, no cards to look at.',
      'game.log.effect.noTarget',
      { card: 'SAKURA HARUNO', id: 'KS-135-S' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA135_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ costReduction: 0 }),
    descriptionKey: 'game.effect.desc.sakura135ConfirmMain',
  };
}

const SAKURA_135_IMPRESSIONS = ['KS-135-S', 'KS-135-SV', 'KS-135-MV'];

export function registerSakura135Handlers(): void {
  for (const id of SAKURA_135_IMPRESSIONS) {
    registerEffect(id, 'MAIN', sakura135MainHandler);
    registerEffect(id, 'UPGRADE', (ctx) => ({ state: ctx.state }));
  }
}
