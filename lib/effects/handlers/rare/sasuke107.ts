import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { CharacterInPlay, GameState, PlayerID } from '../../../engine/types';

/**
 * Card 107/130 - SASUKE UCHIWA (R)
 * Chakra: 5, Power: 5
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Must move all other non-hidden friendly characters from this mission to other missions.
 *   This is a mandatory effect ("must"). All non-hidden friendly characters in this mission
 *   (except Sasuke himself) are moved to other missions. Player chooses destination for each.
 *
 * UPGRADE: POWERUP X where X = number of characters moved.
 *   When isUpgrade: count the moved characters and apply POWERUP on self.
 */

/** Get the side key for a player */
function side(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}

/**
 * Find valid destination missions for a character.
 * A mission is valid if:
 * - It's not the source mission
 * - No same-name visible character exists there, OR
 * - A same-name visible character exists with strictly lower cost (upgrade possible)
 */
function getValidMissions(
  state: GameState,
  charInstanceId: string,
  player: PlayerID,
  sourceMissionIndex: number,
): number[] {
  const friendlySide = side(player);

  // Find the character
  let charObj: CharacterInPlay | null = null;
  for (const m of state.activeMissions) {
    const c = m[friendlySide].find((ch) => ch.instanceId === charInstanceId);
    if (c) { charObj = c; break; }
  }
  if (!charObj) return [];

  const topCard = charObj.stack.length > 0 ? charObj.stack[charObj.stack.length - 1] : charObj.card;
  const charName = topCard.name_fr.toUpperCase();
  const charCost = topCard.chakra ?? 0;

  const valid: number[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const destChars = state.activeMissions[i][friendlySide];
    const sameNameChar = destChars.find((c) => {
      if (c.isHidden) return false;
      const ct = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return ct.name_fr.toUpperCase() === charName;
    });

    if (!sameNameChar) {
      valid.push(i);
    } else {
      const existingTop = sameNameChar.stack.length > 0
        ? sameNameChar.stack[sameNameChar.stack.length - 1]
        : sameNameChar.card;
      if (charCost > (existingTop.chakra ?? 0)) {
        valid.push(i); // Can upgrade at destination
      }
    }
  }
  return valid;
}

/**
 * Move a character to a destination mission, handling upgrade if same-name exists.
 * Returns the updated state.
 */
function moveCharTo(
  state: GameState,
  charInstanceId: string,
  destMissionIndex: number,
  player: PlayerID,
): GameState {
  const friendlySide = side(player);
  const missions = [...state.activeMissions];

  // Find and remove from source mission
  let movedChar: CharacterInPlay | null = null;
  for (let i = 0; i < missions.length; i++) {
    const chars = missions[i][friendlySide];
    const idx = chars.findIndex((c) => c.instanceId === charInstanceId);
    if (idx !== -1) {
      missions[i] = { ...missions[i] };
      const newChars = [...missions[i][friendlySide]];
      [movedChar] = newChars.splice(idx, 1);
      missions[i][friendlySide] = newChars;
      break;
    }
  }

  if (!movedChar) return state;

  // Check for upgrade at destination
  const destMission = { ...missions[destMissionIndex] };
  const destChars = [...destMission[friendlySide]];
  const movedTopCard = movedChar.stack.length > 0
    ? movedChar.stack[movedChar.stack.length - 1]
    : movedChar.card;
  const movedName = movedTopCard.name_fr.toUpperCase();

  const upgradeTargetIdx = destChars.findIndex((c) => {
    if (c.isHidden) return false;
    const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return topCard.name_fr.toUpperCase() === movedName
      && (movedTopCard.chakra ?? 0) > (topCard.chakra ?? 0);
  });

  if (upgradeTargetIdx !== -1) {
    // Merge into existing character (upgrade at destination)
    const existing = destChars[upgradeTargetIdx];
    const movedStack = movedChar.stack.length > 0 ? movedChar.stack : [movedChar.card];
    destChars[upgradeTargetIdx] = {
      ...existing,
      card: movedTopCard,
      stack: [...existing.stack, ...movedStack],
      powerTokens: existing.powerTokens + movedChar.powerTokens,
    };
  } else {
    // Place as new character
    destChars.push({ ...movedChar, missionIndex: destMissionIndex });
  }

  destMission[friendlySide] = destChars;
  missions[destMissionIndex] = destMission;

  return { ...state, activeMissions: missions };
}

