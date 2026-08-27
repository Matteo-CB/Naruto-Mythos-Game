import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function itachi140MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;

  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentState = state[opponentPlayer];

  const handSize = opponentState.hand.length;

  if (handSize === 0 && !ctx.isUpgrade) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (140): Opponent hand is already empty, nothing to discard.',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-140-S' },
    );
    return { state: { ...state, log } };
  }

  
  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI140_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ isUpgrade: ctx.isUpgrade }),
    descriptionKey: 'game.effect.desc.itachi140ConfirmMain',
  };
}

function itachi140UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerItachi140Handlers(): void {
  registerEffect('KS-140-S', 'MAIN', itachi140MainHandler);
  registerEffect('KS-140-S', 'UPGRADE', itachi140UpgradeHandler);
}
