import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function handleKimimaro056Main(ctx: EffectContext): EffectResult {
  
  
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Kimimaro (056): Enemy effects targeting this character require opponent to pay 1 Chakra (continuous).',
    'game.log.effect.continuous',
    { card: 'KIMIMARO', id: 'KS-056-UC' },
  );
  return { state: { ...ctx.state, log } };
}

function handleKimimaro056Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  
  if (playerState.hand.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kimimaro (056): No cards in hand to discard.',
      'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-056-UC' }) } };
  }

  
  const validHideTargets: string[] = [];

  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) continue;
      
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if ((topCard.chakra ?? 0) <= 4) {
        validHideTargets.push(char.instanceId);
      }
    }
  }

  
  if (validHideTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kimimaro (056): No character with cost 4 or less to hide.',
      'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-056-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIMIMARO056_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kimimaro056ConfirmUpgrade',
  };
}

export function registerKimimaro056Handlers(): void {
  registerEffect('KS-056-UC', 'MAIN', handleKimimaro056Main);
  registerEffect('KS-056-UC', 'UPGRADE', handleKimimaro056Upgrade);
}
