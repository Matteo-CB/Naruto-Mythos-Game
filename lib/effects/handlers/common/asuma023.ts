import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 023/130 - ASUMA SARUTOBI (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: Move another Team 10 character from this mission.
 *
 * Auto-resolves: finds the first Team 10 character (not self) in the source
 * mission and moves it to the first available different mission. Optional effect
 * — fizzles if no valid Team 10 target or no other mission exists.
 */
function handleAsuma023Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = mission[friendlySide];

  // Find the first other Team 10 character in this mission (not self)
  let target: CharacterInPlay | undefined;
  for (const char of friendlyChars) {
    if (char.instanceId === sourceCard.instanceId) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.keywords && topCard.keywords.includes('Team 10')) {
      target = char;
      break;
    }
  }

  if (!target) {
    return { state };
  }

  // Find the first different mission to move to
  let destMissionIndex = -1;
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== sourceMissionIndex) {
      destMissionIndex = i;
      break;
    }
  }

  if (destMissionIndex === -1) {
    return { state };
  }

  // Build new state immutably
  const newMissions = state.activeMissions.map((m, idx) => {
    if (idx === sourceMissionIndex) {
      // Remove target from source mission
      return {
        ...m,
        [friendlySide]: m[friendlySide].filter(
          (c) => c.instanceId !== target!.instanceId
        ),
      };
    }
    if (idx === destMissionIndex) {
      // Add target to destination mission
      const movedChar = { ...target!, missionIndex: destMissionIndex };
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
    `Asuma Sarutobi (023): Moved Team 10 character ${target.card.name_fr} from mission ${sourceMissionIndex} to mission ${destMissionIndex}.`,
  );

  return { state: { ...state, activeMissions: newMissions, log } };
}

export function registerHandler(): void {
  registerEffect('023/130', 'MAIN', handleAsuma023Main);
}
