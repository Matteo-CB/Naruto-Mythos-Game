/**
 * AI Target Selection — intelligent target picking for pending actions.
 *
 * When the AI faces a target-selection prompt (POWERUP, DEFEAT, MOVE, etc.)
 * this module evaluates the options and picks the strategically best one
 * based on the current difficulty level.
 */

import type { GameState, PlayerID, CharacterInPlay, ActiveMission } from '../engine/types';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

interface PendingActionInfo {
  description: string;
  sourceEffectId?: string;
  descriptionKey?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Choose the best target from `options` given the current game state,
 * the pending action description, the AI player, and the difficulty level.
 */
export function aiSelectTarget(
  options: string[],
  pendingAction: PendingActionInfo,
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  // Trivial cases
  if (options.length === 0) return '';
  if (options.length === 1) return options[0];

  // Confirm / acknowledge — always confirm
  if (options.includes('confirm')) return 'confirm';

  // Easy: always random
  if (difficulty === 'easy') {
    return randomPick(options);
  }

  const desc = pendingAction.description.toLowerCase();

  // POWERUP: place tokens on the most strategically valuable friendly character
  if (desc.includes('powerup') || desc.includes('power up') || desc.includes('power token')) {
    return selectPowerupTarget(options, state, aiPlayer, difficulty);
  }

  // SACRIFICE OWN CHARACTER (e.g., Jiraiya 132 UPGRADE — opponent chooses own chars to defeat)
  if (desc.includes('choose one of your characters to defeat') || desc.includes('choisissez un de vos personnages')) {
    return selectSacrificeTarget(options, state, aiPlayer, difficulty);
  }

  // DEFEAT / DESTROY: remove the strongest enemy
  if (desc.includes('defeat') || desc.includes('destroy') || desc.includes('eliminate')) {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  // HIDE: hide the strongest enemy character (same heuristic as defeat)
  if (desc.includes('hide') || desc.includes('cacher') || desc.includes('face down')) {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  // MOVE: move a character between missions
  if (desc.includes('move') || desc.includes('déplace')) {
    return selectMoveTarget(options, state, aiPlayer, difficulty);
  }

  // STEAL / TAKE CONTROL
  if (desc.includes('steal') || desc.includes('take control') || desc.includes('control')) {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  // RETURN TO HAND / BOUNCE
  if (desc.includes('return') || desc.includes('hand') || desc.includes('retour')) {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  // DISCARD from hand — pick lowest value card
  if (desc.includes('discard') || desc.includes('défausse')) {
    return selectDiscardTarget(options, state, aiPlayer, difficulty);
  }

  // CHOOSE CARD FROM HAND (e.g. put a card on top of deck)
  if (desc.includes('choose') || desc.includes('select') || desc.includes('choisir')) {
    // For generic choose prompts, try mission-value heuristic, else random
    return selectByMissionValue(options, state, aiPlayer) ?? randomPick(options);
  }

  // Default fallback
  if (difficulty === 'medium') {
    return randomPick(options);
  }

  // Hard / Expert: try mission-value heuristic, fall back to first option
  return selectByMissionValue(options, state, aiPlayer) ?? options[0];
}

// ---------------------------------------------------------------------------
// Helpers — finding characters in state
// ---------------------------------------------------------------------------

interface FoundCharacter {
  char: CharacterInPlay;
  missionIndex: number;
  side: PlayerID;
}

function findCharacterInState(state: GameState, instanceId: string): FoundCharacter | null {
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const mission = state.activeMissions[mIdx];
    for (const char of mission.player1Characters) {
      if (char.instanceId === instanceId) {
        return { char, missionIndex: mIdx, side: 'player1' };
      }
    }
    for (const char of mission.player2Characters) {
      if (char.instanceId === instanceId) {
        return { char, missionIndex: mIdx, side: 'player2' };
      }
    }
  }
  return null;
}

/**
 * Effective power of a character (top of stack power + power tokens).
 * Hidden characters are treated as 0.
 */
function getCharEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return (topCard.power ?? 0) + char.powerTokens;
}

/**
 * Chakra cost of a character's top card (relevant for evaluating threat level).
 */
function getCharCost(char: CharacterInPlay): number {
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.chakra ?? 0;
}

// ---------------------------------------------------------------------------
// Helpers — mission evaluation
// ---------------------------------------------------------------------------

function getMissionValue(state: GameState, missionIndex: number): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  return (mission.basePoints ?? 0) + (mission.rankBonus ?? 0);
}

/**
 * Power gap from the AI's perspective: positive means AI is ahead.
 */
function getMissionPowerGap(state: GameState, missionIndex: number, aiPlayer: PlayerID): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;

  const aiChars = aiPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
  const oppChars = aiPlayer === 'player1' ? mission.player2Characters : mission.player1Characters;

  const aiPower = aiChars.reduce((sum, c) => sum + getCharEffectivePower(c), 0);
  const oppPower = oppChars.reduce((sum, c) => sum + getCharEffectivePower(c), 0);

  return aiPower - oppPower;
}

// ---------------------------------------------------------------------------
// Strategy: POWERUP target selection
// ---------------------------------------------------------------------------

/**
 * For POWERUP effects: place tokens on the character where they matter most.
 *
 * Medium: favor characters on higher-value missions.
 * Hard/Expert: favor characters on contested, high-value missions where
 * the additional power might swing the outcome.
 */
function selectPowerupTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const missionValue = getMissionValue(state, found.missionIndex);
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    const charPower = getCharEffectivePower(found.char);

