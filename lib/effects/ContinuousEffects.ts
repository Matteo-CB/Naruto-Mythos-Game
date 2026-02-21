import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';

/**
 * Centralized continuous effect [⧗] logic.
 *
 * Consolidates all continuous effect calculations that were previously
 * scattered across StartPhase.ts, PowerCalculation.ts, and EndPhase.ts.
 */

// ---------------------
// Chakra Bonus
// ---------------------

/**
 * Calculate the CHAKRA +X bonus provided by a single character's continuous effects.
 *
 * Called per character during the Start Phase to determine extra chakra income.
 * Only applies to face-visible characters (hidden characters are skipped by the caller).
 */
export function calculateContinuousChakraBonus(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  char: CharacterInPlay,
): number {
  if (char.isHidden) return 0;

  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  let bonus = 0;

  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

  for (const effect of topCard.effects ?? []) {
    if (effect.type !== 'MAIN') continue;
    if (!effect.description.includes('[⧗]')) continue;

    // Kiba 025: If Akamaru is in the same mission, CHAKRA +1
    if (topCard.id === '025/130' || topCard.number === 25) {
      const hasAkamaru = friendlyChars.some(
        (c) => !c.isHidden && c.card.name_fr.toUpperCase() === 'AKAMARU',
      );
      if (hasAkamaru) bonus += 1;
    }

    // Anko 044: If another friendly Leaf Village in this mission, CHAKRA +1
    if (topCard.id === '044/130' || topCard.number === 44) {
      const hasOtherLeaf = friendlyChars.some(
        (c) =>
          c.instanceId !== char.instanceId &&
          !c.isHidden &&
          c.card.group === 'Leaf Village',
      );
      if (hasOtherLeaf) bonus += 1;
    }

    // Tayuya 064: CHAKRA +X, X = missions with friendly Sound Four
    if (topCard.id === '064/130' || topCard.number === 64) {
      const soundFourMissions = countMissionsWithKeyword(state, player, 'Sound Four');
      bonus += soundFourMissions;
    }

    // Kankuro 077: If non-hidden enemy in this mission, CHAKRA +1
    if (topCard.id === '077/130' || topCard.number === 77) {
      const hasNonHiddenEnemy = enemyChars.some((c) => !c.isHidden);
      if (hasNonHiddenEnemy) bonus += 1;
    }

    // Shizune 005: Unconditional CHAKRA +1
    if (topCard.id === '005/130' || topCard.number === 5) {
      if (effect.description.includes('CHAKRA +1')) {
        bonus += 1;
      }
    }

    // Sakura 012 (UC): Unconditional CHAKRA +1
    if (topCard.id === '012/130' || topCard.number === 12) {
      if (effect.description.includes('CHAKRA +1')) {
        bonus += 1;
      }
    }
  }

  return bonus;
}

/**
 * Count missions where a player has at least one character with a given keyword.
 */
function countMissionsWithKeyword(state: GameState, player: PlayerID, keyword: string): number {
  let count = 0;
  for (const mission of state.activeMissions) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    const hasKeyword = chars.some(
      (c) => (c.card.keywords ?? []).includes(keyword) && c.controlledBy === player,
    );
    if (hasKeyword) count++;
  }
  return count;
}

// ---------------------
// Power Modifier
// ---------------------

/**
 * Calculate the continuous power modifier for a single character.
 *
 * Accounts for buffs/debuffs from friendly characters in the same mission
 * (e.g., Kakashi 015, Gai 042) and self-modifiers (e.g., Sasuke 013,
 * Temari 079, Yashamaru 084, Ton Ton 101).
 */
export function calculateContinuousPowerModifier(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  char: CharacterInPlay,
): number {
  if (char.isHidden) return 0;

  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  let modifier = 0;

  // Check all friendly characters in the same mission for continuous power effects on others
  for (const friendly of friendlyChars) {
    if (friendly.isHidden) continue;
    if (friendly.instanceId === char.instanceId) continue; // Skip self for "other" effects

    const topCard = friendly.stack.length > 0 ? friendly.stack[friendly.stack.length - 1] : friendly.card;

    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      // Kakashi 015: Other Team 7 characters +1 Power
      if (topCard.number === 15 && effect.description.includes('Other Team 7')) {
        if ((char.card.keywords ?? []).includes('Team 7')) {
          modifier += 1;
        }
      }

      // Gai 042: Other Team Guy characters +1 Power
      if (topCard.number === 42 && effect.description.includes('Other Team Guy')) {
        if ((char.card.keywords ?? []).includes('Team Guy')) {
          modifier += 1;
        }
      }
    }
  }

  // Check self-modifiers
  const selfTopCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  for (const effect of selfTopCard.effects ?? []) {
    if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

    // Sasuke 013: -1 Power per other non-hidden friendly in this mission
    if (selfTopCard.number === 13 && effect.description.includes('-1 Power for every other')) {
      const otherNonHidden = friendlyChars.filter(
        (c) => c.instanceId !== char.instanceId && !c.isHidden,
      );
      modifier -= otherNonHidden.length;
    }

    // Temari 079: +2 Power if you have the Edge
    if (selfTopCard.number === 79 && effect.description.includes('Edge')) {
      if (state.edgeHolder === player) {
        modifier += 2;
      }
    }

    // Yashamaru 084: +2 Power if friendly Gaara in this mission
    if (selfTopCard.number === 84 && effect.description.includes('Gaara')) {
      const hasGaara = friendlyChars.some(
        (c) => c.instanceId !== char.instanceId && !c.isHidden && c.card.name_fr.toUpperCase() === 'GAARA',
      );
      if (hasGaara) modifier += 2;
    }

    // Ton Ton 101: +1 Power if Tsunade or Shizune in this mission
    if (selfTopCard.number === 101 && (effect.description.includes('Tsunade') || effect.description.includes('Shizune'))) {
      const hasTsunadeOrShizune = friendlyChars.some(
        (c) =>
          c.instanceId !== char.instanceId &&
          !c.isHidden &&
          (c.card.name_fr.toUpperCase() === 'TSUNADE' || c.card.name_fr.toUpperCase() === 'SHIZUNE'),
      );
      if (hasTsunadeOrShizune) modifier += 1;
    }
  }

  return modifier;
}

// ---------------------
// Power Token Retention
// ---------------------

/**
 * Determine whether a character should retain its power tokens at end of round.
 *
 * Rock Lee 039 and Gai Maito 043 both have continuous effects that prevent power token removal.
 */
export function shouldRetainPowerTokens(char: CharacterInPlay): boolean {
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

  // Rock Lee 039 / Gai Maito 043: doesn't lose power tokens if face-visible
  if ((topCard.number === 39 || topCard.number === 43) && !char.isHidden) {
    const hasRetention = (topCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('doesn\'t lose Power tokens'),
    );
    if (hasRetention) {
      return true;
    }
  }

  return false;
}
