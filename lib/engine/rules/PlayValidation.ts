import type { GameState, PlayerID, CharacterCard } from '../types';
import { HIDDEN_PLAY_COST } from '../types';
import { calculateEffectiveCost } from './ChakraValidation';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate playing a character face-visible on a mission.
 */
export function validatePlayCharacter(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
  effectiveCost: number,
): ValidationResult {
  // Mission must exist
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return { valid: false, reason: 'Invalid mission index.' };
  }

  // Must have enough chakra
  const ps = state[player];
  if (ps.chakra < effectiveCost) {
    return { valid: false, reason: `Not enough chakra. Need ${effectiveCost}, have ${ps.chakra}.` };
  }

  // Name uniqueness: no other character with the same name by this player on this mission
  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const sameName = chars.some((c) => {
    // Hidden characters' names aren't checked for uniqueness until revealed
    // But face-visible characters are checked
    if (!c.isHidden) {
      return c.card.name_fr.toUpperCase() === card.name_fr.toUpperCase();
    }
    return false;
  });

  if (sameName) {
    return { valid: false, reason: `Already have a ${card.name_fr} on this mission.` };
  }

  // Tenten 040 special: can only play in mission where currently winning
  if (card.number === 40) {
    const hasTentenRestriction = card.effects.some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('currently winning'),
    );
    if (hasTentenRestriction) {
      if (!isWinningMission(state, player, missionIndex)) {
        return { valid: false, reason: 'Tenten can only be played on a mission where you are currently winning.' };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate playing a character face-down (hidden).
 */
export function validatePlayHidden(
  state: GameState,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
): ValidationResult {
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return { valid: false, reason: 'Invalid mission index.' };
  }

  const ps = state[player];
  if (ps.chakra < HIDDEN_PLAY_COST) {
    return { valid: false, reason: `Not enough chakra to play hidden (need ${HIDDEN_PLAY_COST}).` };
  }

  // Hidden characters can coexist with same name until revealed
  // No name uniqueness check for hidden play

  return { valid: true };
}

/**
 * Validate revealing a hidden character.
 */
export function validateRevealCharacter(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  characterInstanceId: string,
): ValidationResult {
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return { valid: false, reason: 'Invalid mission index.' };
  }

  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const char = chars.find((c) => c.instanceId === characterInstanceId);

  if (!char) {
    return { valid: false, reason: 'Character not found.' };
  }

  if (!char.isHidden) {
    return { valid: false, reason: 'Character is already face-up.' };
  }

  if (char.controlledBy !== player) {
    return { valid: false, reason: 'Cannot reveal opponent\'s character.' };
  }

  // Check chakra cost
  const effectiveCost = calculateEffectiveCost(state, player, char.card, missionIndex, true);
  const ps = state[player];
  if (ps.chakra < effectiveCost) {
    return { valid: false, reason: `Not enough chakra. Need ${effectiveCost}, have ${ps.chakra}.` };
  }

  // Name uniqueness check after reveal
  const sameName = chars.some((c) => {
    if (c.instanceId === characterInstanceId) return false;
    if (!c.isHidden) {
      return c.card.name_fr.toUpperCase() === char.card.name_fr.toUpperCase();
    }
    return false;
  });

  if (sameName) {
    return { valid: false, reason: `Already have a visible ${char.card.name_fr} on this mission.` };
  }

  return { valid: true };
}

/**
 * Validate upgrading a character.
 */
export function validateUpgradeCharacter(
  state: GameState,
  player: PlayerID,
  newCard: CharacterCard,
  missionIndex: number,
  targetInstanceId: string,
): ValidationResult {
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) {
    return { valid: false, reason: 'Invalid mission index.' };
  }

  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const target = chars.find((c) => c.instanceId === targetInstanceId);

  if (!target) {
    return { valid: false, reason: 'Target character not found.' };
  }

  if (target.controlledBy !== player) {
    return { valid: false, reason: 'Cannot upgrade opponent\'s character.' };
  }

  // Must be same name
  const topCard = target.stack.length > 0 ? target.stack[target.stack.length - 1] : target.card;
  if (newCard.name_fr.toUpperCase() !== topCard.name_fr.toUpperCase()) {
    return { valid: false, reason: 'Upgrade must be same character name.' };
  }

  // Must have strictly higher cost
  if (newCard.chakra <= topCard.chakra) {
    return { valid: false, reason: `Upgrade must have strictly higher chakra cost. New: ${newCard.chakra}, Current: ${topCard.chakra}.` };
  }

  // Pay only the difference
  const costDiff = newCard.chakra - topCard.chakra;
  const ps = state[player];
  if (ps.chakra < costDiff) {
    return { valid: false, reason: `Not enough chakra. Need ${costDiff} (difference), have ${ps.chakra}.` };
  }

  return { valid: true };
}

/**
 * Check if a player is currently winning a mission (for Tenten restriction).
 */
function isWinningMission(state: GameState, player: PlayerID, missionIndex: number): boolean {
  const mission = state.activeMissions[missionIndex];
  const p1Chars = mission.player1Characters;
  const p2Chars = mission.player2Characters;

  let p1Power = 0;
  let p2Power = 0;

  for (const c of p1Chars) {
    if (!c.isHidden) p1Power += c.card.power + c.powerTokens;
  }
  for (const c of p2Chars) {
    if (!c.isHidden) p2Power += c.card.power + c.powerTokens;
  }

  if (player === 'player1') {
    if (p1Power > p2Power) return true;
    if (p1Power === p2Power && state.edgeHolder === 'player1') return true;
    return false;
  } else {
    if (p2Power > p1Power) return true;
    if (p1Power === p2Power && state.edgeHolder === 'player2') return true;
    return false;
  }
}
