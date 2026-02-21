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

  // Get the character name for name-uniqueness check at destination
  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Find all valid destination missions (not current, no same-name conflict)
  const validTargets: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    const hasSameName = friendlyChars.some((c) => {
      const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return tc.name_fr === charName;
    });
    if (!hasSameName) {
      validTargets.push(String(i));
    }
  }

  // If no valid destinations, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Pakkun (099): No other mission to move to.',
      'game.log.effect.noTarget', { card: 'PAKKUN', id: '099/130' }) } };
  }

  // If only one valid destination, auto-move
  if (validTargets.length === 1) {
    const destIdx = parseInt(validTargets[0], 10);
    return { state: movePakkun(state, sourceCard, sourceMissionIndex, destIdx, sourcePlayer, friendlySide) };
  }

  // Multiple valid destinations: let player choose
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'PAKKUN_MOVE_DESTINATION',
    validTargets,
    description: 'Pakkun (099): Choose a mission to move Pakkun to.',
  };
}

function movePakkun(
  state: EffectContext['state'],
  sourceCard: EffectContext['sourceCard'],
  sourceMissionIndex: number,
  destMissionIndex: number,
  sourcePlayer: import('../../../engine/types').PlayerID,
  friendlySide: 'player1Characters' | 'player2Characters',
): EffectContext['state'] {
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
    `Pakkun (099): Moved self from mission ${sourceMissionIndex + 1} to mission ${destMissionIndex + 1}.`,
    'game.log.effect.move',
    { card: 'PAKKUN', id: '099/130', from: String(sourceMissionIndex + 1), to: String(destMissionIndex + 1) },
  );

  return { ...state, activeMissions: newMissions, log };
}

export function registerHandler(): void {
  registerEffect('099/130', 'SCORE', handlePakkun099Score);
}
