/**
 * CardTiers - Strategic card value ratings for AI evaluation.
 *
 * Each playable card is rated 1-10 based on its strategic impact.
 * Cards not explicitly listed use a fallback formula based on stats/effects.
 *
 * Also provides synergy detection (upgrade chains, team combos, named pairs).
 */

import type { CharacterCard, GameState, PlayerID, CharacterInPlay } from '../../engine/types';
import { calculateCharacterPower } from '../../engine/phases/PowerCalculation';

// ─── Explicit Card Tier Ratings ──────────────────────────────────────────────

const CARD_TIER: Record<string, number> = {
  // === Tier S (9-10): Game-changing cards ===
  'KS-133-S':   10,  // Naruto Rasengan - hide/defeat 2 enemies (5 or less + 2 or less)
  'KS-133-SV':  10,
  'KS-133-MV':  10,
  'KS-000-L':   10,  // Naruto Legendary - same as 133
  'KS-132-S':    9,  // Jiraiya - play Summon -5 + UPGRADE force opponent to 2 chars
  'KS-136-S':    9,  // Sasuke - 8 power + UPGRADE mutual defeat + chakra on defeat
  'KS-136-SV':   9,
  'KS-137-S':    9,  // Kakashi - hide upgraded char + UPGRADE move self
  'KS-137-SV':   9,
  'KS-138-S':    9,  // Orochimaru - upgrade over ANY non-Summon + 2 mission pts if target ≥6 power
  'KS-140-S':    9,  // Itachi Tsukuyomi - discard+redraw opponent hand + UPGRADE defeat cost X
  'KS-130-RA':   9,  // Ichibi RA - 10 power, can't be hidden/defeated + UPGRADE defeat all hidden in mission
  'KS-076-UC':   9,  // Ichibi - 9 power, upgrade over Gaara, can't be hidden/defeated
  'KS-120-R':    9,  // Gaara R - mass defeat power ≤1 across ALL missions
  'KS-120-RA':   9,
  'KS-120-MV':   9,

  // === Tier A (7-8): Very strong cards ===
  'KS-143-M':    8,  // Itachi M - move friendly here + AMBUSH move enemy here
  'KS-144-M':    8,  // Kisame M - steal 1 chakra
  'KS-135-S':    8,  // Sakura S - top 3 deck, play one anywhere (UPGRADE: -4 cost)
  'KS-131-S':    8,  // Tsunade S - POWERUP 1 every friendly Leaf Village in play
  'KS-131-SV':   8,
  'KS-139-S':    8,  // Gaara S - defeat enemy cost < hidden count + hide another
  'KS-123-R':    8,  // Kimimaro R - 8 power, UPGRADE defeat cost ≤5
  'KS-123-RA':   8,
  'KS-128-R':    8,  // Itachi R - all enemies -1 power + UPGRADE move friendly
  'KS-128-RA':   8,
  'KS-128-MV':   8,
  'KS-093-UC':   8,  // Kisame UC - 6 power + steal all power tokens
  'KS-108-R':    7,  // Naruto R - hide power ≤3 + UPGRADE POWERUP X
  'KS-108-RA':   7,
  'KS-108-MV':   7,
  'KS-050-C':    7,  // Orochimaru - AMBUSH steal enemy cost ≤3
  'KS-087-UC':   7,  // Zabuza UC - hide/defeat lone enemy
  'KS-113-R':    7,  // Kiba R - 6 power + hide/defeat Akamaru + another
  'KS-113-RA':   7,
  'KS-113-MV':   7,
  'KS-116-R':    7,  // Neji R - defeat exact power 4 + UPGRADE defeat exact power 6
  'KS-116-RA':   7,
  'KS-107-R':    7,  // Sasuke R - 6 power + UPGRADE POWERUP X moved chars
  'KS-107-RA':   7,
  'KS-105-R':    7,  // Jiraiya R - Summon -3 + UPGRADE move enemy from mission
  'KS-105-RA':   7,
  'KS-126-RA':   7,  // Orochimaru RA - 7 power + SCORE defeat weakest enemy + UPGRADE POWERUP 3
  'KS-104-R':    7,  // Tsunade R - 6 power + POWERUP X (spend X additional chakra)
  'KS-104-RA':   7,
  'KS-104-MV':   7,
  'KS-148-M':    7,  // Kakashi M - gain Edge + AMBUSH copy Team 7 effect
  'KS-145-M':    7,  // Naruto M - hidden chars +1 power with Edge

  // === Tier B+ (6): Strong cards ===
  'KS-039-UC':   6,  // Rock Lee UC - keeps power tokens + UPGRADE POWERUP 2
  'KS-043-UC':   6,  // Gai UC - keeps power tokens + UPGRADE POWERUP 3
  'KS-118-R':    6,  // Tenten R - AMBUSH defeat hidden + chain defeat if power ≤3
  'KS-118-RA':   6,
  'KS-119-R':    6,  // Kankuro R - defeat power ≤3 + UPGRADE move any
  'KS-119-RA':   6,
  'KS-114-R':    6,  // Hinata R - POWERUP 2 self + POWERUP 1 other + UPGRADE remove all tokens
  'KS-114-RA':   6,
  'KS-111-R':    6,  // Shikamaru R - block hidden plays + UPGRADE hide power ≤3
  'KS-111-RA':   6,
  'KS-109-R':    6,  // Sakura R - play from discard (UPGRADE: -2 cost)
  'KS-109-RA':   6,
  'KS-110-R':    6,  // Ino R - move weakest enemy + UPGRADE hide after move
  'KS-110-RA':   6,
  'KS-106-R':    6,  // Kakashi R - discard top of upgrade + UPGRADE copy effect
  'KS-106-RA':   6,
  'KS-051-UC':   6,  // Orochimaru UC - 5 power + auto-move on loss + UPGRADE defeat hidden
  'KS-054-UC':   6,  // Kabuto UC - 5 power + hide all weaker enemies
  'KS-056-UC':   6,  // Kimimaro UC - 6 power + opponent pays 1 per effect
  'KS-063-UC':   6,  // Ukon - 6 power + upgrade over any cost ≤4
  'KS-069-UC':   6,  // Dosu UC - force opponent reveal or die
  'KS-125-R':    6,  // Tayuya R - enemies cost +1 + UPGRADE play Sound -2
  'KS-125-RA':   6,
  'KS-091-UC':   6,  // Itachi UC - see opponent hand + UPGRADE discard 1
  'KS-117-R':    6,  // Rock Lee R - must move end of round + UPGRADE POWERUP X
  'KS-117-RA':   6,
  'KS-112-R':    6,  // Choji R - discard for POWERUP X (cost of discarded) + repeat on UPGRADE
  'KS-112-RA':   6,
  'KS-121-R':    6,  // Temari R - move any friendly + UPGRADE move any
  'KS-121-RA':   6,
  'KS-142-M':    6,  // Sasuke M - discard for POWERUP X+1 (X = enemy count)
  'KS-141-M':    6,  // Naruto M - discard to hide power ≤4
  'KS-115-R':    6,  // Shino R - 6 power + block hide + AMBUSH move friendly
  'KS-103-UC':   6,  // Kyodaigumo - 4 power + end-of-turn hide enemy
  'KS-102-UC':   6,  // Manda - 5 power + AMBUSH defeat enemy Summon

  // === Tier B (5): Solid utility cards ===
  'KS-094-C':    5,  // Gamabunta - 6 power Summon
  'KS-095-C':    5,  // Gamahiro - 6 power Summon + draw 1
  'KS-098-C':    5,  // Katsuyu - 5 power Summon + POWERUP 2 with Tsunade
  'KS-092-C':    5,  // Kisame C - 4 power + AMBUSH steal 2 tokens
  'KS-007-C':    5,  // Jiraiya C - 4 power + play Summon -1
  'KS-001-C':    5,  // Hiruzen C - POWERUP 2 Leaf Village ally
  'KS-015-C':    5,  // Kakashi C - [⧗] Team 7 +1 power
  'KS-042-C':    5,  // Gai C - [⧗] Team Guy +1 power
  'KS-003-C':    5,  // Tsunade C - [⧗] gain 2 chakra when friendly defeated
  'KS-048-C':    5,  // Hayate - [⧗] if defeated, hide instead
  'KS-049-C':    5,  // Gemma - [⧗] sacrifice self to protect Leaf ally
  'KS-068-C':    5,  // Dosu C - look at hidden + AMBUSH defeat hidden
  'KS-075-C':    5,  // Gaara 075 - 3 power + can't be moved/defeated + reveal -2
  'KS-002-UC':   5,  // Hiruzen UC - play Leaf -1 + UPGRADE POWERUP 2 target
  'KS-004-UC':   5,  // Tsunade UC - defeated go to hand + UPGRADE recover from discard
  'KS-008-UC':   5,  // Jiraiya UC - Summon -2 + UPGRADE hide cost ≤3
  'KS-014-UC':   5,  // Sasuke UC - AMBUSH see hand + UPGRADE discard from hand
  'KS-016-UC':   5,  // Kakashi UC - copy enemy non-upgrade instant effect
  'KS-035-UC':   5,  // Kurenai UC - enemies can't move + UPGRADE defeat power ≤1
  'KS-037-UC':   5,  // Neji UC - POWERUP 1 when enemy played + UPGRADE remove all tokens
  'KS-060-UC':   5,  // Kidomaru UC - move from here + AMBUSH defeat power ≤1
  'KS-073-UC':   5,  // Kin UC - discard to hide power ≤4
  'KS-078-UC':   5,  // Kankuro UC - AMBUSH move power ≤4 + UPGRADE play hidden -1
  'KS-082-UC':   5,  // Baki UC - SCORE defeat hidden + UPGRADE POWERUP 1 each Sand
  'KS-085-UC':   5,  // Yashamaru UC - SCORE self-defeat + defeat another
  'KS-089-UC':   5,  // Haku UC - discard opponent deck top, POWERUP X (cost of discarded)
  'KS-053-UC':   5,  // Kabuto UC - play from discard -3
  'KS-067-UC':   5,  // Rempart - nullify strongest enemy (power 0)
  'KS-066-UC':   5,  // Doki - steal 1 chakra if Sound Four present
  'KS-146-M':    5,  // Sasuke M - give Edge for POWERUP 3
  'KS-147-M':    5,  // Sakura M - CHAKRA +2 without Edge
  'KS-083-UC':   5,  // Rasa - SCORE +1 mission pt if Sand Village ally

  // === Tier C+ (4): Above-average cards ===
  'KS-086-C':    4,  // Zabuza C - 5 power vanilla
  'KS-044-C':    4,  // Anko - [⧗] CHAKRA +1 with Leaf ally
  'KS-025-C':    4,  // Kiba C - [⧗] CHAKRA +1 with Akamaru
  'KS-034-C':    4,  // Kurenai C - [⧗] Team 8 cost -1
  'KS-017-C':    4,  // Choji C - POWERUP 3
  'KS-013-C':    4,  // Sasuke C - 4 power (but self-debuff)
  'KS-070-C':    4,  // Zaku C - 4 power (gives opponent 1 chakra)
  'KS-077-C':    4,  // Kankuro C - [⧗] CHAKRA +1 if enemy present
  'KS-055-C':    4,  // Kimimaro C - AMBUSH discard to hide cost ≤3
  'KS-074-C':    4,  // Gaara 074 - POWERUP X (X = friendly hidden in mission)
  'KS-064-C':    4,  // Tayuya C - [⧗] CHAKRA +X (X = missions with Sound Four)
  'KS-028-UC':   4,  // Akamaru UC - optional end-round return + AMBUSH POWERUP 2 Kiba
  'KS-029-UC':   4,  // Akamaru UC 029 - upgrade over Kiba + hide weakest enemy
  'KS-018-UC':   4,  // Choji UC - hide enemy after moving self + UPGRADE move self
  'KS-022-UC':   4,  // Shikamaru UC - AMBUSH move enemy played last turn
  'KS-024-UC':   4,  // Asuma UC - AMBUSH draw + discard for POWERUP 3
  'KS-026-UC':   4,  // Kiba UC - hide lowest cost enemy + UPGRADE look for Akamaru
  'KS-031-UC':   4,  // Hinata UC - gain 1 chakra when enemy played here
  'KS-033-UC':   4,  // Shino UC - AMBUSH free if enemy Jutsu + UPGRADE move self
  'KS-041-UC':   4,  // Tenten UC - defeat hidden + UPGRADE POWERUP 1 Leaf ally
  'KS-058-UC':   4,  // Jirobo UC - POWERUP 1 all Sound Four + UPGRADE spread to others
  'KS-062-UC':   4,  // Sakon UC - AMBUSH copy Sound Four instant effect
  'KS-065-UC':   4,  // Tayuya UC - AMBUSH POWERUP 2 Sound + UPGRADE look for Summons
  'KS-071-UC':   4,  // Zaku UC - move enemy if fewer chars + UPGRADE POWERUP 2
  'KS-080-UC':   4,  // Temari UC - move Sand + UPGRADE move self

  // === Tier C (3): Average cards ===
  'KS-009-C':    3,  // Naruto C - 3 power vanilla (but upgrade chain starter)
  'KS-011-C':    3,  // Sakura C - draw 1 if Team 7 ally
  'KS-032-C':    3,  // Shino C - 3 power + both draw 1
  'KS-046-C':    3,  // Ebisu - 3 power + draw 1 if weaker ally
  'KS-047-C':    3,  // Iruka - 3 power + move Naruto
  'KS-090-C':    3,  // Itachi C - 3 power + reveal -3 if Sasuke present
  'KS-088-C':    3,  // Haku C - draw 1, put 1 back on deck
  'KS-081-C':    3,  // Baki C - 2 power + SCORE draw 1
  'KS-079-C':    3,  // Temari C - 2 power + [⧗] +2 with Edge
  'KS-096-C':    3,  // Gamakichi - 3 power Summon + Naruto cost -1
  'KS-057-C':    3,  // Jirobo C - POWERUP X (X = missions with Sound Four)
  'KS-059-C':    3,  // Kidomaru C - move X chars (X = missions with Sound Four)
  'KS-061-C':    3,  // Sakon C - draw X (X = missions with Sound Four)
  'KS-006-UC':   3,  // Shizune UC - move enemy power ≤3 + UPGRADE gain 2 chakra
  'KS-010-C':    3,  // Naruto 010 - AMBUSH move self
  'KS-012-UC':   3,  // Sakura UC - CHAKRA +1 + UPGRADE draw/discard
  'KS-020-UC':   3,  // Ino UC - take control cost ≤2 + UPGRADE cost ≤3
  'KS-023-C':    3,  // Asuma C - 3 power + move Team 10 from here
  'KS-052-C':    3,  // Kabuto C - AMBUSH steal top of opponent deck as hidden
  'KS-005-C':    3,  // Shizune C - CHAKRA +1

  // === Tier D (2): Below-average / Filler cards ===
  'KS-036-C':    2,  // Neji C - 2 power + remove 2 tokens
  'KS-030-C':    2,  // Hinata C - 2 power + remove 2 tokens
  'KS-019-C':    2,  // Ino C - 1 power + POWERUP 1 if Team 10 ally
  'KS-027-C':    2,  // Akamaru C - 2 power + must return without Kiba
  'KS-038-C':    2,  // Rock Lee C - 3 power + AMBUSH POWERUP 1
  'KS-084-C':    2,  // Yashamaru C - 1 power + [⧗] +2 with Gaara
  'KS-072-C':    2,  // Kin C - 3 power (gives opponent draw 1)
  'KS-040-C':    2,  // Tenten C - 2 power but only when winning
  'KS-099-C':    2,  // Pakkun - 1 power + SCORE move self
  'KS-100-C':    2,  // Ninja Hounds - 1 power + look at hidden when moving
  'KS-097-C':    2,  // Gamatatsu - 2 power Summon
  'KS-021-C':    2,  // Shikamaru C - 0 power + draw 1 if Edge

  // === Tier E (1): Weakest cards ===
  'KS-101-C':    1,  // Ton Ton - 0 power + [⧗] +1 with Tsunade/Shizune
};

