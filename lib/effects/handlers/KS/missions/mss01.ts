import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * MSS 01 - "Appel de soutien" / "Call for Support"
 *
 * SCORE [arrow]: POWERUP 2 a character in play.
 *   - When the winning player scores this mission, they add 2 power tokens
 *     to any friendly character currently in play.
 *   - If multiple valid targets, requires target selection. Auto-resolves with 1 target.
 */

function mss01ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };

  // Check if there are any characters in play to receive POWERUP
  let hasChars = false;
  for (const mission of state.activeMissions) {
    if (mission.player1Characters.length > 0 || mission.player2Characters.length > 0) {
      hasChars = true;
      break;
    }
  }

  if (!hasChars) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 01 (Call for Support): No friendly character in play to receive POWERUP 2.',
      'game.log.effect.noTarget',
      { card: 'Appel de soutien', id: 'KS-001-MMS' },
    );
    return { state: { ...state, log } };
  }

  // CONFIRM popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS01_CONFIRM_SCORE',
    validTargets: ['KS-001-MMS'],
    description: 'MSS 01 (Call for Support): POWERUP 2 a character in play.',
    descriptionKey: 'game.effect.desc.mss01ConfirmScore',
  };
}

export function registerMss01Handlers(): void {
  registerEffect('KS-001-MMS', 'SCORE', mss01ScoreHandler);
}
