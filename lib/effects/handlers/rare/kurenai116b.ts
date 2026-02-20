import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 116b/130 - KURENAI YUHI (R)
 * Chakra: 3, Power: 2
 * Group: Leaf Village, Keywords: Team 8
 *
 * AMBUSH: Defeat an enemy character with Power 4 or less in this mission.
 *   Find non-hidden enemies in this mission with effective power <= 4. Target selection. Defeat.
 *
 * UPGRADE: Move this character to another mission.
 *   When isUpgrade: find valid missions (other than current). Target selection. Move self.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function kurenai116bAmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  // Find non-hidden enemies with effective power <= 4
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => !c.isHidden && getEffectivePower(c) <= 4)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kurenai Yuhi (116b) AMBUSH: No enemy with Power 4 or less in this mission.',
          'game.log.effect.noTarget',
          { card: 'KURENAI YUHI', id: '116b/130' },
        ),
      },
    };
  }

  // If exactly one target, auto-resolve
  if (validTargets.length === 1) {
    const targetChar = enemyChars.find((c: CharacterInPlay) => c.instanceId === validTargets[0]);
    const targetName = targetChar ? targetChar.card.name_fr : 'Unknown';
    let newState = defeatEnemyCharacter(state, sourceMissionIndex, validTargets[0], sourcePlayer);
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_DEFEAT',
        `Kurenai Yuhi (116b) AMBUSH: Defeated ${targetName} (Power ${getEffectivePower(targetChar!)}).`,
        'game.log.effect.defeat',
        { card: 'KURENAI YUHI', id: '116b/130', target: targetName },
      ),
    };
    return { state: newState };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KURENAI116B_DEFEAT_TARGET',
    validTargets,
    description: 'Kurenai Yuhi (116b) AMBUSH: Choose an enemy character with Power 4 or less to defeat.',
  };
}

function kurenai116bUpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find other missions to move to
  const validMissions: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== sourceMissionIndex) {
      validMissions.push(String(i));
    }
  }

  if (validMissions.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kurenai Yuhi (116b) UPGRADE: No other mission to move to.',
          'game.log.effect.noTarget',
          { card: 'KURENAI YUHI', id: '116b/130' },
        ),
      },
    };
  }

  // If only one other mission, auto-resolve
  if (validMissions.length === 1) {
    const targetMissionIdx = parseInt(validMissions[0]);
    return applyMoveSelf(state, sourceCard, sourceMissionIndex, targetMissionIdx, sourcePlayer, friendlySide);
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KURENAI116B_MOVE_SELF',
    validTargets: validMissions,
    description: 'Kurenai Yuhi (116b) UPGRADE: Choose a mission to move this character to.',
  };
}

function applyMoveSelf(
  state: EffectContext['state'],
  sourceCard: EffectContext['sourceCard'],
  fromMissionIdx: number,
  toMissionIdx: number,
  sourcePlayer: EffectContext['sourcePlayer'],
  friendlySide: 'player1Characters' | 'player2Characters',
): EffectResult {
  const missions = [...state.activeMissions];

  // Remove from source mission
  const fromMission = { ...missions[fromMissionIdx] };
  const fromChars = [...fromMission[friendlySide]];
  const charIdx = fromChars.findIndex((c) => c.instanceId === sourceCard.instanceId);
  if (charIdx === -1) return { state };

  const [movedChar] = fromChars.splice(charIdx, 1);
  fromMission[friendlySide] = fromChars;
  missions[fromMissionIdx] = fromMission;

  // Add to target mission
  const toMission = { ...missions[toMissionIdx] };
  const toChars = [...toMission[friendlySide]];
  toChars.push({ ...movedChar, missionIndex: toMissionIdx });
  toMission[friendlySide] = toChars;
  missions[toMissionIdx] = toMission;

  return {
    state: {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_MOVE',
        `Kurenai Yuhi (116b) UPGRADE: Moved self from mission ${fromMissionIdx} to mission ${toMissionIdx}.`,
        'game.log.effect.move',
        { card: 'KURENAI YUHI', id: '116b/130', target: 'self', from: fromMissionIdx, to: toMissionIdx },
      ),
    },
  };
}

export function registerKurenai116bHandlers(): void {
  registerEffect('116b/130', 'AMBUSH', kurenai116bAmbushHandler);
  registerEffect('116b/130', 'UPGRADE', kurenai116bUpgradeHandler);
}
