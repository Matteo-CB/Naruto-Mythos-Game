import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 107/130 - SASUKE UCHIWA (R)
 * Chakra: 5, Power: 5
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Must move all other non-hidden friendly characters from this mission to other missions.
 *   This is a mandatory effect ("must"). All non-hidden friendly characters in this mission
 *   (except Sasuke himself) are moved to other missions.
 *
 * UPGRADE: POWERUP X where X = number of characters moved.
 *   When isUpgrade: count the moved characters and apply POWERUP on self.
 */

function sasuke107MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars = mission[friendlySide];

  // Find non-hidden friendly characters in this mission (excluding self)
  const charsToMove = friendlyChars.filter(
    (c: CharacterInPlay) => c.instanceId !== sourceCard.instanceId && !c.isHidden,
  );

  if (charsToMove.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sasuke Uchiwa (107): No other non-hidden friendly characters in this mission to move.',
          'game.log.effect.noTarget',
          { card: 'SASUKE UCHIWA', id: '107/130' },
        ),
      },
    };
  }

  // Get available missions (not the current one)
  const otherMissionIndices: number[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== sourceMissionIndex) {
      otherMissionIndices.push(i);
    }
  }

  if (otherMissionIndices.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sasuke Uchiwa (107): No other missions available to move characters to.',
          'game.log.effect.noTarget',
          { card: 'SASUKE UCHIWA', id: '107/130' },
        ),
      },
    };
  }

  // Auto-distribute: spread characters across other missions evenly
  let newState = { ...state };
  const missions = [...newState.activeMissions];
  const sourceMission = { ...missions[sourceMissionIndex] };
  let sourceChars = [...sourceMission[friendlySide]];
  let movedCount = 0;

  for (const charToMove of charsToMove) {
    // Pick the mission with the fewest friendly characters
    let bestMissionIdx = otherMissionIndices[0];
    let minChars = Infinity;
    for (const idx of otherMissionIndices) {
      const missionChars = missions[idx][friendlySide].length;
      if (missionChars < minChars) {
        minChars = missionChars;
        bestMissionIdx = idx;
      }
    }

    // Remove from source mission
    sourceChars = sourceChars.filter((c) => c.instanceId !== charToMove.instanceId);

    // Add to target mission
    const targetMission = { ...missions[bestMissionIdx] };
    const targetChars = [...targetMission[friendlySide]];
    targetChars.push({ ...charToMove, missionIndex: bestMissionIdx });
    targetMission[friendlySide] = targetChars;
    missions[bestMissionIdx] = targetMission;

    movedCount++;

    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_MOVE',
        `Sasuke Uchiwa (107): Moved ${charToMove.card.name_fr} from mission ${sourceMissionIndex} to mission ${bestMissionIdx}.`,
        'game.log.effect.move',
        { card: 'SASUKE UCHIWA', id: '107/130', target: charToMove.card.name_fr, from: sourceMissionIndex, to: bestMissionIdx },
      ),
    };
  }

  sourceMission[friendlySide] = sourceChars;
  missions[sourceMissionIndex] = sourceMission;

  newState = { ...newState, activeMissions: missions };

  // UPGRADE: POWERUP X where X = number of characters moved
  if (isUpgrade && movedCount > 0) {
    const upgradeMissions = [...newState.activeMissions];
    const upgradeMission = { ...upgradeMissions[sourceMissionIndex] };
    const upgradeFriendlyChars = [...upgradeMission[friendlySide]];
    const selfIndex = upgradeFriendlyChars.findIndex((c) => c.instanceId === sourceCard.instanceId);

    if (selfIndex !== -1) {
      upgradeFriendlyChars[selfIndex] = {
        ...upgradeFriendlyChars[selfIndex],
        powerTokens: upgradeFriendlyChars[selfIndex].powerTokens + movedCount,
      };
      upgradeMission[friendlySide] = upgradeFriendlyChars;
      upgradeMissions[sourceMissionIndex] = upgradeMission;

      newState = {
        ...newState,
        activeMissions: upgradeMissions,
        log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_POWERUP',
          `Sasuke Uchiwa (107) UPGRADE: POWERUP ${movedCount} (characters moved).`,
          'game.log.effect.powerupSelf',
          { card: 'SASUKE UCHIWA', id: '107/130', amount: movedCount },
        ),
      };
    }
  }

  return { state: newState };
}

function sasuke107UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerSasuke107Handlers(): void {
  registerEffect('107/130', 'MAIN', sasuke107MainHandler);
  registerEffect('107/130', 'UPGRADE', sasuke107UpgradeHandler);
}
