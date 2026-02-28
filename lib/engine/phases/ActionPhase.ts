import type { GameState, GameAction, PlayerID, CharacterInPlay, CharacterCard } from '../types';
import { HIDDEN_PLAY_COST } from '../types';
import { deepClone } from '../utils/deepClone';
import { generateInstanceId } from '../utils/id';
import { logAction } from '../utils/gameLog';
import { validatePlayCharacter, validatePlayHidden, validateRevealCharacter, validateUpgradeCharacter, checkFlexibleUpgrade } from '../rules/PlayValidation';
import { calculateEffectiveCost } from '../rules/ChakraValidation';
import { EffectEngine } from '../../effects/EffectEngine';

/**
 * Execute a player action during the Action Phase.
 */
export function executeAction(state: GameState, player: PlayerID, action: GameAction): GameState {
  // Verify it's the action phase
  if (state.phase !== 'action') return state;

  // Verify the player can act
  const playerState = state[player];
  if (playerState.hasPassed) return state;

  // Check if it's this player's turn to act
  // After one player passes, the other can take multiple actions
  const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const otherPassed = state[otherPlayer].hasPassed;

  if (!otherPassed && state.activePlayer !== player) return state;

  let newState = deepClone(state);

  // Track the pre-action state to detect if the action actually succeeded.
  // Handlers return the SAME object reference on validation failure.
  const beforeAction = newState;

  switch (action.type) {
    case 'PLAY_CHARACTER':
      newState = handlePlayCharacter(newState, player, action.cardIndex, action.missionIndex);
      if (newState === beforeAction) return state; // Failed — don't skip turn
      break;
    case 'PLAY_HIDDEN':
      newState = handlePlayHidden(newState, player, action.cardIndex, action.missionIndex);
      if (newState === beforeAction) return state;
      break;
    case 'REVEAL_CHARACTER':
      newState = handleRevealCharacter(newState, player, action.missionIndex, action.characterInstanceId);
      if (newState === beforeAction) return state;
      break;
    case 'UPGRADE_CHARACTER':
      newState = handleUpgradeCharacter(newState, player, action.cardIndex, action.missionIndex, action.targetInstanceId);
      if (newState === beforeAction) return state;
      break;
    case 'PASS':
      newState = handlePass(newState, player);
      break;
    case 'SELECT_TARGET':
    case 'DECLINE_OPTIONAL_EFFECT':
      // Handle pending effects during action phase
      break;
    default:
      return state;
  }

  // After the action, check phase transitions
  if (newState.player1.hasPassed && newState.player2.hasPassed) {
    // Both players passed - signal that transition to mission phase is needed
    // The actual transition is handled by GameEngine.applyAction to avoid circular dependency
    newState.phase = 'mission' as GameState['phase'];
    return newState;
  }

  // If both haven't passed, alternate active player (unless one has passed)
  // Don't switch if there are pending effects/actions — the current player must resolve them first
  if (!newState.player1.hasPassed && !newState.player2.hasPassed) {
    if (action.type !== 'PASS' && newState.pendingEffects.length === 0 && newState.pendingActions.length === 0) {
      newState.activePlayer = otherPlayer;
    }
  }

  return newState;
}

/**
 * Play a character card face-visible on a mission.
 */
function handlePlayCharacter(
  state: GameState,
  player: PlayerID,
  cardIndex: number,
  missionIndex: number,
): GameState {
  const playerState = state[player];
  if (cardIndex < 0 || cardIndex >= playerState.hand.length) return state;
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) return state;

  const card = playerState.hand[cardIndex];
  const effectiveCost = calculateEffectiveCost(state, player, card, missionIndex, false);

  const validation = validatePlayCharacter(state, player, card, missionIndex, effectiveCost);
  if (!validation.valid) return state;

  // Pay chakra
  const ps = { ...playerState };
  ps.chakra -= effectiveCost;

  // Remove card from hand
  const hand = [...ps.hand];
  hand.splice(cardIndex, 1);
  ps.hand = hand;

  // Create character in play
  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card,
    isHidden: false,
    wasRevealedAtLeastOnce: true, // played face-visible
    powerTokens: 0,
    stack: [card],
    controlledBy: player,
    originalOwner: player,
    missionIndex,
  };

  // Add to mission
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  if (player === 'player1') {
    mission.player1Characters = [...mission.player1Characters, charInPlay];
  } else {
    mission.player2Characters = [...mission.player2Characters, charInPlay];
  }
  missions[missionIndex] = mission;

  // Update character count
  ps.charactersInPlay = countPlayerCharsInMissions(missions, player);

  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'PLAY_CHARACTER',
    `${player} plays ${card.name_fr} (${card.title_fr}) on mission ${missionIndex + 1} for ${effectiveCost} chakra.`,
    'game.log.playCharacter',
    { card: card.name_fr, title: card.title_fr, mission: missionIndex + 1, cost: effectiveCost },
  );

  let newState: GameState = {
    ...state,
    [player]: ps,
    activeMissions: missions,
    log,
  };

  // Trigger MAIN effects via EffectEngine
  // Re-fetch the character from the updated state (it may have moved)
  const updatedMission = newState.activeMissions[missionIndex];
  const updatedChars = player === 'player1' ? updatedMission.player1Characters : updatedMission.player2Characters;
  const playedChar = updatedChars[updatedChars.length - 1]; // Just added as last
  if (playedChar) {
    newState = EffectEngine.resolvePlayEffects(newState, player, playedChar, missionIndex, false);
  }

  // Trigger on-play continuous reactions from opponent's characters in this mission
  newState = triggerOnPlayReactions(newState, player, missionIndex);

  return newState;
}

