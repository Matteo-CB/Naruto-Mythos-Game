import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleTsunade004Main(ctx: EffectContext): EffectResult {
  
  
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Tsunade (004): Defeated friendly characters will go to hand instead of discard pile (continuous).',
    'game.log.effect.continuous',
    { card: 'TSUNADE', id: 'KS-004-UC' },
  );
  return { state: { ...state, log } };
}

function handleTsunade004Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  
  const discardPile = playerState.discardPile;
  let hasCharacter = false;
  for (let idx = 0; idx < discardPile.length; idx++) {
    if (discardPile[idx].card_type === 'character') {
      hasCharacter = true;
      break;
    }
  }
  if (!hasCharacter) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Tsunade (004): No characters in discard pile to recover.',
      'game.log.effect.noTarget', { card: 'TSUNADE', id: 'KS-004-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TSUNADE004_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.tsunade004ConfirmUpgrade',
  };
}

export function registerTsunade004Handlers(): void {
  registerEffect('KS-004-UC', 'MAIN', handleTsunade004Main);
  registerEffect('KS-004-UC', 'UPGRADE', handleTsunade004Upgrade);
}
