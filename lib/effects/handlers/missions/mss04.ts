import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

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
  const targetMap: Record<string, { char: CharacterInPlay; missionIndex: number }> = {};

  for (let i = 0; i < state.activeMissions.length; i++) {
    const chars = state.activeMissions[i][enemySide];
    for (const c of chars) {
      if (c.isHidden) {
        validTargets.push(c.instanceId);
        targetMap[c.instanceId] = { char: c, missionIndex: i };
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 04 (Assassination): No hidden enemy character to defeat.',
      'game.log.effect.noTarget',
      { card: 'Assassinat', id: 'MSS 04' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one valid target, auto-resolve
  if (validTargets.length === 1) {
    const target = targetMap[validTargets[0]];
    let newState = defeatEnemyCharacter(state, target.missionIndex, target.char.instanceId, ctx.sourcePlayer);

    const log = logAction(
      newState.log, newState.turn, newState.phase, ctx.sourcePlayer,
      'SCORE_DEFEAT',
      `MSS 04 (Assassination): Defeated hidden enemy ${target.char.card.name_fr} in mission ${target.missionIndex}.`,
      'game.log.score.defeat',
      { card: 'Assassinat', target: target.char.card.name_fr },
    );

    return { state: { ...newState, log } };
  }

  // Multiple valid targets: require player selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS04_DEFEAT_HIDDEN',
    validTargets,
    description: 'MSS 04 (Assassination): Choose a hidden enemy character to defeat.',
  };
}

export function registerMss04Handlers(): void {
  registerEffect('MSS 04', 'SCORE', mss04ScoreHandler);
}
