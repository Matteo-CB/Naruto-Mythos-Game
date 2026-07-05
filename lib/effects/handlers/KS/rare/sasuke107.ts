import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';




function side(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}


function getValidMissions(
  state: GameState,
  charInstanceId: string,
  player: PlayerID,
  sourceMissionIndex: number,
): number[] {
  const friendlySide = side(player);

  
  let charName = '';
  for (const m of state.activeMissions) {
    const c = m[friendlySide].find((ch) => ch.instanceId === charInstanceId);
    if (c) {
      const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      charName = topCard.name_fr.toUpperCase();
      break;
    }
  }

  const conflictFree: number[] = [];
  const withConflict: number[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;

    const hasConflict = charName && state.activeMissions[i][friendlySide].some((c) => {
      if (c.isHidden) return false;
      const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === charName;
    });

    if (hasConflict) {
      withConflict.push(i);
    } else {
      conflictFree.push(i);
    }
  }

  
  return conflictFree;
}


function moveCharTo(
  state: GameState,
  charInstanceId: string,
  destMissionIndex: number,
  player: PlayerID,
): GameState {
  const friendlySide = side(player);


  let sourceMissionIndex = -1;
  let sourceChar: CharacterInPlay | null = null;
  for (let i = 0; i < state.activeMissions.length; i++) {
    const found = state.activeMissions[i][friendlySide].find((c) => c.instanceId === charInstanceId);
    if (found) {
      sourceMissionIndex = i;
      sourceChar = found;
      break;
    }
  }
  if (!sourceChar || sourceMissionIndex === -1) return state;

  if (isMovementBlockedByKurenai(state, sourceMissionIndex, player)) return state;

  const movedTopCard = sourceChar.stack?.length > 0
    ? sourceChar.stack[sourceChar.stack.length - 1]
    : sourceChar.card;
  const movedName = movedTopCard.name_fr.toUpperCase();
  const destHasConflict = state.activeMissions[destMissionIndex][friendlySide].some((c) => {
    if (c.isHidden) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return topCard.name_fr.toUpperCase() === movedName;
  });
  if (destHasConflict) return state;

  const missions = [...state.activeMissions];
  missions[sourceMissionIndex] = {
    ...missions[sourceMissionIndex],
    [friendlySide]: missions[sourceMissionIndex][friendlySide].filter((c) => c.instanceId !== charInstanceId),
  };
  const movedChar = { ...sourceChar, missionIndex: destMissionIndex };
  missions[destMissionIndex] = {
    ...missions[destMissionIndex],
    [friendlySide]: [...missions[destMissionIndex][friendlySide], movedChar],
  };

  return { ...state, activeMissions: missions };
}


function applyUpgradePowerup(
  state: GameState,
  sasukeInstanceId: string,
  movedCount: number,
  player: PlayerID,
  sourceMissionIndex: number,
): GameState {
  const friendlySide = side(player);
  const missions = [...state.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const chars = [...mission[friendlySide]];
  const selfIdx = chars.findIndex((c) => c.instanceId === sasukeInstanceId);

  if (selfIdx !== -1) {
    chars[selfIdx] = {
      ...chars[selfIdx],
      powerTokens: chars[selfIdx].powerTokens + movedCount,
    };
    mission[friendlySide] = chars;
    missions[sourceMissionIndex] = mission;

    return {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT_POWERUP',
        `Sasuke Uchiwa (107) UPGRADE: POWERUP ${movedCount} (characters moved).`,
        'game.log.effect.powerupSelf',
        { card: 'SASUKE UCHIWA', id: 'KS-107-R', amount: movedCount },
      ),
    };
  }
  return state;
}



function filterMoveableChars(
  state: GameState,
  charIds: string[],
  player: PlayerID,
  sourceMissionIndex: number,
): { moveable: string[]; state: GameState } {
  const friendlySide = side(player);
  const moveable: string[] = [];
  let s = state;

  if (isMovementBlockedByKurenai(s, sourceMissionIndex, player)) {
    s = {
      ...s,
      log: logAction(
        s.log, s.turn, s.phase, player,
        'EFFECT_BLOCKED',
        'Sasuke Uchiwa (107): no character can leave this mission (movement blocked), no POWERUP.',
        'game.log.effect.sasuke107KurenaiBlock',
        { card: 'SASUKE UCHIWA', id: 'KS-107-R' },
      ),
    };
    return { moveable: [], state: s };
  }

  for (const charId of charIds) {
    
    let charExists = false;
    let charName = '';
    for (const m of s.activeMissions) {
      const c = m[friendlySide].find((ch) => ch.instanceId === charId);
      if (c) {
        charExists = true;
        charName = c.card.name_fr;
        break;
      }
    }
    if (!charExists) continue;

    const validMissions = getValidMissions(s, charId, player, sourceMissionIndex);
    if (validMissions.length === 0) {
      
      s = {
        ...s,
        log: logAction(
          s.log, s.turn, s.phase, player,
          'EFFECT_SKIP',
          `Sasuke Uchiwa (107): ${charName} cannot move (name conflict at all destinations), stays.`,
          'game.log.effect.sasuke107Skip',
          { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: charName },
        ),
      };
      continue;
    }
    moveable.push(charId);
  }

  return { moveable, state: s };
}