/**
 * Play a character card face-down (hidden) on a mission.
 */
function handlePlayHidden(
  state: GameState,
  player: PlayerID,
  cardIndex: number,
  missionIndex: number,
): GameState {
  const playerState = state[player];
  if (cardIndex < 0 || cardIndex >= playerState.hand.length) return state;
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) return state;

  const card = playerState.hand[cardIndex];

  const validation = validatePlayHidden(state, player, card, missionIndex);
  if (!validation.valid) return state;

  // Pay 1 chakra (fixed cost for hidden play)
  const ps = { ...playerState };
  ps.chakra -= HIDDEN_PLAY_COST;

  // Remove from hand
  const hand = [...ps.hand];
  hand.splice(cardIndex, 1);
  ps.hand = hand;

  // Create hidden character in play
  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card,
    isHidden: true,
    wasRevealedAtLeastOnce: false, // never revealed yet
    powerTokens: 0,
    stack: [card],
    controlledBy: player,
    originalOwner: player,
    missionIndex,
  };

  // Add to mission
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  if (player === 'player1') {
    mission.player1Characters = [...mission.player1Characters, charInPlay];
  } else {
    mission.player2Characters = [...mission.player2Characters, charInPlay];
  }
  missions[missionIndex] = mission;

  ps.charactersInPlay = countPlayerCharsInMissions(missions, player);

  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'PLAY_HIDDEN',
    `${player} plays a hidden character on mission ${missionIndex + 1}.`,
    'game.log.playHidden',
    { mission: missionIndex + 1 },
  );

  return {
    ...state,
    [player]: ps,
    activeMissions: missions,
    log,
  };
}

/**
 * Reveal a hidden character, paying its printed chakra cost.
 * Triggers MAIN and AMBUSH effects.
 */