    let score: number;
    if (difficulty === 'medium') {
      // Medium: simply prefer higher mission value, break ties with char power
      score = missionValue * 10 + charPower;
    } else {
      // Hard / Expert: prioritize contested missions (gap close to 0)
      // where extra power tokens can flip the result
      const contestedness = Math.max(0, 10 - Math.abs(powerGap));
      score = missionValue * 2 + contestedness * 3 + charPower;
      // Bonus: slightly losing is more urgent than slightly winning
      if (powerGap < 0 && powerGap > -5) {
        score += 5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}

// ---------------------------------------------------------------------------
// Strategy: DEFEAT / HIDE target selection
// ---------------------------------------------------------------------------

/**
 * For DEFEAT/HIDE effects: target the strongest enemy, weighted by mission value.
 *
 * Medium: pick the enemy with the highest effective power.
 * Hard/Expert: also factor in mission value — removing a strong character
 * from a valuable mission is the optimal play.
 */
function selectDefeatTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const charPower = getCharEffectivePower(found.char);
    const charCost = getCharCost(found.char);
    const missionValue = getMissionValue(state, found.missionIndex);
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);

    let score: number;
    if (difficulty === 'medium') {
      // Medium: simply target the strongest character
      score = charPower * 10 + charCost;
    } else {
      // Hard/Expert: combine power, mission value, and how much
      // removing this character would improve our position
      score = charPower * 3 + missionValue * 2 + charCost;
      // Extra value if defeating this character would flip a mission from losing to winning
      if (powerGap < 0 && powerGap + charPower >= 0) {
        score += 10;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}

// ---------------------------------------------------------------------------
// Strategy: SACRIFICE own character (forced defeat of own chars)
// ---------------------------------------------------------------------------

/**
 * When forced to sacrifice own characters (e.g., Jiraiya 132 UPGRADE):
 * pick the weakest character — lowest power, lowest cost, on the
 * least valuable mission.
 */
function selectSacrificeTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = Infinity; // lower is "better" (weakest to sacrifice)

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const charPower = getCharEffectivePower(found.char);
    const charCost = getCharCost(found.char);
    const missionValue = getMissionValue(state, found.missionIndex);

    let score: number;
    if (difficulty === 'medium') {
      // Medium: sacrifice lowest power character
      score = charPower * 10 + charCost;
    } else {
      // Hard/Expert: factor in mission value — prefer sacrificing from missions
      // we're already dominating (high gap) or low-value missions
      const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
      score = charPower * 3 + missionValue + charCost;
      // Prefer sacrificing from missions where we have a big lead
      if (powerGap > charPower) {
        score -= 5; // Safe to lose this character
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}

// ---------------------------------------------------------------------------
// Strategy: MOVE target selection
// ---------------------------------------------------------------------------

/**
 * For MOVE effects: choose where to move a character.
 *
 * Options can be either:
 * - Mission indices (numbers like "0", "1", "2", "3") — choosing destination
 * - Character instanceIds — choosing which character to move
 */
function selectMoveTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  // Check if options are mission indices
  const areMissions = options.every((o) => /^\d+$/.test(o) && parseInt(o) < 10);

  if (areMissions) {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  // Options are character instanceIds — pick the strongest to move
  return selectDefeatTarget(options, state, aiPlayer, difficulty);
}

/**
 * When choosing a mission destination for a move effect.
 * Depends on context: moving a friendly favors where we need help;
 * moving an enemy favors where we already dominate.
 */
function selectMissionDestination(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const opt of options) {
    const mIdx = parseInt(opt);
    const missionValue = getMissionValue(state, mIdx);
    const powerGap = getMissionPowerGap(state, mIdx, aiPlayer);

    let score: number;
    if (difficulty === 'medium') {
      // Medium: favor higher-value missions
      score = missionValue;
    } else {
      // Hard/Expert: favor missions where we need help the most
      // (negative gap + high value = most impactful destination)
      score = missionValue * 2 - powerGap;
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}

// ---------------------------------------------------------------------------
// Strategy: DISCARD from hand
// ---------------------------------------------------------------------------

/**
 * When forced to discard, pick the card with the lowest value.
 * Options are typically card indices in hand.
 */
function selectDiscardTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  // If options are hand indices, try to discard the weakest card
  const hand = state[aiPlayer].hand;

  let worstOption = options[0];
  let worstScore = Infinity;

  for (const opt of options) {
    // Options could be indices or instanceIds — try index first
    const idx = parseInt(opt);
    if (!isNaN(idx) && idx >= 0 && idx < hand.length) {
      const card = hand[idx];
      // Score: power + chakra cost as a rough card quality measure
      const cardValue = (card.power ?? 0) + (card.chakra ?? 0);
      if (cardValue < worstScore) {
        worstScore = cardValue;
        worstOption = opt;
      }
    }
  }

  return worstOption;
}

// ---------------------------------------------------------------------------
// Fallback: select by mission value
// ---------------------------------------------------------------------------

/**
 * Generic fallback: if options are character instanceIds, pick the one
 * on the highest-value mission.
 */
function selectByMissionValue(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
): string | null {
  let bestOption: string | null = null;
  let bestScore = -Infinity;

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const missionValue = getMissionValue(state, found.missionIndex);
    if (missionValue > bestScore) {
      bestScore = missionValue;
      bestOption = opt;
    }
  }

  return bestOption;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
