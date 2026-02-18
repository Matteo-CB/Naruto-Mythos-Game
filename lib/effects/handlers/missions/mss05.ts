import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * MSS 05 - "Ramener" / "Bring it Back"
 *
 * SCORE [arrow]: You must return one friendly non-hidden character in this mission
 *                to your hand, if able.
 *   - This is mandatory ("you must") if a valid target exists ("if able").
 *   - Returns the top card of the character's stack to the player's hand.
 *   - For automated play: pick the first non-hidden friendly character in this mission.
 */

function mss05ScoreHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const mission = state.activeMissions[ctx.sourceMissionIndex];
  const friendlyChars = mission[friendlySide];

  // Find first non-hidden friendly character in this mission
  const targetIndex = friendlyChars.findIndex((c) => !c.isHidden);

  if (targetIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 05 (Bring it Back): No non-hidden friendly character in this mission to return.',
    );
    return { state: { ...state, log } };
  }

  const target = friendlyChars[targetIndex];

  // Remove from mission
  const missions = [...state.activeMissions];
  const updatedMission = { ...missions[ctx.sourceMissionIndex] };
  const chars = [...updatedMission[friendlySide]];
  chars.splice(targetIndex, 1);
  updatedMission[friendlySide] = chars;
  missions[ctx.sourceMissionIndex] = updatedMission;

  // Return top card to player's hand
  const playerState = { ...state[ctx.sourcePlayer] };
  const returnCard = target.stack.length > 0 ? target.stack[target.stack.length - 1] : target.card;
  playerState.hand = [...playerState.hand, returnCard];
  playerState.charactersInPlay = Math.max(0, playerState.charactersInPlay - 1);

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'SCORE_RETURN',
    `MSS 05 (Bring it Back): Returned ${target.card.name_fr} from this mission to hand (mandatory).`,
  );

  return {
    state: {
      ...state,
      activeMissions: missions,
      [ctx.sourcePlayer]: playerState,
      log,
    },
  };
}

export function registerMss05Handlers(): void {
  registerEffect('MSS 05', 'SCORE', mss05ScoreHandler);
}
