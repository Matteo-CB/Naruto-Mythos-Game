import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function choji112MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Choji Akimichi (112): Hand is empty, cannot discard.',
      'game.log.effect.noTarget',
      { card: 'CHOJI AKIMICHI', id: 'KS-112-R' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'CHOJI112_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Choji Akimichi (112) MAIN: Discard a card from hand. POWERUP X (X = cost).',
    descriptionKey: 'game.effect.desc.choji112ConfirmMain',
  };
}

function choji112UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerChoji112Handlers(): void {
  registerEffect('KS-112-R', 'MAIN', choji112MainHandler);
  registerEffect('KS-112-R', 'UPGRADE', choji112UpgradeHandler);
}
