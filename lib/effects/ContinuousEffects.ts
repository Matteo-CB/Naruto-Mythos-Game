import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';
import { logAction } from '../engine/utils/gameLog';

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

    // Kiba 025: If Akamaru is in the same mission (friendly or enemy), CHAKRA +1
    if (topCard.id === 'KS-025-C' || topCard.number === 25) {
      const allMissionChars = [...friendlyChars, ...enemyChars];
      const hasAkamaru = allMissionChars.some(
        (c) => {
          if (c.isHidden) return false;
          const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          return cTop.name_fr.toUpperCase() === 'AKAMARU';
        },
      );
      if (hasAkamaru) bonus += 1;
    }

    // Anko 044: If another friendly Leaf Village in this mission, CHAKRA +1
    if (topCard.id === 'KS-044-C' || topCard.number === 44) {
      const hasOtherLeaf = friendlyChars.some(
        (c) => {
          if (c.instanceId === char.instanceId || c.isHidden) return false;
          const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          return cTop.group === 'Leaf Village';
        },
      );
      if (hasOtherLeaf) bonus += 1;
    }

    // Tayuya 064: CHAKRA +X, X = missions with friendly Sound Four
    if (topCard.id === 'KS-064-C' || topCard.number === 64) {
      const soundFourMissions = countMissionsWithKeyword(state, player, 'Sound Four', char.instanceId);
      bonus += soundFourMissions;
    }

    // Kankuro 077: If non-hidden enemy in this mission, CHAKRA +1
    if (topCard.id === 'KS-077-C' || topCard.number === 77) {
      const hasNonHiddenEnemy = enemyChars.some((c) => !c.isHidden);
      if (hasNonHiddenEnemy) bonus += 1;
    }

    // Shizune 005: Unconditional CHAKRA +1
    if (topCard.id === 'KS-005-C' || topCard.number === 5) {
      if (effect.description.toLowerCase().includes('chakra') && effect.description.includes('+')) {
        bonus += 1;
      }
    }

    // Sakura 012 (UC): Unconditional CHAKRA +1
    if (topCard.id === 'KS-012-UC' || topCard.number === 12) {
      if (effect.description.toLowerCase().includes('chakra') && effect.description.includes('+')) {
        bonus += 1;
      }
    }

    // Sakura 147 (M): If you don't have the Edge, CHAKRA +2
    if (topCard.number === 147 && effect.description.includes('CHAKRA +2') && effect.description.includes('Edge')) {
      if (state.edgeHolder !== player) {
        bonus += 2;
      }
    }
  }

  return bonus;
}

/**
 * Calculate CHAKRA bonus from mission continuous [⧗] effects.
 * Called once per player per Start Phase (not per character).
 *
 * MSS-10 "Chakra Training": CHAKRA +1 for both players, active as soon as the mission is revealed.
 */
export function calculateMissionChakraBonus(state: GameState, player: PlayerID): number {
  let bonus = 0;

  for (const mission of state.activeMissions) {
    for (const effect of mission.card.effects ?? []) {
      if (!effect.description.includes('[⧗]')) continue;

      // MSS-10: CHAKRA +1 for both players - applies immediately when mission is in play (MAIN type)
      if (effect.type === 'MAIN'
          && effect.description.includes('CHAKRA +1')
          && effect.description.includes('both players')) {
        bonus += 1;
      }
    }
  }

  return bonus;
}

/**
 * Count missions where a player has at least one character with a given keyword.
 */
