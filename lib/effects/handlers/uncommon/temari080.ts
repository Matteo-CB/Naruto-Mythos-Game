import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 080/130 - TEMARI "Wind Scythe" (UC)
 * Chakra: 4 | Power: 3
 * Group: Sand Village | Keywords: Team Baki
 *
 * MAIN: Move another friendly Sand Village character to another mission.
 *   - Find friendly Sand Village characters across all missions (excluding self).
 *   - Requires target selection: which character to move and which mission to move them to.
 *   - Must check name uniqueness constraint at the destination mission.
 *
 * UPGRADE: Move this character to another mission.
 *   - Find valid destination missions for self (no same-name conflict at destination).
 *   - Requires target selection for which mission to move to.
 */

function handleTemari080Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all friendly Sand Village characters across all missions (not self)
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    const friendlyChars = mission[friendlySide];
    for (const char of friendlyChars) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) {
        // Hidden characters can be moved but we can't check group. Include them since
        // the player knows their own hidden cards.
        // Actually, for Sand Village check: the player knows the card, but we check the actual card.
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.group === 'Sand Village') {
          validTargets.push(char.instanceId);
        }
      } else {
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.group === 'Sand Village') {
          validTargets.push(char.instanceId);
        }
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Temari (080): No other friendly Sand Village character in play to move.',
      'game.log.effect.noTarget',
      { card: 'TEMARI', id: '080/130' },
    );
    return { state: { ...state, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_FRIENDLY_SAND_VILLAGE',
    validTargets,
    description: 'Temari (080): Select a friendly Sand Village character to move to another mission.',
  };
}

function handleTemari080Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find valid destination missions for self (must not have same-name conflict)
  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const selfName = topCard.name_fr;

  const validMissions: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue; // Can't move to same mission
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];

    // Check name uniqueness at destination
    const hasConflict = friendlyChars.some((c) => {
      const cTopCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return !c.isHidden && cTopCard.name_fr === selfName;
    });

    if (!hasConflict) {
      validMissions.push(String(i));
    }
  }

  if (validMissions.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_NO_TARGET',
      'Temari (080): No valid mission to move this character to (upgrade).',
      'game.log.effect.noTarget',
      { card: 'TEMARI', id: '080/130' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one valid mission, auto-apply
  if (validMissions.length === 1) {
    const targetMissionIdx = parseInt(validMissions[0], 10);
    const newState = moveCharacter(state, sourceCard.instanceId, sourceMissionIndex, targetMissionIdx, friendlySide);
    const log = logAction(
      newState.log,
      newState.turn,
      newState.phase,
      sourcePlayer,
      'EFFECT_MOVE',
      `Temari (080): Moved self to mission ${targetMissionIdx + 1} (upgrade).`,
      'game.log.effect.move',
      { card: 'TEMARI', id: '080/130', mission: String(targetMissionIdx + 1) },
    );
    return { state: { ...newState, log } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'MOVE_SELF_TO_MISSION',
    validTargets: validMissions,
    description: 'Temari (080) UPGRADE: Select a mission to move this character to.',
  };
}

/**
 * Move a character from one mission to another.
 * Immutable state update.
 */
function moveCharacter(
  state: import('../../EffectTypes').EffectContext['state'],
  instanceId: string,
  fromMissionIdx: number,
  toMissionIdx: number,
  side: 'player1Characters' | 'player2Characters',
): import('../../EffectTypes').EffectContext['state'] {
  const missions = [...state.activeMissions];
  const fromMission = { ...missions[fromMissionIdx] };
  const toMission = { ...missions[toMissionIdx] };

  const fromChars = [...fromMission[side]];
  const charIndex = fromChars.findIndex((c) => c.instanceId === instanceId);
  if (charIndex === -1) return state;

  const movedChar = { ...fromChars[charIndex], missionIndex: toMissionIdx };
  fromChars.splice(charIndex, 1);
  fromMission[side] = fromChars;

  toMission[side] = [...toMission[side], movedChar];

  missions[fromMissionIdx] = fromMission;
  missions[toMissionIdx] = toMission;

  return { ...state, activeMissions: missions };
}

export function registerTemari080Handlers(): void {
  registerEffect('080/130', 'MAIN', handleTemari080Main);
  registerEffect('080/130', 'UPGRADE', handleTemari080Upgrade);
}
