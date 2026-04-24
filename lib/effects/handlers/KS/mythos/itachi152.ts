import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import type { CharacterInPlay } from '@/lib/engine/types';
import { logAction } from '@/lib/engine/utils/gameLog';



function itachi152MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  
  state = {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_CONTINUOUS',
      'Itachi Uchiha (128 MV): Every enemy character in this mission has -1 Power (continuous).',
      'game.log.effect.continuous',
      { card: 'ITACHI UCHIHA', id: 'KS-128-MV' },
    ),
  };

  
  if (ctx.isUpgrade) {
    const friendlySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

    
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
          'Itachi Uchiha (128 MV): No friendly character in play to move (upgrade).',
          'game.log.effect.noTarget',
          { card: 'ITACHI UCHIHA', id: 'KS-128-MV' },
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
        description: 'Itachi Uchiha (128 MV): Choose a friendly character to move to another mission.',
        descriptionKey: 'game.effect.desc.itachi152MoveFriendly',
      };
    }

    
    const targetId = validTargets[0];
    state = autoMoveCharacter(state, targetId, friendlySide, ctx);
  }

  return { state };
}


function autoMoveCharacter(
  state: import('@/lib/engine/types').GameState,
  targetId: string,
  friendlySide: 'player1Characters' | 'player2Characters',
  ctx: EffectContext,
): import('@/lib/engine/types').GameState {
  
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
    
    return {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Itachi Uchiha (128 MV): No other mission to move to (upgrade).',
        'game.log.effect.noTarget',
        { card: 'ITACHI UCHIHA', id: 'KS-128-MV' },
      ),
    };
  }

  
  const missions = [...state.activeMissions];
  const sourceMission = { ...missions[fromMissionIndex] };
  const sourceChars = [...sourceMission[friendlySide]];
  const charIdx = sourceChars.findIndex((c) => c.instanceId === targetId);
  if (charIdx === -1) return state;

  const movedChar = { ...sourceChars[charIdx], missionIndex: bestMission };
  sourceChars.splice(charIdx, 1);
  sourceMission[friendlySide] = sourceChars;
  missions[fromMissionIndex] = sourceMission;

  
  const destMission = { ...missions[bestMission] };
  destMission[friendlySide] = [...destMission[friendlySide], movedChar];
  missions[bestMission] = destMission;

  return {
    ...state,
    activeMissions: missions,
    log: logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_MOVE',
      `Itachi Uchiha (128 MV): Moved ${charToMove.card.name_fr} from mission ${fromMissionIndex} to mission ${bestMission} (upgrade).`,
      'game.log.effect.moveCharacter',
      { card: 'ITACHI UCHIHA', id: 'KS-128-MV', target: charToMove.card.name_fr, mission: `mission ${bestMission}` },
    ),
  };
}

function itachi152UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerItachi152Handlers(): void {
  registerEffect('KS-128-MV', 'MAIN', itachi152MainHandler);
  registerEffect('KS-128-MV', 'UPGRADE', itachi152UpgradeHandler);
}