function handleRevealCharacter(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  characterInstanceId: string,
): GameState {
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) return state;

  const validation = validateRevealCharacter(state, player, missionIndex, characterInstanceId);
  if (!validation.valid) return state;

  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const chars = player === 'player1' ? [...mission.player1Characters] : [...mission.player2Characters];

  const charIdx = chars.findIndex((c) => c.instanceId === characterInstanceId);
  if (charIdx === -1) return state;

  const char = { ...chars[charIdx] };
  if (!char.isHidden) return state;
  if (char.controlledBy !== player) return state;

  const charTopCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

  // Check if this reveal is an upgrade over an existing character (same-name or flexible)
  const upgradeTarget = chars.find((c) => {
    if (c.instanceId === characterInstanceId) return false;
    if (c.isHidden) return false;
    const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    if (charTopCard.chakra <= cTop.chakra) return false;
    // Same-name upgrade
    if (cTop.name_fr.toUpperCase() === charTopCard.name_fr.toUpperCase()) return true;
    // Flexible upgrade (Orochimaru 138, Akamaru 029, etc.)
    return checkFlexibleUpgrade(charTopCard, cTop);
  });

  // Reveal cost is always the full printed cost of the hidden card (with modifiers),
  // whether or not it resolves as an upgrade. Hidden-to-upgrade is NOT discounted.
  const effectiveCost = calculateEffectiveCost(state, player, charTopCard, missionIndex, true);

  // Pay cost
  const ps = { ...state[player] };
  if (ps.chakra < effectiveCost) return state;
  ps.chakra -= effectiveCost;

  if (upgradeTarget) {
    // Reveal-for-upgrade: merge stacks — put the revealed card's stack on top of the existing one
    const upgradeTargetIdx = chars.findIndex((c) => c.instanceId === upgradeTarget.instanceId);
    const upgraded = { ...upgradeTarget };
    upgraded.stack = [...upgraded.stack, ...char.stack];
    upgraded.card = charTopCard;
    upgraded.powerTokens += char.powerTokens; // Transfer power tokens
    upgraded.isHidden = false;
    upgraded.wasRevealedAtLeastOnce = true;

    // Remove the revealed hidden character and update the upgrade target
    const updatedChars = chars.filter((c) => c.instanceId !== characterInstanceId);
    const mergedIdx = updatedChars.findIndex((c) => c.instanceId === upgradeTarget.instanceId);
    if (mergedIdx !== -1) updatedChars[mergedIdx] = upgraded;

    if (player === 'player1') {
      mission.player1Characters = updatedChars;
    } else {
      mission.player2Characters = updatedChars;
    }
    missions[missionIndex] = mission;
    ps.charactersInPlay = countPlayerCharsInMissions(missions, player);

    const log = logAction(
      state.log, state.turn, 'action', player,
      'REVEAL_UPGRADE',
      `${player} reveals ${charTopCard.name_fr} (${charTopCard.title_fr}) to upgrade existing ${upgradeTarget.card.name_fr} on mission ${missionIndex + 1} for ${effectiveCost} chakra.`,
      'game.log.revealUpgrade',
      { card: charTopCard.name_fr, title: charTopCard.title_fr, mission: missionIndex + 1, cost: effectiveCost },
    );

    let newState: GameState = {
      ...state,
      [player]: ps,
      activeMissions: missions,
      log,
    };

    // Trigger MAIN + UPGRADE + AMBUSH effects via EffectEngine
    const updatedMission = newState.activeMissions[missionIndex];
    const updatedMissionChars = player === 'player1' ? updatedMission.player1Characters : updatedMission.player2Characters;
    const upgradedChar = updatedMissionChars.find((c) => c.instanceId === upgradeTarget.instanceId);
    if (upgradedChar) {
      // Resolve all three effect types: MAIN + UPGRADE + AMBUSH
      newState = EffectEngine.resolveRevealUpgradeEffects(newState, player, upgradedChar, missionIndex);
    }

    // Trigger on-play reactions (reveal counts as playing a character)
    newState = triggerOnPlayReactions(newState, player, missionIndex);
    return newState;
  }

  // Normal reveal (no upgrade)
  // Reveal the character
  char.isHidden = false;
  char.wasRevealedAtLeastOnce = true;
  chars[charIdx] = char;

  if (player === 'player1') {
    mission.player1Characters = chars;
  } else {
    mission.player2Characters = chars;
  }
  missions[missionIndex] = mission;

  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'REVEAL_CHARACTER',
    `${player} reveals ${char.card.name_fr} (${char.card.title_fr}) on mission ${missionIndex + 1} for ${effectiveCost} chakra.`,
    'game.log.revealCharacter',
    { card: char.card.name_fr, title: char.card.title_fr, mission: missionIndex + 1, cost: effectiveCost },
  );

  let newState: GameState = {
    ...state,
    [player]: ps,
    activeMissions: missions,
    log,
  };

  // Trigger MAIN + AMBUSH effects via EffectEngine
  const revealedMission = newState.activeMissions[missionIndex];
  const revealedChars = player === 'player1' ? revealedMission.player1Characters : revealedMission.player2Characters;
  const revealedChar = revealedChars.find((c) => c.instanceId === characterInstanceId);
  if (revealedChar) {
    newState = EffectEngine.resolveRevealEffects(newState, player, revealedChar, missionIndex);
  }

  // Trigger on-play reactions (reveal counts as playing a character)
  newState = triggerOnPlayReactions(newState, player, missionIndex);

  return newState;
}

/**
 * Upgrade a character by playing a same-name card with higher cost over it.
 * Pay only the difference in cost.
 */
