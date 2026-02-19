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
  let state = { ...ctx.state };

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  let targetChar: CharacterInPlay | undefined;
  let targetMissionIndex = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    const chars = state.activeMissions[i][enemySide];
    for (const c of chars) {
      if (c.isHidden) {
        targetChar = c;
        targetMissionIndex = i;
        break;
      }
    }
    if (targetChar) break;
  }

  if (!targetChar || targetMissionIndex === -1) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 04 (Assassination): No hidden enemy character to defeat.',
      'game.log.effect.noTarget',
      { card: 'Assassinat', id: 'MSS 04' },
    );
    return { state: { ...state, log } };
  }

  state = defeatEnemyCharacter(state, targetMissionIndex, targetChar.instanceId, ctx.sourcePlayer);

  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'SCORE_DEFEAT',
    `MSS 04 (Assassination): Defeated hidden enemy ${targetChar.card.name_fr} in mission ${targetMissionIndex}.`,
    'game.log.score.defeat',
    { card: 'Assassinat', target: targetChar.card.name_fr },
  );

  return { state: { ...state, log } };
}

export function registerMss04Handlers(): void {
  registerEffect('MSS 04', 'SCORE', mss04ScoreHandler);
}
