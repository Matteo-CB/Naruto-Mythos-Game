import type { GameState, GameAction, PlayerID, CharacterInPlay, CharacterCard } from '../types';
import { HIDDEN_PLAY_COST } from '../types';
import { deepClone } from '../utils/deepClone';
import { generateInstanceId } from '../utils/id';
import { logAction } from '../utils/gameLog';
import { validatePlayCharacter, validatePlayHidden, validateRevealCharacter, validateUpgradeCharacter } from '../rules/PlayValidation';
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

  switch (action.type) {
    case 'PLAY_CHARACTER':
      newState = handlePlayCharacter(newState, player, action.cardIndex, action.missionIndex);
      break;
    case 'PLAY_HIDDEN':
      newState = handlePlayHidden(newState, player, action.cardIndex, action.missionIndex);
      break;
    case 'REVEAL_CHARACTER':
      newState = handleRevealCharacter(newState, player, action.missionIndex, action.characterInstanceId);
      break;
    case 'UPGRADE_CHARACTER':
      newState = handleUpgradeCharacter(newState, player, action.cardIndex, action.missionIndex, action.targetInstanceId);
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
  if (!newState.player1.hasPassed && !newState.player2.hasPassed) {
    if (action.type !== 'PASS') {
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

  const effectiveCost = calculateEffectiveCost(state, player, char.card, missionIndex, true);

  // Pay printed chakra cost
  const ps = { ...state[player] };
  if (ps.chakra < effectiveCost) return state;
  ps.chakra -= effectiveCost;

  // Reveal the character
  char.isHidden = false;
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

  // Cost difference
  const costDiff = newCard.chakra - existingTopCard.chakra;
  if (costDiff <= 0) return state;

  // Pay difference
  const ps = { ...playerState };
  if (ps.chakra < costDiff) return state;
  ps.chakra -= costDiff;

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

  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'PASS',
    `${player} passes.${firstPasser === player && state.firstPasser === null ? ` ${player} takes the Edge token.` : ''}`,
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
