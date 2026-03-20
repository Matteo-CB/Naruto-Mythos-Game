/**
 * AI Target Selection - intelligent target picking for pending actions.
 *
 * When the AI faces a target-selection prompt (POWERUP, DEFEAT, MOVE, etc.)
 * this module evaluates the options and picks the strategically best one
 * based on the current difficulty level.
 */

import type { GameState, PlayerID, CharacterInPlay, ActiveMission } from '../engine/types';
import { getCardTier, hasUpgradeTarget } from './evaluation/CardTiers';

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

  // Confirm / acknowledge - always confirm
  if (options.includes('confirm')) return 'confirm';

  // Token amount choice (e.g., "1" or "2"): AI always picks the maximum
  if (pendingAction.descriptionKey === 'game.effect.desc.chooseTokenAmountRemove' ||
      pendingAction.descriptionKey === 'game.effect.desc.chooseTokenAmountSteal') {
    return options.reduce((max, opt) => parseInt(opt, 10) > parseInt(max, 10) ? opt : max, options[0]);
  }

  // Easy: always random
  if (difficulty === 'easy') {
    return randomPick(options);
  }

  const desc = pendingAction.description.toLowerCase();

  // POWERUP: place tokens on the most strategically valuable friendly character
  if (desc.includes('powerup') || desc.includes('power up') || desc.includes('power token')) {
    return selectPowerupTarget(options, state, aiPlayer, difficulty);
  }

  // SACRIFICE OWN CHARACTER (e.g., Jiraiya 132 UPGRADE - opponent chooses own chars to defeat)
  if (desc.includes('choose one of your characters to defeat') || desc.includes('choisissez un de vos personnages')) {
    return selectSacrificeTarget(options, state, aiPlayer, difficulty);
  }

  // SCORE ORDER: AI picks first option (order is a minor strategic detail)
  if (desc.includes('score effect') || desc.includes('effet score')) {
    return options[0];
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

  // DISCARD from hand - pick lowest value card
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
// Helpers - finding characters in state
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
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return (topCard.power ?? 0) + char.powerTokens;
}

/**
 * Chakra cost of a character's top card (relevant for evaluating threat level).
 */
function getCharCost(char: CharacterInPlay): number {
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return topCard.chakra ?? 0;
}

/**
 * Card tier of a character's top card.
 */
function getCharTier(char: CharacterInPlay): number {
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return getCardTier(topCard);
}

/**
 * Check if a character has SCORE effects.
 */
function hasScoreEffect(char: CharacterInPlay): boolean {
  if (char.isHidden) return false;
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return topCard.effects?.some(e => e.type === 'SCORE') ?? false;
}

// ---------------------------------------------------------------------------
// Helpers - mission evaluation
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
 * Hard/Expert: prioritize mission-flipping - placing tokens where they can
 * swing a mission from losing to winning is the highest-value play.
 */
function selectPowerupTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = -Infinity;
  const turn = state.turn ?? 1;

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const missionValue = getMissionValue(state, found.missionIndex);
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    const charPower = getCharEffectivePower(found.char);

    let score: number;
    if (difficulty === 'medium') {
      score = missionValue * 10 + charPower;
    } else {
      // Hard/Expert: mission-flip awareness
      if (powerGap < 0 && powerGap > -5) {
        // We're slightly losing - tokens could flip this mission!
        score = missionValue * 4 + Math.max(0, 10 - Math.abs(powerGap)) * 3;
      } else if (powerGap >= 0 && powerGap <= 3) {
        // Contested - tokens help secure the win
        score = missionValue * 2.5 + charPower;
      } else if (powerGap > 3) {
        // Already winning by a lot - tokens are wasted here
        score = missionValue * 0.5 + charPower * 0.3;
      } else {
        // Losing badly - tokens won't flip, low priority
        score = missionValue * 0.8;
      }

      // Turn 4 multiplier: last scoring, tokens matter more
      if (turn === 4) score *= 1.5;
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
 * For DEFEAT/HIDE effects: target the enemy whose removal has the highest impact.
 *
 * Medium: pick the enemy with the highest effective power.
 * Hard/Expert: prioritize mission-flipping targets, SCORE denial, and card tier.
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
      score = charPower * 10 + charCost;
    } else {
      // Hard/Expert: power-weighted by mission value
      score = charPower * missionValue * 0.5 + charCost * 0.5;

      // Mission-flip bonus: defeating this char flips the mission from losing to winning
      if (powerGap < 0 && powerGap + charPower >= 0) {
        score += missionValue * 5;
      }

      // SCORE denial: defeating a char with SCORE effects prevents bonus value
      if (hasScoreEffect(found.char)) {
        score += missionValue * 2;
      }

      // Card tier threat: higher-tier cards are more dangerous to leave alive
      const tier = getCharTier(found.char);
      score += tier * 1.5;
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
 * pick the weakest character - lowest power, lowest cost, on the
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
      // Hard/Expert: factor in mission value - prefer sacrificing from missions
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
 * - Mission indices (numbers like "0", "1", "2", "3") - choosing destination
 * - Character instanceIds - choosing which character to move
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

  // Options are character instanceIds - pick the strongest to move
  return selectDefeatTarget(options, state, aiPlayer, difficulty);
}

/**
 * When choosing a mission destination for a move effect.
 * Hard/Expert: considers departure cost (losing source mission) vs arrival benefit.
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
      score = missionValue;
    } else {
      // Hard/Expert: favor contested high-value missions where help matters
      if (powerGap < 0 && powerGap > -5) {
        // Losing slightly - moving here could flip it
        score = missionValue * 3;
      } else if (powerGap >= 0 && powerGap <= 2) {
        // Contested - reinforce to secure
        score = missionValue * 2;
      } else if (powerGap > 2) {
        // Already winning - low priority
        score = missionValue * 0.5;
      } else {
        // Losing badly - help needed but may not be enough
        score = missionValue * 1.2;
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
// Strategy: DISCARD from hand
// ---------------------------------------------------------------------------

/**
 * When forced to discard, pick the card with the lowest strategic value.
 * Uses card tiers + affordability context.
 */
function selectDiscardTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  const hand = state[aiPlayer].hand;
  const chakra = state[aiPlayer].chakra;

  let worstOption = options[0];
  let worstScore = Infinity;

  for (const opt of options) {
    const idx = parseInt(opt);
    if (!isNaN(idx) && idx >= 0 && idx < hand.length) {
      const card = hand[idx];

      let cardValue: number;
      if (difficulty === 'medium') {
        cardValue = (card.power ?? 0) + (card.chakra ?? 0);
      } else {
        // Hard/Expert: use card tier + affordability
        const tier = getCardTier(card);
        const cost = card.chakra ?? 0;
        cardValue = tier * 3;
        // Can't afford = less valuable to keep
        if (cost > chakra + 5) cardValue *= 0.5;
        // Has upgrade target = more valuable
        if (hasUpgradeTarget(state, aiPlayer, card)) cardValue += 5;
      }

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
