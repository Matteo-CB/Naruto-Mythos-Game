import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * MSS 05 - "Ramener" / "Bring it Back"
 *
 * SCORE [arrow]: You must return one friendly non-hidden character in this mission
 *                to your hand, if able.
 *   - This is mandatory ("you must") if a valid target exists ("if able").
 *   - Returns the top card of the character's stack to the player's hand.
 *   - If multiple valid targets, requires target selection. Auto-resolves with 1 target.
 */

function mss05ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const mission = state.activeMissions[ctx.sourceMissionIndex];
  const friendlyChars = mission[friendlySide];

  // Collect all non-hidden friendly characters in THIS mission
  const validTargets: string[] = [];
  for (const c of friendlyChars) {
    if (!c.isHidden) {
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
      'MSS 05 (Bring it Back): No non-hidden friendly character in this mission to return.',
      'game.log.effect.noTarget',
      { card: 'Ramener', id: 'MSS 05' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one valid target, auto-resolve
  if (validTargets.length === 1) {
    return applyMss05ReturnToHand(state, validTargets[0], ctx.sourcePlayer, friendlySide, ctx.sourceMissionIndex);
  }

  // Multiple valid targets: require player selection (this is mandatory - "you must")
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MSS05_RETURN_TO_HAND',
    validTargets,
    description: 'MSS 05 (Bring it Back): Choose a friendly character in this mission to return to your hand (mandatory).',
  };
}

function applyMss05ReturnToHand(
  state: import('../../EffectTypes').EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: import('../../../engine/types').PlayerID,
  friendlySide: 'player1Characters' | 'player2Characters',
  sourceMissionIndex: number,
): EffectResult {
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars = mission[friendlySide];
  const targetIndex = friendlyChars.findIndex((c) => c.instanceId === targetInstanceId);

  if (targetIndex === -1) {
    return { state };
  }

  const target = friendlyChars[targetIndex];

  // Remove from mission
  const missions = [...state.activeMissions];
  const updatedMission = { ...missions[sourceMissionIndex] };
  const chars = [...updatedMission[friendlySide]];
  chars.splice(targetIndex, 1);
  updatedMission[friendlySide] = chars;
  missions[sourceMissionIndex] = updatedMission;

  // Return the entire character stack to player's hand
  const playerState = { ...state[sourcePlayer] };
  const cardsToReturn = target.stack.length > 0 ? [...target.stack] : [target.card];
  playerState.hand = [...playerState.hand, ...cardsToReturn];
  playerState.charactersInPlay = Math.max(0, playerState.charactersInPlay - 1);

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'SCORE_RETURN',
    `MSS 05 (Bring it Back): Returned ${target.card.name_fr} from this mission to hand (mandatory).`,
    'game.log.score.returnToHand',
    { card: 'Ramener', target: target.card.name_fr },
  );

  return {
    state: {
      ...state,
      activeMissions: missions,
      [sourcePlayer]: playerState,
      log,
    },
  };
}

export function registerMss05Handlers(): void {
  registerEffect('MSS 05', 'SCORE', mss05ScoreHandler);
}
