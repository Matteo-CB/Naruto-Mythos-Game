import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function mss07ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  
  let hasHiddenFriendly = false;

  if (state.activeMissions.length > 1) {
    for (let i = 0; i < state.activeMissions.length; i++) {
      for (const c of state.activeMissions[i][friendlySide]) {
        if (c.isHidden) {
          hasHiddenFriendly = true;
          break;
        }
      }
      if (hasHiddenFriendly) break;
    }
  }

  if (!hasHiddenFriendly) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 07 (I Have to Go): No hidden friendly character to move.',
      'game.log.effect.noTarget',
      { card: 'Je dois partir', id: 'KS-007-MMS' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS07_CONFIRM_SCORE',
    validTargets: ['KS-007-MMS'],
    description: 'MSS 07 (I Have to Go): Move a friendly hidden character in play.',
    descriptionKey: 'game.effect.desc.mss07ConfirmScore',
  };
}

export function registerMss07Handlers(): void {
  registerEffect('KS-007-MMS', 'SCORE', mss07ScoreHandler);
}
