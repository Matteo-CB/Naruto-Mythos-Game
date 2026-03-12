import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * MSS 04 - "Assassinat" / "Assassination"
 *
 * SCORE [arrow]: Defeat an enemy hidden character.
 */

function mss04ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Collect all hidden enemy characters across all missions
  const validTargets: string[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    const chars = state.activeMissions[i][enemySide];
    for (const c of chars) {
      if (c.isHidden) {
        validTargets.push(c.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 04 (Assassination): No hidden enemy character to defeat.',
      'game.log.effect.noTarget',
      { card: 'Assassinat', id: 'KS-004-MMS' },
    );
    return { state: { ...state, log } };
  }

  // CONFIRM popup before defeat
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS04_CONFIRM_SCORE',
    validTargets: ['KS-004-MMS'],
    description: 'MSS 04 (Assassination): Defeat an enemy hidden character.',
    descriptionKey: 'game.effect.desc.mss04ConfirmScore',
  };
}

export function registerMss04Handlers(): void {
  registerEffect('KS-004-MMS', 'SCORE', mss04ScoreHandler);
}