function countMissionsWithKeyword(state: GameState, player: PlayerID, keyword: string, excludeInstanceId?: string): number {
  let count = 0;
  for (const mission of state.activeMissions) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    const hasKeyword = chars.some(
      (c) => {
        if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
        if (c.isHidden) return false; // Hidden chars are anonymous - can't identify keyword
        const top = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return (top.keywords ?? []).includes(keyword) && c.controlledBy === player;
      },
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
  // Hidden characters normally have 0 power, but Kurenai 035 gives them +2
  if (char.isHidden) {
    const mission = state.activeMissions[missionIndex];
    if (!mission) return 0;
    const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    let hiddenBonus = 0;
    for (const friendly of friendlyChars) {
      if (friendly.isHidden || friendly.instanceId === char.instanceId) continue;
      const fTop = friendly.stack.length > 0 ? friendly.stack[friendly.stack.length - 1] : friendly.card;
      // Kurenai 035 (UC): Hidden friendly characters in this mission have +2 Power
      if (fTop.number === 35) {
        const hasEffect = (fTop.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('+2 Power'),
        );
        if (hasEffect) hiddenBonus += 2;
      }

      // Naruto 145 (M): If Edge holder, hidden friendlies in this mission have +1 Power
      if (fTop.number === 145) {
        const hasEffect = (fTop.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('+1 Power'),
        );
        if (hasEffect && state.edgeHolder === player) hiddenBonus += 1;
      }
    }

    // Apply -1 Power debuffs from enemy continuous effects (Itachi 128, Sakon 127) to hidden chars too
    const enemyCharsHidden = player === 'player1' ? mission.player2Characters : mission.player1Characters;
    for (const enemy of enemyCharsHidden) {
      if (enemy.isHidden) continue;
      const eTop = enemy.stack.length > 0 ? enemy.stack[enemy.stack.length - 1] : enemy.card;
      for (const effect of eTop.effects ?? []) {
        if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;
        // Itachi 128 / 152: Every enemy in this mission has -1 Power
        if (eTop.number === 128 || eTop.number === 152) {
          hiddenBonus -= 1;
        }
        // Sakon 127: Each enemy character in this mission has -1 Power
        if (eTop.number === 127 && effect.description.includes('-1 Power')) {
          hiddenBonus -= 1;
        }
      }
    }

    return hiddenBonus;
  }

  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  let modifier = 0;

  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

  // Check all characters (both sides) in the same mission for continuous power effects on others
  const allMissionChars = [...friendlyChars, ...enemyChars];
  for (const otherChar of allMissionChars) {
    if (otherChar.isHidden) continue;
    if (otherChar.instanceId === char.instanceId) continue; // Skip self for "other" effects

    const topCard = otherChar.stack.length > 0 ? otherChar.stack[otherChar.stack.length - 1] : otherChar.card;

    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      // Kakashi 015: Other Team 7 characters +1 Power
      if (topCard.number === 15 && effect.description.includes('Other Team 7')) {
        const charTop = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if ((charTop.keywords ?? []).includes('Team 7')) {
          modifier += 1;
        }
      }

      // Gai 042: Other Team Guy characters +1 Power
      if (topCard.number === 42 && effect.description.includes('Other Team Guy')) {
        const charTop = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if ((charTop.keywords ?? []).includes('Team Guy')) {
          modifier += 1;
        }
      }
    }
  }

  // Check ENEMY characters for continuous power debuffs on this character
  for (const enemy of enemyChars) {
    if (enemy.isHidden) continue;
    const enemyTopCard = enemy.stack.length > 0 ? enemy.stack[enemy.stack.length - 1] : enemy.card;

    for (const effect of enemyTopCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      // Itachi 128 (R) / 152 (M): Every enemy in this mission has -1 Power
      if (enemyTopCard.number === 128 || enemyTopCard.number === 152) {
        modifier -= 1;
      }

      // Sakon 127 (R/RA): Each enemy character in this mission has -1 Power
      if (enemyTopCard.number === 127 && effect.description.includes('-1 Power')) {
        modifier -= 1;
      }

      // Rempart 067 (UC): The strongest non-hidden enemy character has Power = 0
      // We handle this below as a special case since it only affects the strongest
    }
  }

  // Rempart 067 special case: if enemy has Rempart in this mission, and this char
  // is the strongest non-hidden character on our side, it loses all Power tokens
  // and has effective Power = 0. Track via flag so mission effects (MSS-09) also
  // see this character as having 0 power.
  let rempartZeroed = false;
  for (const enemy of enemyChars) {
    if (enemy.isHidden) continue;
    const enemyTopCard = enemy.stack.length > 0 ? enemy.stack[enemy.stack.length - 1] : enemy.card;
    if (enemyTopCard.number === 67) {
      const hasRempartEffect = (enemyTopCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
      );
      if (hasRempartEffect) {
        // Find the strongest non-hidden friendly character
        let maxPower = -1;
        let strongestId = '';
        for (const f of friendlyChars) {
          if (f.isHidden) continue;
          const fTop = f.stack.length > 0 ? f.stack[f.stack.length - 1] : f.card;
          const basePower = (fTop.power ?? 0) + f.powerTokens;
          if (basePower > maxPower) {
            maxPower = basePower;
            strongestId = f.instanceId;
          }
        }
        // If this character is the strongest, reduce to 0 (loses all tokens + power)
        if (strongestId === char.instanceId && maxPower > 0) {
          const selfTop = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
          modifier -= (selfTop.power ?? 0) + char.powerTokens;
          rempartZeroed = true;
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
        (c) => {
          if (c.instanceId === char.instanceId || c.isHidden) return false;
          const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          return cTop.name_fr.toUpperCase() === 'GAARA';
        },
      );
      if (hasGaara) modifier += 2;
    }

    // Ton Ton 101: +1 Power if Tsunade or Shizune in this mission
    if (selfTopCard.number === 101 && (effect.description.includes('Tsunade') || effect.description.includes('Shizune'))) {
      const hasTsunadeOrShizune = friendlyChars.some(
        (c) => {
          if (c.instanceId === char.instanceId || c.isHidden) return false;
          const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          return cTop.name_fr.toUpperCase() === 'TSUNADE' || cTop.name_fr.toUpperCase() === 'SHIZUNE';
        },
      );
      if (hasTsunadeOrShizune) modifier += 1;
    }
  }

  // -------------------------------------------------------
  // Mission [⧗] effects that modify power continuously (MAIN type).
  // Active as soon as the mission is in play - no wonBy guard.
  // -------------------------------------------------------
  for (const mEffect of mission.card.effects ?? []) {
    if (mEffect.type !== 'MAIN' || !mEffect.description.includes('[⧗]')) continue;

    // MSS-02 "Examen Chunin": All non-hidden characters in this mission have +1 Power
    if (mEffect.description.includes('All non-hidden characters') && mEffect.description.includes('+1 Power')) {
      modifier += 1;
    }

    // MSS-09 "Proteger le chef": Characters with 4 Power or more in this mission have +1 Power
    // Use base power + tokens only (NOT accumulated modifier) for the threshold check.
    // Exception: if Rempart zeroed this character (loses all tokens + power = 0),
    // it no longer qualifies for the >= 4 threshold.
    if (mEffect.description.includes('4 Power or more') && mEffect.description.includes('+1 Power')) {
      if (!rempartZeroed) {
        const selfTop = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        const basePlusTok = (selfTop.power ?? 0) + char.powerTokens;
        if (basePlusTok >= 4) {
          modifier += 1;
        }
      }
    }
  }

  return modifier;
}

// ---------------------
// Rempart 067 Power Zeroing
// ---------------------

/**
 * Check if a character is the strongest enemy being zeroed by Rempart 067.
 * Used by getVisibleState to show power tokens as removed in the UI.
 */
export function isRempartZeroed(
  state: GameState,
  missionIndex: number,
  char: CharacterInPlay,
  player: PlayerID,
): boolean {
  if (char.isHidden) return false;
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

  for (const enemy of enemyChars) {
    if (enemy.isHidden) continue;
    const enemyTopCard = enemy.stack.length > 0 ? enemy.stack[enemy.stack.length - 1] : enemy.card;
    if (enemyTopCard.number === 67) {
      const hasRempartEffect = (enemyTopCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
      );
      if (hasRempartEffect) {
        let maxPower = -1;
        let strongestId = '';
        for (const f of friendlyChars) {
          if (f.isHidden) continue;
          const fTop = f.stack.length > 0 ? f.stack[f.stack.length - 1] : f.card;
          const basePower = (fTop.power ?? 0) + f.powerTokens;
          if (basePower > maxPower) {
            maxPower = basePower;
            strongestId = f.instanceId;
          }
        }
        if (strongestId === char.instanceId && maxPower > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

// ---------------------
// Power Token Retention
// ---------------------

/**
 * Determine whether a character should retain its power tokens at end of round.
 *
 * Rock Lee 039 and Gai Maito 043 both have continuous effects that prevent power token removal.
 * Hidden characters do NOT have their [⧗] effects active, so they always lose tokens.
 */
export function shouldRetainPowerTokens(char: CharacterInPlay): boolean {
  // [⧗] effects are only active when face-visible
  if (char.isHidden) return false;

  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

  // Rock Lee 039 / Gai Maito 043: doesn't lose power tokens (only when face-visible)
  if (topCard.number === 39 || topCard.number === 43) {
    const hasRetention = (topCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('doesn\'t lose Power tokens'),
    );
    if (hasRetention) {
      return true;
    }
  }

  return false;
}

// ---------------------
// Hide Protection
// ---------------------

/**
 * Returns true if a friendly character in the target's mission prevents hiding by enemy effects.
 *
 * Shino Aburame 115 (R/RA): [⧗] Friendly characters in this mission cannot be hidden by enemy effects.
 *
 * @param state       Current game state
 * @param targetChar  The character that an enemy effect is trying to hide
 * @param owner       The player who owns the targetChar
 */
export function isProtectedFromEnemyHide(
  state: GameState,
  targetChar: CharacterInPlay,
  owner: PlayerID,
): boolean {
  const mission = state.activeMissions[targetChar.missionIndex];
  if (!mission) return false;

  const friendlySide: 'player1Characters' | 'player2Characters' =
    owner === 'player1' ? 'player1Characters' : 'player2Characters';

  for (const char of mission[friendlySide]) {
    if (char.isHidden) continue;
    if (char.instanceId === targetChar.instanceId) continue; // A character is not friendly to itself
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

    // Shino 115 (R/RA): protects all allies in this mission from being hidden by enemy effects
    if (topCard.number === 115) {
      const hasProtection = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('cannot be hidden by enemy effects'),
      );
      if (hasProtection) return true;
    }
  }

  return false;
}

// ---------------------
// Hide Immunity (Self)
// ---------------------

/**
 * Returns true if a character is immune to being hidden by enemy effects.
 *
 * Cards with "[⧗] Can't be hidden or defeated by enemy effects":
 * - Ichibi 076 (UC), Ichibi 130 (R/RA), Kyubi 129 (R/RA), Kyubi 134 (S)
 *
 * Uses text-based matching on effects for robustness.
 */
export function isImmuneToEnemyHideOrDefeat(char: CharacterInPlay): boolean {
  if (char.isHidden) return false;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return (topCard.effects ?? []).some(
    (e) =>
      e.type === 'MAIN' &&
      e.description.includes('[⧗]') &&
      e.description.includes("Can't be hidden or defeated by enemy effects"),
  );
}

/**
 * Returns true if a character can be hidden by an enemy effect.
 * Checks self-immunity AND mission-level protection (Shino 115).
 *
 * Use this in handlers to filter valid targets BEFORE presenting them
 * to the player. Does NOT check Gemma 049 sacrifice (that creates a
 * pending choice and cannot be pre-filtered).
 */
export function canBeHiddenByEnemy(
  state: GameState,
  char: CharacterInPlay,
  charOwner: PlayerID,
): boolean {
  if (char.isHidden) return false;
  if (isImmuneToEnemyHideOrDefeat(char)) return false;
  if (isProtectedFromEnemyHide(state, char, charOwner)) return false;
  return true;
}

/**
 * Check if Kurenai 035's continuous effect blocks an ENEMY character from moving
 * out of a given mission. Returns true if movement is blocked.
 *
 * Kurenai 035 (UC) MAIN [⧗]: "Enemy characters cannot move from this mission."
 * Only blocks characters that are enemies relative to Kurenai's controller.
 * @param movedCharOwner - The owner/controller of the character being moved (NOT the effect initiator)
 */
export function isMovementBlockedByKurenai(
  state: GameState,
  sourceMissionIndex: number,
  movedCharOwner: PlayerID,
): boolean {
  const sourceMission = state.activeMissions[sourceMissionIndex];
  if (!sourceMission) return false;
  const allChars = [...sourceMission.player1Characters, ...sourceMission.player2Characters];
  for (const ch of allChars) {
    if (ch.isHidden) continue;
    const chTop = ch.stack.length > 0 ? ch.stack[ch.stack.length - 1] : ch.card;
    if (chTop.number === 35) {
      const hasRestriction = (chTop.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
          (e.description.includes('cannot move') || e.description.includes("can't be moved")),
      );
      if (hasRestriction) {
        const kurenaiOwner = sourceMission.player1Characters.some(c => c.instanceId === ch.instanceId)
          ? 'player1' : 'player2';
        if (movedCharOwner !== kurenaiOwner) return true;
      }
    }
  }
  return false;
}

// ---------------------
// On-Play Reactions
// ---------------------

/**
 * Trigger continuous on-play reactions from opponent's characters.
 * Called when a player plays a non-hidden character on a mission.
 *
 * - Neji 037 (UC): POWERUP 1 when a non-hidden enemy character is played in this mission
 * - Hinata 031 (UC): Gain 1 Chakra when a non-hidden enemy character is played in this mission
 */
export function triggerOnPlayReactions(state: GameState, playingPlayer: PlayerID, missionIndex: number): GameState {
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
          `Neji Hyuga (037): POWERUP 1 - enemy played a non-hidden character in this mission.`,
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
          `Hinata Hyuga (031): Gained 1 Chakra - enemy played a non-hidden character in this mission.`,
          'game.log.effect.hinata031',
          { card: 'HINATA HYUGA', id: 'KS-031-UC' },
        );
      }
    }
  }

  return newState;
}
