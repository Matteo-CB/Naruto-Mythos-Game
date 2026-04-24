import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function kisame144MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const opponentId = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';

  if (state[opponentId].chakra <= 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kisame Hoshigaki (144): Opponent has no chakra to steal.',
      'game.log.effect.noTarget',
      { card: 'KISAME HOSHIGAKI', id: 'KS-144-M' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KISAME144_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ opponentChakra: state[opponentId].chakra }),
    descriptionKey: 'game.effect.desc.kisame144ConfirmMain',
  };
}

export function registerKisame144Handlers(): void {
  registerEffect('KS-144-M', 'MAIN', kisame144MainHandler);
}
