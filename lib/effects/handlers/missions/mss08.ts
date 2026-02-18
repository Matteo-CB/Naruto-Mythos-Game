import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterCard } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { generateInstanceId } from '../../../engine/utils/id';

/**
 * MSS 08 - "Tendre un piege" / "Set a Trap"
 *
 * SCORE [arrow]: Put a card from your hand as a hidden character to any mission.
 *   - The scoring player places a character card from their hand face-down (hidden)
 *     on any active mission.
 *   - No chakra cost is paid for this placement.
 *   - For automated play: pick the first card in hand and place on the first mission.
 */

function mss08ScoreHandler(ctx: EffectContext): EffectResult {
  const state = { ...ctx.state };
  const playerState = { ...state[ctx.sourcePlayer] };

  if (playerState.hand.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 08 (Set a Trap): No cards in hand to place as hidden.',
    );
    return { state: { ...state, log } };
  }

  if (state.activeMissions.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 08 (Set a Trap): No active missions to place a character on.',
    );
    return { state: { ...state, log } };
  }

  // Pick the first card from hand
  const hand = [...playerState.hand];
  const chosenCard = hand.shift()! as CharacterCard;
  playerState.hand = hand;
  playerState.charactersInPlay += 1;

  // Place as hidden on the first mission
  const targetMissionIndex = 0;
  const missions = [...state.activeMissions];
  const targetMission = { ...missions[targetMissionIndex] };

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const newCharacter = {
    instanceId: generateInstanceId(),
    card: chosenCard,
    isHidden: true,
    powerTokens: 0,
    stack: [chosenCard],
    controlledBy: ctx.sourcePlayer,
    originalOwner: ctx.sourcePlayer,
    missionIndex: targetMissionIndex,
  };

  targetMission[friendlySide] = [...targetMission[friendlySide], newCharacter];
  missions[targetMissionIndex] = targetMission;

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'SCORE_PLACE_HIDDEN',
    `MSS 08 (Set a Trap): Placed ${chosenCard.name_fr} as hidden character on mission ${targetMissionIndex}.`,
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

export function registerMss08Handlers(): void {
  registerEffect('MSS 08', 'SCORE', mss08ScoreHandler);
}