function handleUpgradeCharacter(
  state: GameState,
  player: PlayerID,
  cardIndex: number,
  missionIndex: number,
  targetInstanceId: string,
): GameState {
  const playerState = state[player];
  if (cardIndex < 0 || cardIndex >= playerState.hand.length) return state;
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) return state;

  const newCard = playerState.hand[cardIndex];

  const validation = validateUpgradeCharacter(state, player, newCard, missionIndex, targetInstanceId);
  if (!validation.valid) return state;

  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const chars = player === 'player1' ? [...mission.player1Characters] : [...mission.player2Characters];

  const charIdx = chars.findIndex((c) => c.instanceId === targetInstanceId);
  if (charIdx === -1) return state;

  const existingChar = { ...chars[charIdx] };
  const existingTopCard = existingChar.stack.length > 0
    ? existingChar.stack[existingChar.stack.length - 1]
    : existingChar.card;

  // When upgrading over a hidden character, pay the full cost of the new card
  // (this combines the hidden reveal cost + upgrade diff in one action).
  // When upgrading over a visible character, pay only the chakra diff.
  const isHiddenUpgrade = existingChar.isHidden;
  const costDiff = isHiddenUpgrade ? newCard.chakra : newCard.chakra - existingTopCard.chakra;
  if (costDiff <= 0) return state;

  // Pay cost
  const ps = { ...playerState };
  if (ps.chakra < costDiff) return state;
  ps.chakra -= costDiff;

  // If target was hidden, reveal it now (combined reveal + upgrade)
  if (isHiddenUpgrade) {
    existingChar.isHidden = false;
    existingChar.wasRevealedAtLeastOnce = true;
  }

  // Remove card from hand
  const hand = [...ps.hand];
  hand.splice(cardIndex, 1);
  ps.hand = hand;

  // Upgrade: place new card on top, old text is ignored
  existingChar.card = newCard;
  existingChar.stack = [...existingChar.stack, newCard];
  // Power tokens transfer
  // Character retains hidden/visible status

  chars[charIdx] = existingChar;

  if (player === 'player1') {
    mission.player1Characters = chars;
  } else {
    mission.player2Characters = chars;
  }
  missions[missionIndex] = mission;

  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'UPGRADE_CHARACTER',
    `${player} upgrades ${existingTopCard.name_fr} to ${newCard.name_fr} (${newCard.title_fr}) on mission ${missionIndex + 1} for ${costDiff} chakra.`,
    'game.log.upgradeCharacter',
    { oldCard: existingTopCard.name_fr, card: newCard.name_fr, title: newCard.title_fr, mission: missionIndex + 1, cost: costDiff },
  );

  let newState: GameState = {
    ...state,
    [player]: ps,
    activeMissions: missions,
    log,
  };

  // Trigger MAIN + UPGRADE effects via EffectEngine
  const upgradedMission = newState.activeMissions[missionIndex];
  const upgradedChars = player === 'player1' ? upgradedMission.player1Characters : upgradedMission.player2Characters;
  const upgradedChar = upgradedChars.find((c) => c.instanceId === targetInstanceId);
  if (upgradedChar) {
    newState = EffectEngine.resolvePlayEffects(newState, player, upgradedChar, missionIndex, true);
  }

  return newState;
}

/**
 * Player passes. First passer gets the Edge token for next turn.
 */
function handlePass(state: GameState, player: PlayerID): GameState {
  const ps = { ...state[player] };
  ps.hasPassed = true;

  let edgeHolder = state.edgeHolder;
  let firstPasser = state.firstPasser;

  // First player to pass gets the Edge token
  if (firstPasser === null) {
    firstPasser = player;
    edgeHolder = player;
  }

  const takesEdge = firstPasser === player && state.firstPasser === null;
  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'PASS',
    `${player} passes.${takesEdge ? ` ${player} takes the Edge token.` : ''}`,
    takesEdge ? 'game.log.passEdge' : 'game.log.pass',
  );

  // After passing, the other player becomes active (if they haven't passed)
  const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const activePlayer = state[otherPlayer].hasPassed ? state.activePlayer : otherPlayer;

  return {
    ...state,
    [player]: ps,
    edgeHolder,
    firstPasser,
    activePlayer,
    log,
  };
}

/**
 * Get all valid actions for a player during the action phase.
 */
