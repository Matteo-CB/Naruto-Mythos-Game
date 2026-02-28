import type { GameState, PlayerID, CharacterCard } from '../types';
import { HIDDEN_PLAY_COST } from '../types';
import { calculateEffectiveCost } from './ChakraValidation';
import { calculateCharacterPower } from '../phases/PowerCalculation';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  reasonKey?: string;
  reasonParams?: Record<string, string | number>;
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
    return { valid: false, reason: 'Invalid mission index.', reasonKey: 'game.error.invalidMission' };
  }

  // Must have enough chakra
  const ps = state[player];
  if (ps.chakra < effectiveCost) {
    return { valid: false, reason: `Not enough chakra. Need ${effectiveCost}, have ${ps.chakra}.`, reasonKey: 'game.error.notEnoughChakra', reasonParams: { need: effectiveCost, have: ps.chakra } };
  }

  // Name uniqueness: no other character with the same name by this player on this mission
  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const sameName = chars.some((c) => {
    // Hidden characters' names aren't checked for uniqueness until revealed
    // But face-visible characters are checked
    if (!c.isHidden) {
      const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
    }
    return false;
  });

  if (sameName) {
    return { valid: false, reason: `Already have a ${card.name_fr} on this mission.`, reasonKey: 'game.error.duplicateName', reasonParams: { name: card.name_fr } };
  }

  // Tenten 040 special: can only play in mission where currently winning
  if (card.number === 40) {
    const hasTentenRestriction = (card.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('currently winning'),
    );
    if (hasTentenRestriction) {
      if (!isWinningMission(state, player, missionIndex)) {
        return { valid: false, reason: 'Tenten can only be played on a mission where you are currently winning.', reasonKey: 'game.error.tentenRestriction' };
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
    return { valid: false, reason: 'Invalid mission index.', reasonKey: 'game.error.invalidMission' };
  }

  const ps = state[player];
  if (ps.chakra < HIDDEN_PLAY_COST) {
    return { valid: false, reason: `Not enough chakra to play hidden (need ${HIDDEN_PLAY_COST}).`, reasonKey: 'game.error.notEnoughChakraHidden', reasonParams: { need: HIDDEN_PLAY_COST } };
  }

  // Shikamaru 111 (R): Opponent cannot play characters hidden in this mission
  const opponent = player === 'player1' ? 'player2' : 'player1';
  const mission = state.activeMissions[missionIndex];
  const opponentChars = opponent === 'player1' ? mission.player1Characters : mission.player2Characters;
  for (const c of opponentChars) {
    if (c.isHidden) continue;
    const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    if (topCard.number === 111 || topCard.number === 150) {
      const hasRestriction = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('cannot play characters while hidden'),
      );
      if (hasRestriction) {
        return { valid: false, reason: 'Shikamaru Nara blocks playing characters hidden in this mission.', reasonKey: 'game.error.shikamaruBlock' };
      }
    }
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
    return { valid: false, reason: 'Invalid mission index.', reasonKey: 'game.error.invalidMission' };
  }

  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const char = chars.find((c) => c.instanceId === characterInstanceId);

  if (!char) {
    return { valid: false, reason: 'Character not found.', reasonKey: 'game.error.characterNotFound' };
  }

  if (!char.isHidden) {
    return { valid: false, reason: 'Character is already face-up.', reasonKey: 'game.error.alreadyFaceUp' };
  }

  if (char.controlledBy !== player) {
    return { valid: false, reason: 'Cannot reveal opponent\'s character.', reasonKey: 'game.error.cannotRevealOpponent' };
  }

  // Use topCard for upgraded hidden characters
  const charTopCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

  // Name uniqueness check — detect reveal-for-upgrade before chakra check
  // Check same-name upgrade target
  const sameNameChar = chars.find((c) => {
    if (c.instanceId === characterInstanceId) return false;
    if (!c.isHidden) {
      const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return cTop.name_fr.toUpperCase() === charTopCard.name_fr.toUpperCase();
    }
    return false;
  });

  // Also check flexible upgrade targets (Orochimaru 138, Akamaru 029, Ichibi 076, etc.)
  const flexibleUpgradeTarget = !sameNameChar ? chars.find((c) => {
    if (c.instanceId === characterInstanceId || c.isHidden) return false;
    const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return checkFlexibleUpgrade(charTopCard, cTop) && charTopCard.chakra > cTop.chakra;
  }) : null;

  const upgradeTarget = sameNameChar ?? flexibleUpgradeTarget;

  let effectiveCost: number;
  if (upgradeTarget) {
    const existingTopCard = upgradeTarget.stack.length > 0
      ? upgradeTarget.stack[upgradeTarget.stack.length - 1]
      : upgradeTarget.card;
    if (charTopCard.chakra > existingTopCard.chakra) {
      // Reveal-for-upgrade: cost is the difference
      effectiveCost = charTopCard.chakra - existingTopCard.chakra;
    } else if (sameNameChar) {
      return { valid: false, reason: `Already have a visible ${charTopCard.name_fr} on this mission.`, reasonKey: 'game.error.duplicateNameReveal', reasonParams: { name: charTopCard.name_fr } };
    } else {
      effectiveCost = calculateEffectiveCost(state, player, charTopCard, missionIndex, true);
    }
  } else {
    effectiveCost = calculateEffectiveCost(state, player, charTopCard, missionIndex, true);
  }

  // Check chakra cost (uses upgrade difference if applicable)
  const ps = state[player];
  if (ps.chakra < effectiveCost) {
    return { valid: false, reason: `Not enough chakra. Need ${effectiveCost}, have ${ps.chakra}.`, reasonKey: 'game.error.notEnoughChakra', reasonParams: { need: effectiveCost, have: ps.chakra } };
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
    return { valid: false, reason: 'Invalid mission index.', reasonKey: 'game.error.invalidMission' };
  }

  const mission = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const target = chars.find((c) => c.instanceId === targetInstanceId);

  if (!target) {
    return { valid: false, reason: 'Target character not found.', reasonKey: 'game.error.targetNotFound' };
  }

  if (target.controlledBy !== player) {
    return { valid: false, reason: 'Cannot upgrade opponent\'s character.', reasonKey: 'game.error.cannotUpgradeOpponent' };
  }

  // Cannot upgrade a hidden character — [⧗] effects require the character to be face-visible
  if (target.isHidden) {
    return { valid: false, reason: 'Cannot upgrade a hidden character.', reasonKey: 'game.error.cannotUpgradeHidden' };
  }

  const topCard = target.stack.length > 0 ? target.stack[target.stack.length - 1] : target.card;

  // Check special upgrade rules
  const isFlexibleUpgrade = checkFlexibleUpgrade(newCard, topCard);

  if (!isFlexibleUpgrade) {
    // Standard upgrade: must be same name
    if (newCard.name_fr.toUpperCase() !== topCard.name_fr.toUpperCase()) {
      return { valid: false, reason: 'Upgrade must be same character name.', reasonKey: 'game.error.upgradeSameName' };
    }
  }

  // Must have strictly higher cost
  if (newCard.chakra <= topCard.chakra) {
    return { valid: false, reason: `Upgrade must have strictly higher chakra cost. New: ${newCard.chakra}, Current: ${topCard.chakra}.`, reasonKey: 'game.error.upgradeHigherCost', reasonParams: { newCost: newCard.chakra, currentCost: topCard.chakra } };
  }

  // Pay only the difference
  const costDiff = newCard.chakra - topCard.chakra;
  const ps = state[player];
  if (ps.chakra < costDiff) {
    return { valid: false, reason: `Not enough chakra. Need ${costDiff} (difference), have ${ps.chakra}.`, reasonKey: 'game.error.notEnoughChakraUpgrade', reasonParams: { need: costDiff, have: ps.chakra } };
  }

  return { valid: true };
}

