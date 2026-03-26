/**
 * AI Target Selection - intelligent target picking for pending actions.
 *
 * When the AI faces a target-selection prompt (POWERUP, DEFEAT, MOVE, etc.)
 * this module evaluates the options and picks the strategically best one
 * based on the current difficulty level.
 *
 * IMPORTANT: For any unhandled/unknown type, the function MUST return
 * options[0] as a fallback. Returning undefined would force a PASS and
 * break the game loop.
 */

import type { GameState, PlayerID, CharacterInPlay, ActiveMission, PendingEffect } from '../engine/types';
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
 * Look up the PendingEffect associated with a PendingAction via sourceEffectId.
 */
function findPendingEffect(state: GameState, pendingAction: PendingActionInfo): PendingEffect | undefined {
  if (!pendingAction.sourceEffectId) return undefined;
  return state.pendingEffects?.find((e) => e.id === pendingAction.sourceEffectId);
}

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

  // ---------------------------------------------------------------------------
  // Type-based dispatch: use the pendingEffect's targetSelectionType for
  // precise matching. This avoids false positives from description-based matching.
  // ---------------------------------------------------------------------------
  const pendingEffect = findPendingEffect(state, pendingAction);
  const tst = pendingEffect?.targetSelectionType ?? '';

  // --- CONFIRM types: always return the source instanceId (first option) ---
  if (tst.includes('_CONFIRM_') || tst.endsWith('_CONFIRM')) {
    return options[0];
  }

  // --- Token amount choice (CHOOSE_TOKEN_AMOUNT_REMOVE / STEAL): pick maximum ---
  if (tst === 'CHOOSE_TOKEN_AMOUNT_REMOVE' || tst === 'CHOOSE_TOKEN_AMOUNT_STEAL' ||
      pendingAction.descriptionKey === 'game.effect.desc.chooseTokenAmountRemove' ||
      pendingAction.descriptionKey === 'game.effect.desc.chooseTokenAmountSteal') {
    return options.reduce((max, opt) => parseInt(opt, 10) > parseInt(max, 10) ? opt : max, options[0]);
  }

  // --- ORDERED_DEFEAT: return JSON.stringify(orderedArray) ---
  if (tst === 'ORDERED_DEFEAT') {
    return selectOrderedDefeat(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  // --- REORDER_DISCARD: return JSON.stringify(orderedArray) ---
  if (tst === 'REORDER_DISCARD') {
    return selectReorderDiscard(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  // --- SAKURA135_CHOOSE_CARD: pick best character card from top 3 ---
  if (tst === 'SAKURA135_CHOOSE_CARD') {
    return selectSakura135Card(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  // --- SAKURA135_CHOOSE_MISSION: pick best mission to play the card on ---
  if (tst === 'SAKURA135_CHOOSE_MISSION') {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  // --- KABUTO053_CHOOSE_MISSION: pick best mission for discard play ---
  if (tst === 'KABUTO053_CHOOSE_MISSION') {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  // --- KABUTO053_CHOOSE_DISCARD: pick a card from hand to discard (least valuable) ---
  if (tst === 'KABUTO053_CHOOSE_DISCARD') {
    return selectDiscardTarget(options, state, aiPlayer, difficulty);
  }

  // --- EFFECT_PLAY_UPGRADE_OR_FRESH: prefer upgrade to save chakra ---
  if (tst === 'EFFECT_PLAY_UPGRADE_OR_FRESH') {
    return selectUpgradeOrFresh(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  // --- ITACHI128_MOVE_FRIENDLY: pick a friendly character to move ---
  if (tst === 'ITACHI128_MOVE_FRIENDLY') {
    return selectFriendlyToMove(options, state, aiPlayer, difficulty);
  }

  // --- ITACHI128_MOVE_DESTINATION: pick mission destination ---
  if (tst === 'ITACHI128_MOVE_DESTINATION') {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  // --- CHOJI_018_MOVE_SELF: pick mission to move Choji to ---
  if (tst === 'CHOJI_018_MOVE_SELF') {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  // --- TSUNADE104_CHOOSE_CHAKRA: spend chakra for powerup ---
  if (tst === 'TSUNADE104_CHOOSE_CHAKRA') {
    return selectTsunade104Chakra(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  // --- NARUTO133_CHOOSE_TARGET1 / TARGET2: defeat/hide target selection ---
  if (tst === 'NARUTO133_CHOOSE_TARGET1' || tst === 'NARUTO133_CHOOSE_TARGET2') {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  // --- CHOOSE_SCORE_ORDER / END_OF_ROUND_EFFECT_ORDER: order doesn't matter much ---
  if (tst === 'CHOOSE_SCORE_ORDER' || tst === 'END_OF_ROUND_EFFECT_ORDER') {
    return options[0];
  }

  // --- GAARA120_CHOOSE_DEFEAT: defeat one enemy per mission ---
  if (tst === 'GAARA120_CHOOSE_DEFEAT') {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  // Easy: always random for remaining unmatched types
  if (difficulty === 'easy') {
    return randomPick(options);
  }

  // ---------------------------------------------------------------------------
  // Fallback: description-based matching for older/generic types
  // ---------------------------------------------------------------------------
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
    return selectByMissionValue(options, state, aiPlayer) ?? options[0];
  }

  // Default fallback: NEVER return undefined — always return options[0]
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
// Strategy: ORDERED_DEFEAT - JSON array of target IDs in order
// ---------------------------------------------------------------------------

/**
 * For ORDERED_DEFEAT effects (Gaara 120, Ichibi 130, Naruto 133):
 * Returns JSON.stringify(orderedArray) since the engine expects a JSON array.
 *
 * - Gaara 120 (one-per-mission): pick the most valuable target per mission
 * - Ichibi 130 (all-in-mission): defeat all hidden enemies
 * - Naruto 133 (group1 P<=5 this mission + group2 P<=2 anywhere): pick highest value targets
 */
function selectOrderedDefeat(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  // Easy: random order of all targets
  if (difficulty === 'easy') {
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    return JSON.stringify(shuffled);
  }

  let parsed: {
    constraintMode?: string;
    isUpgrade?: boolean;
    useDefeat?: boolean;
    group1?: string[];
    group2?: string[];
    sourceMissionIndex?: number;
  } = {};
  try { parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

  const constraintMode = parsed.constraintMode;

  if (constraintMode === 'one-per-mission') {
    // Gaara 120: pick the most valuable target per mission (up to 1 per mission)
    return selectOrderedDefeatOnePerMission(options, state, aiPlayer, difficulty);
  }

  if (constraintMode === 'all-in-mission') {
    // Ichibi 130: all hidden enemies — order by least valuable first (so most valuable last = highest power disruption)
    return selectOrderedDefeatAllInMission(options, state, aiPlayer, difficulty);
  }

  if (constraintMode === 'naruto133') {
    // Naruto 133: pick from group1 (P<=5 this mission) + group2 (P<=2 anywhere)
    return selectOrderedDefeatNaruto133(options, state, aiPlayer, difficulty, parsed);
  }

  // Generic fallback: sort by defeat value (highest value first)
  const scored = options.map((id) => {
    const found = findCharacterInState(state, id);
    if (!found) return { id, score: 0 };
    const power = getCharEffectivePower(found.char);
    const mValue = getMissionValue(state, found.missionIndex);
    return { id, score: power * mValue + getCharTier(found.char) };
  });
  scored.sort((a, b) => b.score - a.score);
  return JSON.stringify(scored.map((s) => s.id));
}

/**
 * Gaara 120 one-per-mission: choose one target per mission, prioritising
 * the target that provides the most mission-flip or SCORE-denial value.
 */
function selectOrderedDefeatOnePerMission(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  // Group options by mission
  const byMission = new Map<number, { id: string; score: number }[]>();
  for (const id of options) {
    const found = findCharacterInState(state, id);
    if (!found) continue;
    const mIdx = found.missionIndex;
    if (!byMission.has(mIdx)) byMission.set(mIdx, []);
    const power = getCharEffectivePower(found.char);
    const mValue = getMissionValue(state, mIdx);
    const powerGap = getMissionPowerGap(state, mIdx, aiPlayer);
    let score: number;
    if (difficulty === 'medium') {
      score = power * 10 + mValue;
    } else {
      // Hard/Impossible: prefer targets that flip the mission
      score = power * mValue * 0.5 + getCharTier(found.char) * 1.5;
      if (powerGap < 0 && powerGap + power >= 0) score += mValue * 5;
      if (hasScoreEffect(found.char)) score += mValue * 2;
    }
    byMission.get(mIdx)!.push({ id, score });
  }

  // Pick the best target per mission, ordered by mission value (highest first)
  const missionEntries = [...byMission.entries()]
    .sort((a, b) => getMissionValue(state, b[0]) - getMissionValue(state, a[0]));

  const ordered: string[] = [];
  for (const [, targets] of missionEntries) {
    targets.sort((a, b) => b.score - a.score);
    ordered.push(targets[0].id);
  }

  return JSON.stringify(ordered);
}

/**
 * Ichibi 130 all-in-mission: defeat all hidden enemies.
 * Order doesn't matter strategically (all are defeated), but we
 * sort by least valuable first for consistency.
 */
function selectOrderedDefeatAllInMission(
  options: string[],
  _state: GameState,
  _aiPlayer: PlayerID,
  _difficulty: AIDifficulty,
): string {
  // All hidden enemies get defeated — order doesn't affect outcome
  return JSON.stringify(options);
}

/**
 * Naruto 133: group1 = P<=5 in this mission, group2 = P<=2 anywhere.
 * Pick highest value targets from each group.
 */
function selectOrderedDefeatNaruto133(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  parsed: { group1?: string[]; group2?: string[]; sourceMissionIndex?: number },
): string {
  const group1 = parsed.group1 ?? [];
  const group2 = parsed.group2 ?? [];
  const ordered: string[] = [];

  // Score and pick best from group1
  const scoreTarget = (id: string): number => {
    const found = findCharacterInState(state, id);
    if (!found) return 0;
    const power = getCharEffectivePower(found.char);
    const mValue = getMissionValue(state, found.missionIndex);
    if (difficulty === 'medium') return power * 10 + mValue;
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    let s = power * mValue * 0.5 + getCharTier(found.char) * 1.5;
    if (powerGap < 0 && powerGap + power >= 0) s += mValue * 5;
    if (hasScoreEffect(found.char)) s += mValue * 2;
    return s;
  };

  // Pick best from group1 (this mission)
  if (group1.length > 0) {
    const available1 = group1.filter((id) => options.includes(id));
    if (available1.length > 0) {
      const best1 = available1.reduce((best, id) =>
        scoreTarget(id) > scoreTarget(best) ? id : best, available1[0]);
      ordered.push(best1);
    }
  }

  // Pick best from group2 (anywhere) that wasn't already picked
  if (group2.length > 0) {
    const available2 = group2.filter((id) => options.includes(id) && !ordered.includes(id));
    if (available2.length > 0) {
      const best2 = available2.reduce((best, id) =>
        scoreTarget(id) > scoreTarget(best) ? id : best, available2[0]);
      ordered.push(best2);
    }
  }

  // If we didn't pick enough, fill from remaining options
  if (ordered.length === 0) {
    const remaining = options.filter((id) => !ordered.includes(id));
    if (remaining.length > 0) ordered.push(remaining[0]);
  }

  return JSON.stringify(ordered);
}

// ---------------------------------------------------------------------------
// Strategy: REORDER_DISCARD - JSON array ordering discard pile
// ---------------------------------------------------------------------------

/**
 * For REORDER_DISCARD: choose the order of cards going into discard pile.
 * Put the least useful card on top (since the opponent could play from discard
 * with Kabuto). Last element in the returned array = top of discard.
 *
 * Easy: random order. Medium: sort by power ascending (weakest on top).
 * Hard/Impossible: put the least valuable card (by tier) on top.
 */
function selectReorderDiscard(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  // Easy: random order
  if (difficulty === 'easy') {
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    return JSON.stringify(shuffled);
  }

  // Determine whose discard pile this is (usually the AI's opponent)
  let parsedReorder: { discardOwner?: string } = {};
  try { parsedReorder = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
  const discardOwner = (parsedReorder.discardOwner as PlayerID) ?? (aiPlayer === 'player1' ? 'player2' : 'player1');

  // Find the actual cards by looking at the discard pile
  const discardPile = state[discardOwner]?.discardPile ?? [];

  // Score each option: higher score = more valuable = should be at the bottom (harder to access)
  // Last element in array = top of discard = easiest for opponent to retrieve
  const scored = options.map((id) => {
    // Options may have __dupN suffix for dedup
    const cleanId = id.replace(/__dup\d+$/, '');
    const card = discardPile.find((c) => c.id === cleanId || c.cardId === cleanId);
    let value: number;
    if (card) {
      if (difficulty === 'medium') {
        value = (card.power ?? 0) * 10 + (card.chakra ?? 0);
      } else {
        value = getCardTier(card) * 3 + (card.power ?? 0) * 2 + (card.chakra ?? 0);
      }
    } else {
      value = 0;
    }
    return { id, value };
  });

  // If the AI owns the discard pile, put least valuable on top (opponent can steal it)
  // If the opponent owns it, put least valuable on top (opponent plays from top)
  // In both cases: least valuable on top = last in array
  scored.sort((a, b) => b.value - a.value); // most valuable first (bottom) -> least valuable last (top)

  return JSON.stringify(scored.map((s) => s.id));
}

// ---------------------------------------------------------------------------
// Strategy: SAKURA135_CHOOSE_CARD - pick best character from top 3
// ---------------------------------------------------------------------------

/**
 * Sakura 135: Choose which card from the top 3 of the deck to play.
 * Options are indices like "0", "1", "2".
 * Parse the effectDescription to see the actual cards and pick the best one.
 */
function selectSakura135Card(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  // Easy: random
  if (difficulty === 'easy') return randomPick(options);

  let parsed: { topCards?: Array<{ index: number; name: string; chakra: number; power: number; isCharacter: boolean; cardId: string }> } = {};
  try { parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

  if (!parsed.topCards || parsed.topCards.length === 0) return options[0];

  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const opt of options) {
    const idx = parseInt(opt, 10);
    const cardInfo = parsed.topCards.find((c) => c.index === idx);
    if (!cardInfo) continue;

    let score: number;
    if (difficulty === 'medium') {
      score = cardInfo.power * 10 + cardInfo.chakra;
    } else {
      // Hard/Impossible: factor in card tier if available
      score = cardInfo.power * 5 + cardInfo.chakra * 2;
      // Try to look up tier by cardId
      try {
        const tier = getCardTier({ id: cardInfo.cardId, power: cardInfo.power, chakra: cardInfo.chakra } as any);
        score += tier * 3;
      } catch { /* ignore */ }
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}

// ---------------------------------------------------------------------------
// Strategy: EFFECT_PLAY_UPGRADE_OR_FRESH
// ---------------------------------------------------------------------------

/**
 * Choose between 'FRESH' play or upgrading over an existing character.
 * Prefer upgrade if it saves chakra. Options: ['FRESH', ...upgradeTargetIds].
 */
function selectUpgradeOrFresh(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  // Easy: random
  if (difficulty === 'easy') return randomPick(options);

  const hasFresh = options.includes('FRESH');
  const upgradeTargets = options.filter((o) => o !== 'FRESH');

  // If no upgrade targets, must be fresh
  if (upgradeTargets.length === 0) return 'FRESH';

  // If no fresh option, pick the best upgrade target
  if (!hasFresh) {
    // Pick the upgrade target on the most valuable mission
    return selectByMissionValue(upgradeTargets, state, aiPlayer) ?? upgradeTargets[0];
  }

  // Both options available — medium prefers upgrade (saves chakra)
  if (difficulty === 'medium') {
    // Upgrade over the character on the highest-value mission
    return selectByMissionValue(upgradeTargets, state, aiPlayer) ?? upgradeTargets[0];
  }

  // Hard/Impossible: evaluate upgrade benefit
  // Upgrades save chakra (difference only), so they are almost always preferable
  // unless the upgrade target is on a low-value mission and fresh play would go elsewhere
  let bestUpgrade: string | null = null;
  let bestUpgradeScore = -Infinity;

  for (const id of upgradeTargets) {
    const found = findCharacterInState(state, id);
    if (!found) continue;
    const mValue = getMissionValue(state, found.missionIndex);
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    let score = mValue * 3;
    if (powerGap < 0 && powerGap > -5) score += 10; // contested, upgrade helps
    if (score > bestUpgradeScore) {
      bestUpgradeScore = score;
      bestUpgrade = id;
    }
  }

  // Prefer upgrade since it saves chakra
  return bestUpgrade ?? 'FRESH';
}

// ---------------------------------------------------------------------------
// Strategy: ITACHI128 / move friendly character selection
// ---------------------------------------------------------------------------

/**
 * For selecting which friendly character to move (ITACHI128_MOVE_FRIENDLY).
 * Pick the character on the mission where AI has the biggest surplus (overkill),
 * so moving them away doesn't cost a mission win.
 */
function selectFriendlyToMove(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  // Easy: random
  if (difficulty === 'easy') return randomPick(options);

  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const id of options) {
    const found = findCharacterInState(state, id);
    if (!found) continue;

    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    const charPower = getCharEffectivePower(found.char);
    const mValue = getMissionValue(state, found.missionIndex);

    let score: number;
    if (difficulty === 'medium') {
      // Prefer moving from missions where we have surplus
      score = powerGap - charPower > 0 ? 10 + charPower : charPower - mValue;
    } else {
      // Hard/Impossible: move character from mission where removing them won't lose the mission
      const remainingGap = powerGap - charPower;
      if (remainingGap > 0) {
        // Still winning after removal: safe to move. Prefer moving the lowest power character
        // from a mission we're already winning comfortably
        score = 20 + (remainingGap * 2) - charPower;
      } else if (remainingGap === 0) {
        // Tied after removal (edge token matters) — risky
        score = 5 - mValue;
      } else {
        // We'd lose the mission after removal — only move if the mission is low value
        score = -mValue * 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = id;
    }
  }

  return bestOption;
}

// ---------------------------------------------------------------------------
// Strategy: TSUNADE104_CHOOSE_CHAKRA - spend chakra for powerup
// ---------------------------------------------------------------------------

/**
 * Tsunade 104: choose how much chakra to spend (0-N) for POWERUP.
 * Options are "0", "1", ..., "N".
 * Hard AI: spend if winning the mission is close.
 */
function selectTsunade104Chakra(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  // Easy: random amount
  if (difficulty === 'easy') return randomPick(options);

  const maxOption = options.reduce((max, opt) =>
    parseInt(opt, 10) > parseInt(max, 10) ? opt : max, options[0]);
  const maxAmount = parseInt(maxOption, 10);

  if (difficulty === 'medium') {
    // Medium: spend half of available
    const halfAmount = Math.ceil(maxAmount / 2);
    return String(halfAmount);
  }

  // Hard/Impossible: evaluate based on mission power gap
  const missionIndex = pendingEffect.sourceMissionIndex;
  const powerGap = getMissionPowerGap(state, missionIndex, aiPlayer);
  const missionValue = getMissionValue(state, missionIndex);

  if (powerGap >= 3) {
    // Already winning comfortably, spend nothing (save chakra)
    return '0';
  }

  if (powerGap < -5) {
    // Losing badly, don't waste chakra unless mission is very valuable
    if (missionValue >= 6 && maxAmount >= Math.abs(powerGap)) {
      // Spend enough to flip + small buffer
      const needed = Math.abs(powerGap) + 1;
      return String(Math.min(needed, maxAmount));
    }
    return '0';
  }

  // Contested mission: spend enough to secure or flip
  if (powerGap < 0) {
    // Losing: need at least |gap|+1 to win
    const needed = Math.abs(powerGap) + 1;
    return String(Math.min(needed, maxAmount));
  }

  // Slightly ahead (0-2): spend a bit to secure
  const buffer = Math.min(2, maxAmount);
  return String(buffer);
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
