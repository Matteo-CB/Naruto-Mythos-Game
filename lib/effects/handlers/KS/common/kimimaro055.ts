import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';


function handleKimimaro055Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];
  const opponent = sourcePlayer === 'player1' ? 'player2' : 'player1';

  
  if (playerState.hand.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kimimaro (055): No cards in hand to discard.',
      'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-055-C' }) } };
  }

  
  const validTargets: string[] = [];

  
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponent === 'player1' ? 'player1Characters' : 'player2Characters';

  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;
      if (!canBeHiddenByEnemy(state, char, opponent)) continue;
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if ((topCard.chakra ?? 0) <= 3) {
        validTargets.push(char.instanceId);
      }
    }
  }

  
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) continue;
      
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if ((topCard.chakra ?? 0) <= 3) {
        validTargets.push(char.instanceId);
      }
    }
  }

  
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kimimaro (055): No character with cost 3 or less to hide.',
      'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-055-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIMIMARO055_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kimimaro055ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-055-C', 'AMBUSH', handleKimimaro055Ambush);
}
