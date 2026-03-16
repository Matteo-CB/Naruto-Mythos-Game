import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

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
 * Prefers conflict-free missions. Only allows missions with same-name conflicts
 * if ALL other missions have conflicts (since the move is MANDATORY).
 */
function getValidMissions(
  state: GameState,
  charInstanceId: string,
  player: PlayerID,
  sourceMissionIndex: number,
): number[] {
  const friendlySide = side(player);

  // Find the character's name
  let charName = '';
  for (const m of state.activeMissions) {
    const c = m[friendlySide].find((ch) => ch.instanceId === charInstanceId);
    if (c) {
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
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
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === charName;
    });

    if (hasConflict) {
      withConflict.push(i);
    } else {
      conflictFree.push(i);
    }
  }

  // Only return conflict-free missions — "if able" means skip chars that can't legally move
  return conflictFree;
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

  // Check Kurenai 035 movement block before moving
  // Find source mission of the character
  for (let i = 0; i < missions.length; i++) {
    const chars = missions[i][friendlySide];
    if (chars.some(c => c.instanceId === charInstanceId)) {
      if (isMovementBlockedByKurenai(state, i, player)) {
        // Movement blocked - character stays in place
        return state;
      }
      break;
    }
  }

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

  // Check for name conflict at destination - forced moves ALWAYS discard the moved character
  const destMission = { ...missions[destMissionIndex] };
  const destChars = [...destMission[friendlySide]];
  const movedTopCard = movedChar.stack.length > 0
    ? movedChar.stack[movedChar.stack.length - 1]
    : movedChar.card;
  const movedName = movedTopCard.name_fr.toUpperCase();

  const conflictIdx = destChars.findIndex((c) => {
    if (c.isHidden) return false;
    const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return topCard.name_fr.toUpperCase() === movedName;
  });

  if (conflictIdx !== -1) {
    // Name conflict - discard the moved character (no auto-upgrade on forced moves)
    const owner = movedChar.originalOwner;
    const ownerState = { ...state[owner] };
    const cardsToDiscard = movedChar.stack.length > 0 ? [...movedChar.stack] : [movedChar.card];
    ownerState.discardPile = [...ownerState.discardPile, ...cardsToDiscard];
    ownerState.charactersInPlay = Math.max(0, ownerState.charactersInPlay - 1);
    destMission[friendlySide] = destChars;
    missions[destMissionIndex] = destMission;
    return { ...state, activeMissions: missions, [owner]: ownerState };
  }

  // No conflict - place as new character
  destChars.push({ ...movedChar, missionIndex: destMissionIndex });

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
/**
 * Filter charIds to only those that still exist on the board and can move.
 * Returns { moveable: instanceIds that have valid destinations, unmoveable: those with no valid dest }
 */
function filterMoveableChars(
  state: GameState,
  charIds: string[],
  player: PlayerID,
  sourceMissionIndex: number,
): { moveable: string[]; state: GameState } {
  const friendlySide = side(player);
  const moveable: string[] = [];
  let s = state;

  for (const charId of charIds) {
    // Check if char still exists
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
      // "if able" — character can't legally move, skip it
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
  // Filter remaining chars to only those that exist and can move
  const remaining = charIds.slice(idx);
  const { moveable, state: filteredState } = filterMoveableChars(state, remaining, player, sourceMissionIndex);

  // All chars processed or none can move
  if (moveable.length === 0) {
    // UPGRADE: POWERUP X is optional — show CONFIRM popup instead of auto-applying
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

  // 2+ characters remaining: let the player choose which to move next
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

  // Exactly 1 character remaining: proceed directly
  const charId = moveable[0];
  const friendlySide = side(player);
  let charName = '';
  for (const m of filteredState.activeMissions) {
    const c = m[friendlySide].find((ch) => ch.instanceId === charId);
    if (c) { charName = c.card.name_fr; break; }
  }

  const validMissions = getValidMissions(filteredState, charId, player, sourceMissionIndex);

  if (validMissions.length === 1) {
    // Auto-move
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
    // Note: move triggers will be called in EffectEngine after resolving this auto-move.
    // We store the auto-move info so EffectEngine can call triggers.
    // For auto-moves from the handler, we return a special result that EffectEngine processes.
    return {
      state: moved,
      requiresTargetSelection: true,
      targetSelectionType: 'SASUKE107_AUTO_MOVED',
      validTargets: ['confirm'],
      description: JSON.stringify({
        movedCharInstanceId: charId,
        destMissionIndex: validMissions[0],
        movedCount: movedCount + 1,
        isUpgrade,
        sasukeInstanceId,
        sourceMissionIndex,
        remainingCharIds: [],
      }),
      descriptionKey: 'game.effect.desc.sasuke107AutoMoved',
      descriptionParams: { target: charName, mission: String(validMissions[0] + 1) },
      isMandatory: true,
      isOptional: false,
    };
  }

  // Multiple valid missions - need player choice for destination
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

  // Process characters one by one (if no other missions exist, processNextMove will discard them)
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