/**
 * Apply POWERUP on Sasuke after all moves are done.
 */
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

/**
 * Process chars to move one at a time. Auto-moves chars with 0-1 valid destinations,
 * returns target selection for the first char that needs a player choice.
 */
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
  // All chars processed
  if (idx >= charIds.length) {
    let finalState = state;
    if (isUpgrade && movedCount > 0) {
      finalState = applyUpgradePowerup(finalState, sasukeInstanceId, movedCount, player, sourceMissionIndex);
    }
    return { state: finalState };
  }

  const charId = charIds[idx];

  // Find this char — it might have been removed by a previous move
  const friendlySide = side(player);
  let charExists = false;
  let charName = '';
  for (const m of state.activeMissions) {
    const c = m[friendlySide].find((ch) => ch.instanceId === charId);
    if (c) {
      charExists = true;
      charName = c.card.name_fr;
      break;
    }
  }

  if (!charExists) {
    // Char already gone (e.g., merged via upgrade) — skip
    return processNextMove(state, charIds, idx + 1, movedCount, isUpgrade, player, sasukeInstanceId, sourceMissionIndex);
  }

  const validMissions = getValidMissions(state, charId, player, sourceMissionIndex);

  if (validMissions.length === 0) {
    // Can't move anywhere — skip
    const logged = {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT_NO_TARGET',
        `Sasuke Uchiwa (107): Cannot move ${charName} — no valid destination mission.`,
        'game.log.effect.noTarget',
        { card: 'SASUKE UCHIWA', id: 'KS-107-R' },
      ),
    };
    return processNextMove(logged, charIds, idx + 1, movedCount, isUpgrade, player, sasukeInstanceId, sourceMissionIndex);
  }

  if (validMissions.length === 1) {
    // Auto-move
    let moved = moveCharTo(state, charId, validMissions[0], player);
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
    return processNextMove(moved, charIds, idx + 1, movedCount + 1, isUpgrade, player, sasukeInstanceId, sourceMissionIndex);
  }

  // Multiple valid missions — need player choice
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SASUKE107_CHOOSE_DESTINATION',
    validTargets: validMissions.map(String),
    description: JSON.stringify({
      text: `Sasuke Uchiwa (107): Choose a mission to move ${charName} to.`,
      charInstanceId: charId,
      remainingCharIds: charIds.slice(idx + 1),
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
          { card: 'SASUKE UCHIWA', id: 'KS-107-R' },
        ),
      },
    };
  }

  // Check we have other missions
  let hasOtherMissions = false;
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i !== sourceMissionIndex) { hasOtherMissions = true; break; }
  }

  if (!hasOtherMissions) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Sasuke Uchiwa (107): No other missions available to move characters to.',
          'game.log.effect.noTarget',
          { card: 'SASUKE UCHIWA', id: 'KS-107-R' },
        ),
      },
    };
  }

  // Process characters one by one
  const charIds = charsToMove.map((c) => c.instanceId);
  return processNextMove(
    state, charIds, 0, 0, isUpgrade, sourcePlayer,
    sourceCard.instanceId, sourceMissionIndex,
  );
}

function sasuke107UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerSasuke107Handlers(): void {
  registerEffect('KS-107-R', 'MAIN', sasuke107MainHandler);
  registerEffect('KS-107-R', 'UPGRADE', sasuke107UpgradeHandler);
}

/**
 * Exported for use by EffectEngine to continue processing after player selects a destination.
 */
export { moveCharTo, getValidMissions, applyUpgradePowerup };
