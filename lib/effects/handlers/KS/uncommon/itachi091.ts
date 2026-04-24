import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleItachi091Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const opponentHand = state[opponentPlayer].hand;

  
  if (opponentHand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Itachi Uchiwa (091): Opponent has no cards in hand.',
      'game.log.effect.noTarget',
      { card: 'ITACHI UCHIWA', id: 'KS-091-UC' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ITACHI091_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Itachi Uchiwa (091) MAIN: Look at all cards in opponent\'s hand.',
    descriptionKey: 'game.effect.desc.itachi091ConfirmMain',
  };
}

function handleItachi091UpgradeNoop(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerItachi091Handlers(): void {
  registerEffect('KS-091-UC', 'MAIN', handleItachi091Main);
  registerEffect('KS-091-UC', 'UPGRADE', handleItachi091UpgradeNoop);
}
