import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleSakura012Main(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

function handleSakura012Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  
  if (state[sourcePlayer].deck.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakura Haruno (012): Deck is empty, cannot draw (upgrade effect fizzles).',
      'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-012-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA012_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.sakura012ConfirmUpgrade',
  };
}

export function registerSakura012Handlers(): void {
  registerEffect('KS-012-UC', 'MAIN', handleSakura012Main);
  registerEffect('KS-012-UC', 'UPGRADE', handleSakura012Upgrade);
}