/**
 * Check if a card has a flexible upgrade rule that allows upgrading over
 * a different-name character.
 *
 * - Orochimaru 051 (UC) / 138 (S): Can upgrade any non-Summon, non-Orochimaru
 * - Akamaru 029 (UC): Can upgrade over Kiba Inuzuka
 * - Ichibi 076 (UC): Can upgrade any Gaara
 * - Ukon 063 (UC) / 124b (R): Can upgrade any Sound Village character
 */
export function checkFlexibleUpgrade(newCard: CharacterCard, targetCard: CharacterCard): boolean {
  // Already same name — standard upgrade, no special rule needed
  if (newCard.name_fr.toUpperCase() === targetCard.name_fr.toUpperCase()) return false;

  // Orochimaru 051/138: Can upgrade over any non-Summon, non-Orochimaru
  if (newCard.number === 51 || newCard.number === 138) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('upgrade'),
    );
    if (hasFlexible) {
      const isSummon = (targetCard.keywords ?? []).includes('Summon');
      const isOrochimaru = targetCard.name_fr.toUpperCase().includes('OROCHIMARU');
      return !isSummon && !isOrochimaru;
    }
  }

  // Akamaru 029 (UC): Can upgrade over Kiba Inuzuka
  if (newCard.number === 29) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('Kiba Inuzuka'),
    );
    if (hasFlexible) {
      return targetCard.name_fr.toUpperCase().includes('KIBA INUZUKA');
    }
  }

  // Ichibi 076 (UC): Can upgrade any Gaara
  if (newCard.number === 76) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
    );
    if (hasFlexible) {
      return targetCard.name_fr.toUpperCase() === 'GAARA';
    }
  }

  // Kyubi 129 (R): Can upgrade over Naruto Uzumaki
  if (newCard.number === 129) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('Naruto Uzumaki'),
    );
    if (hasFlexible) {
      return targetCard.name_fr.toUpperCase().includes('NARUTO');
    }
  }

  // Ukon 063 (UC) / 124b (R): Can upgrade over any Sound Village character
  if (newCard.number === 63 || newCard.number === 124) {
    const hasFlexible = (newCard.effects ?? []).some(
      (e) => e.description.includes('[⧗]') && e.description.toLowerCase().includes('upgrade'),
    );
    if (hasFlexible) {
      return (targetCard.group ?? '') === 'Sound Village';
    }
  }

  return false;
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

  // Use calculateCharacterPower to include continuous modifiers (Kakashi +1, Gai +1, etc.)
  for (const c of p1Chars) {
    p1Power += calculateCharacterPower(state, c, 'player1');
  }
  for (const c of p2Chars) {
    p2Power += calculateCharacterPower(state, c, 'player2');
  }

  // Must have strictly more power to be considered "winning" (ties don't count)
  if (player === 'player1') {
    return p1Power > 0 && p1Power > p2Power;
  } else {
    return p2Power > 0 && p2Power > p1Power;
  }
}
