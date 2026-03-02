import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * MSS 07 - "Je dois partir" / "I Have to Go"
 *
 * SCORE [↯]: Move a friendly hidden character in play.
 *   - OPTIONAL effect (no "you must" in text).
 *   - The scoring player may move one of their hidden characters from any mission
 *     to a different mission.
 *   - If multiple hidden characters, requires character selection.
 *   - If multiple destination missions, requires mission selection (two-stage).
 *   - Player can always decline.
 */

function mss07ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Collect all hidden friendly characters across all missions
  const validTargets: string[] = [];
  const charMissionMap: Record<string, number> = {};

  for (let i = 0; i < state.activeMissions.length; i++) {
    const chars = state.activeMissions[i][friendlySide];
    for (const c of chars) {
      if (c.isHidden) {
        // Check that there is at least one OTHER mission to move to
        const hasOtherMission = state.activeMissions.length > 1;
        if (hasOtherMission) {
          validTargets.push(c.instanceId);
          charMissionMap[c.instanceId] = i;
        }
      }
    }
  }

  if (validTargets.length === 0) {
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

  // If exactly one hidden friendly character, skip character selection
  // but still let the player choose destination (or decline)
  if (validTargets.length === 1) {
    const charId = validTargets[0];
    const fromMissionIndex = charMissionMap[charId];

    const otherMissions: string[] = [];
    for (let i = 0; i < state.activeMissions.length; i++) {
      if (i !== fromMissionIndex) {
        otherMissions.push(String(i));
      }
    }

    // Always let the player choose (with option to decline)
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'MSS07_CHOOSE_DESTINATION',
      validTargets: otherMissions,
      description: JSON.stringify({ text: 'MSS 07 (I Have to Go): Choose a mission to move the hidden character to.', charId, fromMissionIndex }),
      descriptionKey: 'game.effect.desc.mss07ChooseDestination',
      isOptional: true,
      onDecline: 'skip',
    };
  }

  // Multiple hidden friendly characters: require player to choose which one to move
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS07_MOVE_HIDDEN',
    validTargets,
    description: 'MSS 07 (I Have to Go): Choose a hidden friendly character to move.',
    descriptionKey: 'game.effect.desc.mss07MoveHidden',
    isOptional: true,
    onDecline: 'skip',
  };
}

export function registerMss07Handlers(): void {
  registerEffect('KS-007-MMS', 'SCORE', mss07ScoreHandler);
}
