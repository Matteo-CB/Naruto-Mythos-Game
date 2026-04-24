import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';



function naruto141MainHandler(ctx: EffectContext): EffectResult {
  const state = ctx.state;
  const playerState = state[ctx.sourcePlayer];

  
  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Naruto Uzumaki (141): No cards in hand to discard, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'KS-141-M' },
    );
    return { state: { ...state, log } };
  }

  
  const enemySide = ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const opponentPlayer = ctx.sourcePlayer === 'player1' ? 'player2' : 'player1';
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const hasHideTargets = thisMission?.[enemySide]?.some((c) => {
    if (c.isHidden) return false;
    return getEffectivePower(state, c, opponentPlayer) <= 4;
  });
  if (!hasHideTargets) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Naruto Uzumaki (141): No enemy character with Power 4 or less in this mission to hide.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'KS-141-M' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO141_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    description: JSON.stringify({ handSize: playerState.hand.length }),
    descriptionKey: 'game.effect.desc.naruto141ConfirmMain',
  };
}

export function registerNaruto141Handlers(): void {
  registerEffect('KS-141-M', 'MAIN', naruto141MainHandler);
}