// ─── Synergy Definitions ─────────────────────────────────────────────────────

interface SynergyGroup {
  /** Card IDs that participate in this synergy (any 2+ present = bonus) */
  cards: string[];
  /** Score bonus when 2+ cards are present together */
  bonus: number;
  /** Minimum cards from the group that must be present for the bonus */
  minCount: number;
}

const CARD_SYNERGIES: SynergyGroup[] = [
  // Named pairs
  { cards: ['KS-025-C', 'KS-027-C', 'KS-026-UC', 'KS-028-UC', 'KS-029-UC', 'KS-113-R', 'KS-113-RA', 'KS-113-MV'], bonus: 5, minCount: 2 },  // Kiba + Akamaru (any version)
  { cards: ['KS-084-C', 'KS-074-C', 'KS-075-C', 'KS-120-R', 'KS-120-RA', 'KS-120-MV', 'KS-076-UC', 'KS-139-S'], bonus: 4, minCount: 2 },  // Yashamaru/Gaara synergy
  { cards: ['KS-101-C', 'KS-003-C', 'KS-004-UC', 'KS-104-R', 'KS-104-RA', 'KS-104-MV', 'KS-131-S', 'KS-131-SV', 'KS-005-C', 'KS-006-UC'], bonus: 2, minCount: 2 },  // TonTon + Tsunade/Shizune

  // Upgrade chains - same name, increasing cost
  { cards: ['KS-009-C', 'KS-010-C', 'KS-108-R', 'KS-108-RA', 'KS-108-MV', 'KS-133-S', 'KS-133-SV', 'KS-133-MV', 'KS-000-L', 'KS-141-M', 'KS-145-M'], bonus: 5, minCount: 2 },  // Naruto chain
  { cards: ['KS-074-C', 'KS-075-C', 'KS-120-R', 'KS-120-RA', 'KS-120-MV', 'KS-076-UC', 'KS-139-S'], bonus: 5, minCount: 2 },  // Gaara chain
  { cards: ['KS-013-C', 'KS-014-UC', 'KS-107-R', 'KS-107-RA', 'KS-136-S', 'KS-136-SV', 'KS-142-M', 'KS-146-M'], bonus: 4, minCount: 2 },  // Sasuke chain
  { cards: ['KS-015-C', 'KS-016-UC', 'KS-106-R', 'KS-106-RA', 'KS-137-S', 'KS-137-SV', 'KS-148-M'], bonus: 4, minCount: 2 },  // Kakashi chain
  { cards: ['KS-050-C', 'KS-051-UC', 'KS-138-S', 'KS-126-RA'], bonus: 4, minCount: 2 },  // Orochimaru chain
  { cards: ['KS-090-C', 'KS-091-UC', 'KS-128-R', 'KS-128-RA', 'KS-128-MV', 'KS-140-S', 'KS-143-M'], bonus: 4, minCount: 2 },  // Itachi chain
  { cards: ['KS-092-C', 'KS-093-UC', 'KS-144-M'], bonus: 3, minCount: 2 },  // Kisame chain
  { cards: ['KS-086-C', 'KS-087-UC'], bonus: 3, minCount: 2 },  // Zabuza chain
  { cards: ['KS-088-C', 'KS-089-UC'], bonus: 3, minCount: 2 },  // Haku chain

  // Jiraiya + Summons
  { cards: ['KS-007-C', 'KS-008-UC', 'KS-105-R', 'KS-105-RA', 'KS-132-S', 'KS-094-C', 'KS-095-C', 'KS-096-C', 'KS-097-C', 'KS-098-C', 'KS-102-UC', 'KS-103-UC', 'KS-066-UC', 'KS-067-UC'], bonus: 4, minCount: 2 },

  // Team keyword synergies (sensei + members)
  { cards: ['KS-015-C', 'KS-016-UC', 'KS-106-R', 'KS-106-RA', 'KS-137-S', 'KS-137-SV', 'KS-148-M', 'KS-009-C', 'KS-010-C', 'KS-011-C', 'KS-012-UC', 'KS-013-C', 'KS-014-UC'], bonus: 3, minCount: 3 },  // Team 7
  { cards: ['KS-042-C', 'KS-043-UC', 'KS-039-UC', 'KS-036-C', 'KS-037-UC', 'KS-040-C', 'KS-041-UC', 'KS-038-C'], bonus: 3, minCount: 3 },  // Team Guy
  { cards: ['KS-034-C', 'KS-035-UC', 'KS-025-C', 'KS-026-UC', 'KS-027-C', 'KS-028-UC', 'KS-030-C', 'KS-031-UC', 'KS-032-C', 'KS-033-UC'], bonus: 3, minCount: 3 },  // Team 8
  { cards: ['KS-023-C', 'KS-024-UC', 'KS-019-C', 'KS-020-UC', 'KS-021-C', 'KS-022-UC', 'KS-017-C', 'KS-018-UC'], bonus: 3, minCount: 3 },  // Team 10
  { cards: ['KS-064-C', 'KS-065-UC', 'KS-057-C', 'KS-058-UC', 'KS-059-C', 'KS-060-UC', 'KS-061-C', 'KS-062-UC', 'KS-063-UC', 'KS-125-R', 'KS-125-RA'], bonus: 4, minCount: 3 },  // Sound Four

  // Akatsuki pair
  { cards: ['KS-090-C', 'KS-091-UC', 'KS-128-R', 'KS-128-RA', 'KS-128-MV', 'KS-140-S', 'KS-143-M', 'KS-092-C', 'KS-093-UC', 'KS-144-M'], bonus: 3, minCount: 2 },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the strategic tier rating of a card (1-10).
 * Uses explicit tier map first, then falls back to stat-based calculation.
 */
export function getCardTier(card: CharacterCard): number {
  const explicit = CARD_TIER[card.cardId];
  if (explicit !== undefined) return explicit;

  // Fallback: derive tier from card stats and effect types
  let tier = 1;

  // Power/cost efficiency
  const cost = card.chakra ?? 0;
  const power = card.power ?? 0;
  if (cost > 0) {
    tier += Math.min(3, (power / cost) * 1.5);
  } else {
    tier += Math.min(2, power);
  }

  // Base power bonus
  if (power >= 6) tier += 1.5;
  else if (power >= 4) tier += 0.5;

  // Effect bonuses
  for (const effect of card.effects ?? []) {
    const desc = effect.description.toLowerCase();
    if (effect.type === 'AMBUSH') tier += 2;
    if (effect.type === 'SCORE') tier += 1.5;

    if (/defeat/i.test(desc)) tier += 2;
    if (/take control|steal/i.test(desc) && !/chakra/i.test(desc)) tier += 2.5;
    if (/powerup\s+(\d+)/i.test(desc)) {
      const m = desc.match(/powerup\s+(\d+)/i);
      tier += (m ? parseInt(m[1], 10) : 0) * 0.5;
    }
    if (/chakra\s*\+(\d+)/i.test(desc)) {
      const m = desc.match(/chakra\s*\+(\d+)/i);
      tier += (m ? parseInt(m[1], 10) : 0) * 1.5;
    }
    if (/hide/i.test(desc) && !/this character/i.test(desc)) tier += 1;
    if (/move/i.test(desc)) tier += 0.5;
    if (/draw/i.test(desc)) tier += 0.5;
  }

  return Math.min(10, Math.max(1, Math.round(tier)));
}

/**
 * Evaluate synergy bonuses for a set of cards (hand or board).
 * Returns a score bonus based on detected synergies.
 */
export function evaluateCardSynergies(cardIds: string[]): number {
  const idSet = new Set(cardIds);
  let totalBonus = 0;

  for (const synergy of CARD_SYNERGIES) {
    const matchCount = synergy.cards.filter(id => idSet.has(id)).length;
    if (matchCount >= synergy.minCount) {
      totalBonus += synergy.bonus;
    }
  }

  return totalBonus;
}

/**
 * Evaluate synergies in a player's hand.
 */
export function evaluateHandSynergies(hand: CharacterCard[]): number {
  return evaluateCardSynergies(hand.map(c => c.cardId));
}

/**
 * Evaluate synergies active on the board (characters in play for a player).
 */
export function evaluateBoardSynergies(state: GameState, player: PlayerID): number {
  const cardIds: string[] = [];

  for (const mission of state.activeMissions) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const c of chars) {
      if (!c.isHidden) {
        const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        cardIds.push(topCard.cardId);
      }
    }
  }

  return evaluateCardSynergies(cardIds);
}

/**
 * Check if a card in hand has a valid upgrade target on the board.
 */
export function hasUpgradeTarget(state: GameState, player: PlayerID, card: CharacterCard): boolean {
  for (const mission of state.activeMissions) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const c of chars) {
      if (c.isHidden) continue;
      const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      if (topCard.name_fr === card.name_fr && (topCard.chakra ?? 0) < (card.chakra ?? 0)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a character is a Summon (returns to hand at end of round).
 */
export function isSummon(card: CharacterCard): boolean {
  return card.keywords?.includes('Summon') ?? false;
}
