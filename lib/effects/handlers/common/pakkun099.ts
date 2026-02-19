import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 099/130 - PAKKUN (Common)
 * Chakra: 1 | Power: 1
 * Group: Independent | Keywords: Ninja Hound
 * SCORE [arrow]: Move this character.
 *
 * Auto-resolves: when the player wins the mission where Pakkun is assigned,
 * moves Pakkun to the first available other mission. If no other missions
 * exist, the effect fizzles.
 */
function handlePakkun099Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find the first other mission to move to
  let destMissionIndex = -1;
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== sourceMissionIndex) {
      destMissionIndex = i;
      break;
    }
  }

  // If no other missions exist, effect fizzles
  if (destMissionIndex === -1) {
    return { state };
  }

  // Move Pakkun from source mission to destination mission
  const newMissions = state.activeMissions.map((m, idx) => {
    if (idx === sourceMissionIndex) {
      return {
        ...m,
        [friendlySide]: m[friendlySide].filter(
          (c) => c.instanceId !== sourceCard.instanceId
        ),
      };
    }
    if (idx === destMissionIndex) {
      const movedChar = { ...sourceCard, missionIndex: destMissionIndex };
      return {
        ...m,
        [friendlySide]: [...m[friendlySide], movedChar],
      };
    }
    return m;
  });

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_MOVE',
    `Pakkun (099): Moved self from mission ${sourceMissionIndex} to mission ${destMissionIndex}.`,
  );

  return { state: { ...state, activeMissions: newMissions, log } };
}

export function registerHandler(): void {
  registerEffect('099/130', 'SCORE', handlePakkun099Score);
}