function processNextMove(
  state: GameState,
  charIds: string[],
  idx: number,
  movedCount: number,
  isUpgrade: boolean,
  player: PlayerID,
  sasukeInstanceId: string,
  sourceMissionIndex: number,
): EffectResult {
  
  const remaining = charIds.slice(idx);
  const { moveable, state: filteredState } = filterMoveableChars(state, remaining, player, sourceMissionIndex);

  
  if (moveable.length === 0) {
    
    if (isUpgrade && movedCount > 0) {
      return {
        state: filteredState,
        requiresTargetSelection: true,
        targetSelectionType: 'SASUKE107_CONFIRM_UPGRADE',
        validTargets: [sasukeInstanceId],
        isOptional: true,
        description: JSON.stringify({ movedCount, sasukeInstanceId, sourceMissionIndex }),
        descriptionKey: 'game.effect.desc.sasuke107ConfirmUpgrade',
        descriptionParams: { count: String(movedCount) },
      };
    }
    return { state: filteredState };
  }

  
  if (moveable.length >= 2) {
    return {
      state: filteredState,
      requiresTargetSelection: true,
      targetSelectionType: 'SASUKE107_CHOOSE_CHAR_TO_MOVE',
      validTargets: moveable,
      description: JSON.stringify({
        remainingCharIds: moveable,
        movedCount,
        isUpgrade,
        sasukeInstanceId,
        sourceMissionIndex,
      }),
      descriptionKey: 'game.effect.desc.sasuke107ChooseCharToMove',
      isMandatory: true,
    };
  }

  
  const charId = moveable[0];
  const friendlySide = side(player);
  let charName = '';
  for (const m of filteredState.activeMissions) {
    const c = m[friendlySide].find((ch) => ch.instanceId === charId);
    if (c) { charName = c.card.name_fr; break; }
  }

  const validMissions = getValidMissions(filteredState, charId, player, sourceMissionIndex);

  if (validMissions.length === 1) {
    
    let moved = moveCharTo(filteredState, charId, validMissions[0], player);
    moved = {
      ...moved,
      log: logAction(
        moved.log, moved.turn, moved.phase, player,
        'EFFECT_MOVE',
        `Sasuke Uchiwa (107): Moved ${charName} to mission ${validMissions[0] + 1}.`,
        'game.log.effect.move',
        { card: 'SASUKE UCHIWA', id: 'KS-107-R', target: charName, from: sourceMissionIndex, to: validMissions[0] },
      ),
    };
    
    if (isUpgrade && movedCount + 1 > 0) {
      return {
        state: moved,
        requiresTargetSelection: true,
        targetSelectionType: 'SASUKE107_CONFIRM_UPGRADE',
        validTargets: [sasukeInstanceId],
        isOptional: true,
        description: JSON.stringify({ movedCount: movedCount + 1, sasukeInstanceId, sourceMissionIndex }),
        descriptionKey: 'game.effect.desc.sasuke107ConfirmUpgrade',
        descriptionParams: { count: String(movedCount + 1) },
      };
    }
    return { state: moved };
  }

  
  return {
    state: filteredState,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE107_CHOOSE_DESTINATION',
    validTargets: validMissions.map(String),
    description: JSON.stringify({
      text: `Sasuke Uchiwa (107): Choose a mission to move ${charName} to.`,
      charInstanceId: charId,
      remainingCharIds: [],
      movedCount,
      isUpgrade,
      sasukeInstanceId,
      sourceMissionIndex,
    }),
    descriptionKey: 'game.effect.desc.sasuke107ChooseDestination',
    descriptionParams: { target: charName },
    isMandatory: true,
  };
}

function sasuke107MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const friendlySide = side(sourcePlayer);

  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars = mission[friendlySide];

  
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
          { card: 'SASUKE UCHIWA', id: 'KS-107-R' },
        ),
      },
    };
  }

  
  const charIds = charsToMove.map((c) => c.instanceId);
  return processNextMove(
    state, charIds, 0, 0, isUpgrade, sourcePlayer,
    sourceCard.instanceId, sourceMissionIndex,
  );
}

function sasuke107UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerSasuke107Handlers(): void {
  registerEffect('KS-107-R', 'MAIN', sasuke107MainHandler);
  registerEffect('KS-107-R', 'UPGRADE', sasuke107UpgradeHandler);
  registerEffect('KS-107_2-MV', 'MAIN', sasuke107MainHandler);
  registerEffect('KS-107_2-MV', 'UPGRADE', sasuke107UpgradeHandler);
}


export { moveCharTo, getValidMissions, applyUpgradePowerup };