export function getValidActionsForPlayer(state: GameState, player: PlayerID): GameAction[] {
  const actions: GameAction[] = [];
  const ps = state[player];

  if (ps.hasPassed) return [];

  // Check if it's this player's turn to act
  const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const otherPassed = state[otherPlayer].hasPassed;
  if (!otherPassed && state.activePlayer !== player) return [];

  // PASS is always available
  actions.push({ type: 'PASS' });

  // For each card in hand, check if it can be played on each mission
  for (let cardIdx = 0; cardIdx < ps.hand.length; cardIdx++) {
    const card = ps.hand[cardIdx];

    for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
      // Play face-visible
      const effectiveCost = calculateEffectiveCost(state, player, card, mIdx, false);
      const playValidation = validatePlayCharacter(state, player, card, mIdx, effectiveCost);
      if (playValidation.valid) {
        actions.push({
          type: 'PLAY_CHARACTER',
          cardIndex: cardIdx,
          missionIndex: mIdx,
          hidden: false,
        });
      }

      // Play hidden
      const hiddenValidation = validatePlayHidden(state, player, card, mIdx);
      if (hiddenValidation.valid) {
        actions.push({
          type: 'PLAY_HIDDEN',
          cardIndex: cardIdx,
          missionIndex: mIdx,
        });
      }

      // Upgrade existing characters
      const chars = player === 'player1'
        ? state.activeMissions[mIdx].player1Characters
        : state.activeMissions[mIdx].player2Characters;

      for (const existingChar of chars) {
        const upgradeValidation = validateUpgradeCharacter(state, player, card, mIdx, existingChar.instanceId);
        if (upgradeValidation.valid) {
          actions.push({
            type: 'UPGRADE_CHARACTER',
            cardIndex: cardIdx,
            missionIndex: mIdx,
            targetInstanceId: existingChar.instanceId,
          });
        }
      }
    }
  }

  // Reveal hidden characters
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const chars = player === 'player1'
      ? state.activeMissions[mIdx].player1Characters
      : state.activeMissions[mIdx].player2Characters;

    for (const char of chars) {
      if (char.isHidden && char.controlledBy === player) {
        const revealValidation = validateRevealCharacter(state, player, mIdx, char.instanceId);
        if (revealValidation.valid) {
          actions.push({
            type: 'REVEAL_CHARACTER',
            missionIndex: mIdx,
            characterInstanceId: char.instanceId,
          });
        }
      }
    }
  }

  return actions;
}

function countPlayerCharsInMissions(missions: GameState['activeMissions'], player: PlayerID): number {
  let count = 0;
  for (const mission of missions) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    count += chars.length;
  }
  return count;
}

/**
 * Trigger continuous on-play reactions from opponent's characters.
 * Called when a player plays a non-hidden character on a mission.
 *
 * - Neji 037 (UC): POWERUP 1 when a non-hidden enemy character is played in this mission
 * - Hinata 031 (UC): Gain 1 Chakra when a non-hidden enemy character is played in this mission
 */
function triggerOnPlayReactions(state: GameState, playingPlayer: PlayerID, missionIndex: number): GameState {
  let newState = { ...state };
  const opponent: PlayerID = playingPlayer === 'player1' ? 'player2' : 'player1';
  const mission = newState.activeMissions[missionIndex];
  const opponentChars = opponent === 'player1' ? mission.player1Characters : mission.player2Characters;

  for (const char of opponentChars) {
    if (char.isHidden) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      // Neji 037 (UC): POWERUP 1 when a non-hidden enemy plays in this mission
      if (topCard.number === 37 && effect.description.includes('POWERUP 1')) {
        const missions = [...newState.activeMissions];
        const updatedMission = { ...missions[missionIndex] };
        const side = opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        updatedMission[side] = updatedMission[side].map((c: CharacterInPlay) =>
          c.instanceId === char.instanceId ? { ...c, powerTokens: c.powerTokens + 1 } : c,
        );
        missions[missionIndex] = updatedMission;
        newState.activeMissions = missions;
        newState.log = logAction(
          newState.log, newState.turn, 'action', opponent,
          'EFFECT_CONTINUOUS',
          `Neji Hyuga (037): POWERUP 1 — enemy played a non-hidden character in this mission.`,
          'game.log.effect.neji037',
          { card: 'NEJI HYUGA', id: 'KS-037-UC' },
        );
      }

      // Hinata 031 (UC): Gain 1 Chakra when enemy plays non-hidden in this mission
      if (topCard.number === 31 && effect.description.includes('1 Chakra')) {
        const ps = { ...newState[opponent] };
        ps.chakra += 1;
        newState = { ...newState, [opponent]: ps };
        newState.log = logAction(
          newState.log, newState.turn, 'action', opponent,
          'EFFECT_CONTINUOUS',
          `Hinata Hyuga (031): Gained 1 Chakra — enemy played a non-hidden character in this mission.`,
          'game.log.effect.hinata031',
          { card: 'HINATA HYUGA', id: 'KS-031-UC' },
        );
      }
    }
  }

  return newState;
}
