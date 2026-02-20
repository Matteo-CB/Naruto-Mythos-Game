import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 152/130 - ITACHI UCHIHA (M)
 * Chakra: 6, Power: 5
 * Group: Akatsuki, Keywords: Rogue Ninja
 *
 * UPGRADE: Move a friendly character in play to another mission.
 *   - When isUpgrade: find friendly characters (not self) across all missions.
 *   - Require target selection for which character to move.
 *   - The destination mission is handled by a second selection or auto-resolved
 *     to the mission with the fewest friendly characters (excluding current).
 *
 * MAIN [continuous]: Every enemy character in this mission has -1 Power.
 *   - Continuous no-op. The power modifier is handled by the engine during
 *     scoring (ContinuousEffects / MissionPhase power calculation).
 */

function itachi152MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  // Log the continuous effect
  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_CONTINUOUS',
      'Itachi Uchiha (152): Every enemy character in this mission has -1 Power (continuous).',
      'game.log.effect.continuous',
      { card: 'ITACHI UCHIHA', id: '152/130' },
    ),
  };

  // UPGRADE: Move a friendly character to another mission
  if (ctx.isUpgrade) {
    const friendlySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    // Find friendly characters in other missions (not self)
    const validTargets: string[] = [];
    for (let i = 0; i < state.activeMissions.length; i++) {
      for (const char of state.activeMissions[i][friendlySide]) {
        if (char.instanceId === ctx.sourceCard.instanceId) continue;
        validTargets.push(char.instanceId);
      }
    }

    if (validTargets.length === 0) {
      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_NO_TARGET',
          'Itachi Uchiha (152): No friendly character in play to move (upgrade).',
          'game.log.effect.noTarget',
          { card: 'ITACHI UCHIHA', id: '152/130' },
        ),
      };
      return { state };
    }

    if (validTargets.length > 1) {
      return {
        state,
        requiresTargetSelection: true,
        targetSelectionType: 'ITACHI152_CHOOSE_MOVE',
        validTargets,
        description: 'Itachi Uchiha (152): Choose a friendly character to move to another mission.',
      };
    }

    // Auto-resolve: single target, move to a different mission
    const targetId = validTargets[0];
    state = autoMoveCharacter(state, targetId, friendlySide, ctx);
  }

  return { state };
}

/**
 * Auto-resolve moving a character to another mission.
 * Picks the mission with fewest friendly characters (excluding the character's current mission).
 */
function autoMoveCharacter(
  state: import('../../../engine/types').GameState,
  targetId: string,
  friendlySide: 'player1Characters' | 'player2Characters',
  ctx: EffectContext,
): import('../../../engine/types').GameState {
  // Find the character and its current mission
  let charToMove: CharacterInPlay | null = null;
  let fromMissionIndex = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    const idx = state.activeMissions[i][friendlySide].findIndex((c) => c.instanceId === targetId);
    if (idx !== -1) {
      charToMove = state.activeMissions[i][friendlySide][idx];
      fromMissionIndex = i;
      break;
    }
  }

  if (!charToMove || fromMissionIndex === -1) return state;

  // Find best destination mission (fewest friendly chars, different from source)
  let bestMission = -1;
  let fewest = Infinity;
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === fromMissionIndex) continue;
    const count = state.activeMissions[i][friendlySide].length;
    if (count < fewest) {
      fewest = count;
      bestMission = i;
    }
  }

  if (bestMission === -1) {
    // Only one mission exists, cannot move
    return {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Itachi Uchiha (152): No other mission to move to (upgrade).',
        'game.log.effect.noTarget',
        { card: 'ITACHI UCHIHA', id: '152/130' },
      ),
    };
  }

  // Remove from source mission
  const missions = [...state.activeMissions];
  const sourceMission = { ...missions[fromMissionIndex] };
  const sourceChars = [...sourceMission[friendlySide]];
  const charIdx = sourceChars.findIndex((c) => c.instanceId === targetId);
  if (charIdx === -1) return state;

  const movedChar = { ...sourceChars[charIdx], missionIndex: bestMission };
  sourceChars.splice(charIdx, 1);
  sourceMission[friendlySide] = sourceChars;
  missions[fromMissionIndex] = sourceMission;

  // Add to destination mission
  const destMission = { ...missions[bestMission] };
  destMission[friendlySide] = [...destMission[friendlySide], movedChar];
  missions[bestMission] = destMission;

  return {
    ...state,
    activeMissions: missions,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_MOVE',
      `Itachi Uchiha (152): Moved ${charToMove.card.name_fr} from mission ${fromMissionIndex} to mission ${bestMission} (upgrade).`,
      'game.log.effect.moveCharacter',
      { card: 'ITACHI UCHIHA', id: '152/130', target: charToMove.card.name_fr, mission: `mission ${bestMission}` },
    ),
  };
}

function itachi152UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerItachi152Handlers(): void {
  registerEffect('152/130', 'MAIN', itachi152MainHandler);
  registerEffect('152/130', 'UPGRADE', itachi152UpgradeHandler);
}
