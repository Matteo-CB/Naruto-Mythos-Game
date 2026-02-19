import type { GameState, PlayerID, TurnNumber, MissionRank, CharacterInPlay } from '../types';
import { BASE_CHAKRA_PER_TURN, CARDS_DRAWN_PER_TURN, TURN_TO_RANK, RANK_BONUS } from '../types';
import { logSystem, logAction } from '../utils/gameLog';
import { calculateContinuousChakraBonus } from '../../effects/ContinuousEffects';

/**
 * Execute the Start Phase:
 * 1. Reveal the top card of the mission deck, assign rank based on turn
 * 2. Each player gains 5 chakra + 1 per character in play + CHAKRA +X bonuses
 * 3. Each player draws 2 cards
 */
export function executeStartPhase(state: GameState): GameState {
  let newState = { ...state };

  // 1. Reveal mission card
  newState = revealMissionCard(newState);

  // 2. Grant chakra
  newState = grantChakra(newState, 'player1');
  newState = grantChakra(newState, 'player2');

  // 3. Draw cards
  newState = drawCards(newState, 'player1', CARDS_DRAWN_PER_TURN);
  newState = drawCards(newState, 'player2', CARDS_DRAWN_PER_TURN);

  newState.turnMissionRevealed = true;

  return newState;
}

function revealMissionCard(state: GameState): GameState {
  if (state.missionDeck.length === 0) return state;

  const missionDeck = [...state.missionDeck];
  const missionCard = missionDeck.shift()!;
  const rank: MissionRank = TURN_TO_RANK[state.turn];
  const rankBonus = RANK_BONUS[rank];

  const activeMission = {
    card: missionCard,
    rank,
    basePoints: missionCard.basePoints,
    rankBonus,
    player1Characters: [] as CharacterInPlay[],
    player2Characters: [] as CharacterInPlay[],
    wonBy: null,
  };

  const log = logSystem(
    state.log,
    state.turn,
    'start',
    'REVEAL_MISSION',
    `Mission "${missionCard.name_fr}" revealed as rank ${rank} (${missionCard.basePoints} + ${rankBonus} bonus points).`,
    'game.log.revealMission',
    { name: missionCard.name_fr, rank, base: missionCard.basePoints, bonus: rankBonus },
  );

  return {
    ...state,
    missionDeck,
    activeMissions: [...state.activeMissions, activeMission],
    log,
  };
}

/**
 * Grant chakra: 5 base + 1 per character in play + CHAKRA +X continuous effects
 */
function grantChakra(state: GameState, player: PlayerID): GameState {
  const playerState = { ...state[player] };

  // Count characters in play (including hidden)
  let charCount = 0;
  for (const mission of state.activeMissions) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    charCount += chars.length;
  }

  // Calculate CHAKRA +X bonuses from continuous effects
  const chakraBonus = calculateChakraBonus(state, player);

  const totalChakra = BASE_CHAKRA_PER_TURN + charCount + chakraBonus;
  playerState.chakra += totalChakra;

  const log = logAction(
    state.log,
    state.turn,
    'start',
    player,
    'GAIN_CHAKRA',
    `${player} gains ${totalChakra} chakra (${BASE_CHAKRA_PER_TURN} base + ${charCount} characters + ${chakraBonus} bonus). Total: ${playerState.chakra}.`,
    'game.log.gainChakra',
    { total: totalChakra, base: BASE_CHAKRA_PER_TURN, chars: charCount, bonus: chakraBonus, finalTotal: playerState.chakra },
  );

  return {
    ...state,
    [player]: playerState,
    log,
  };
}

/**
 * Calculate CHAKRA +X bonuses from continuous effects on the board.
 * Delegates to centralized ContinuousEffects module.
 */
export function calculateChakraBonus(state: GameState, player: PlayerID): number {
  let bonus = 0;

  for (let missionIndex = 0; missionIndex < state.activeMissions.length; missionIndex++) {
    const mission = state.activeMissions[missionIndex];
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;

    for (const char of chars) {
      if (char.isHidden) continue; // Continuous effects don't apply while hidden
      bonus += calculateContinuousChakraBonus(state, player, missionIndex, char);
    }
  }

  return bonus;
}

function drawCards(state: GameState, player: PlayerID, count: number): GameState {
  const playerState = { ...state[player] };
  const deck = [...playerState.deck];
  const hand = [...playerState.hand];

  const drawn = Math.min(count, deck.length);
  if (drawn === 0) {
    const log = logAction(
      state.log,
      state.turn,
      'start',
      player,
      'DRAW',
      `${player} has no cards to draw.`,
      'game.log.noDraw',
    );
    return { ...state, log };
  }

  const drawnCards = deck.splice(0, drawn);
  hand.push(...drawnCards);

  playerState.deck = deck;
  playerState.hand = hand;

  const log = logAction(
    state.log,
    state.turn,
    'start',
    player,
    'DRAW',
    `${player} draws ${drawn} card(s).`,
    'game.log.draw',
    { count: drawn },
  );

  return {
    ...state,
    [player]: playerState,
    log,
  };
}
