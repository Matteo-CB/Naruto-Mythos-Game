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

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Collect all friendly characters in play (hidden characters are valid POWERUP targets per rules)
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    const chars = mission[friendlySide];
    for (const c of chars) {
      validTargets.push(c.instanceId);
    }
  }

  if (validTargets.length === 0) {
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

  // Always let player choose (optional effect)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS01_POWERUP_TARGET',
    validTargets,
    description: 'MSS 01 (Call for Support): Choose a friendly character to give POWERUP 2.',
    descriptionKey: 'game.effect.desc.mss01Powerup',
  };
}

function applyMss01Powerup(
  state: import('@/lib/effects/EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
  friendlySide: 'player1Characters' | 'player2Characters',
): EffectResult {
  let targetName = '';
  let targetMissionIndex = -1;

  const missions = state.activeMissions.map((mission, mIdx) => ({
    ...mission,
    [friendlySide]: mission[friendlySide].map((char) => {
      if (char.instanceId === targetInstanceId) {
        targetName = char.card.name_fr;
        targetMissionIndex = mIdx;
        return { ...char, powerTokens: char.powerTokens + 2 };
      }
      return char;
    }),
  }));

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'SCORE_POWERUP',
    `MSS 01 (Call for Support): POWERUP 2 on ${targetName} in mission ${targetMissionIndex}.`,
    'game.log.score.powerup',
    { card: 'Appel de soutien', amount: 2, target: targetName },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerMss01Handlers(): void {
  registerEffect('KS-001-MMS', 'SCORE', mss01ScoreHandler);
}
