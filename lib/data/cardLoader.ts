import type { RawCardData, RawRarity } from './types';
import type { CardData, CharacterCard, MissionCard, CardEffect } from '../engine/types';
import rawCardsData from './naruto_mythos_tcg_complete.json';
import rawMissionsData from './missions.json';

// Manual corrections for cards with split/malformed effect text in the JSON
// Source: official narutotcgmythos.com (Feb 2026 audit)
const EFFECT_CORRECTIONS: Record<string, CardEffect[]> = {
  'Legendary': [
    { type: 'MAIN', description: 'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.' },
    { type: 'UPGRADE', description: 'MAIN effect: Instead, defeat both of them.' },
  ],
  '137/130': [
    { type: 'UPGRADE', description: 'Move this character.' },
    { type: 'MAIN', description: 'Hide an upgraded character in this mission.' },
  ],
  '120/130': [
    { type: 'MAIN', description: 'Defeat up to 1 enemy character with Power 1 or less in every mission.' },
    { type: 'UPGRADE', description: 'POWERUP X, where X is the number of characters defeated by the MAIN effect.' },
  ],
  '120/130 A': [
    { type: 'MAIN', description: 'Defeat up to 1 enemy character with Power 1 or less in every mission.' },
    { type: 'UPGRADE', description: 'POWERUP X, where X is the number of characters defeated by the MAIN effect.' },
  ],
  '108/130': [
    { type: 'MAIN', description: 'Hide an enemy character with Power 3 or less in this mission.' },
    { type: 'UPGRADE', description: 'MAIN effect: Powerup X where X is the Power of the enemy character that is being hidden.' },
  ],
  '108/130 A': [
    { type: 'MAIN', description: 'Hide an enemy character with Power 3 or less in this mission.' },
    { type: 'UPGRADE', description: 'MAIN effect: Powerup X where X is the Power of the enemy character that is being hidden.' },
  ],
  '109/130': [
    { type: 'MAIN', description: 'Choose one of your Leaf Village characters in your discard pile and play it anywhere, paying its cost.' },
    { type: 'UPGRADE', description: 'MAIN effect: Instead, play the card paying 2 less.' },
  ],
  '133/130': [
    { type: 'MAIN', description: 'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.' },
    { type: 'UPGRADE', description: 'MAIN effect: Instead, defeat both of them.' },
  ],
  '135/130': [
    { type: 'MAIN', description: 'Look at the top 3 cards of your deck. Play one character anywhere and discard the other cards.' },
    { type: 'UPGRADE', description: 'MAIN effect: Instead, play the card paying 4 less.' },
  ],
  '112/130': [
    { type: 'MAIN', description: 'Discard a card from your hand. POWERUP X where X is the cost of the discarded card.' },
    { type: 'UPGRADE', description: 'Repeat the MAIN effect.' },
  ],
};

// Keyword corrections from official site (JSON had wrong or incomplete keywords)
const KEYWORD_CORRECTIONS: Record<string, string[]> = {
  'Legendary': ['Team 7', 'Jutsu'],
  '044/130': ['Academy'],                       // site says "Academy"
  '048/130': [],                                // no keywords on site
  '036/130': ['Team Guy', 'Taijutsu'],          // missing "Taijutsu"
  '039/130': ['Team Guy', 'Jutsu'],             // missing "Jutsu"
  '050/130': ['Sannin', 'Team Dosu'],           // site says Sannin + Team Dosu
  '108/130': ['Team 7', 'Jutsu'],               // missing "Jutsu"
  '108/130 A': ['Team 7', 'Jutsu'],             // missing "Jutsu"
  '137/130': ['Team 7', 'Jutsu'],               // missing "Jutsu"
  '075/130': ['Team Baki', 'Jutsu'],            // missing "Jutsu"
  '120/130': ['Team Baki', 'Jutsu'],            // missing "Jutsu"
  '120/130 A': ['Team Baki', 'Jutsu'],          // missing "Jutsu"
  '133/130': ['Team 7', 'Jutsu'],               // missing "Jutsu"
  '136/130': ['Team 7', 'Jutsu'],               // missing "Jutsu"
  '112/130': ['Team 10'],                        // missing from JSON
  '135/130': ['Team 7'],                         // confirm from site
};

// Name corrections from official site
const NAME_CORRECTIONS: Record<string, string> = {
  '047/130': 'IRUKA UMINO',                     // was just "IRUKA"
  '034/130': 'KURENAI YUHI',                    // site says "Kurenai Yuhi"
  '100/130': 'NINJA HOUND CORPS',               // site says "Ninja Hound Corps"
};

// Stat corrections from official site (cost, power, rarity, title)
const STAT_CORRECTIONS: Record<string, { chakra?: number; power?: number; rarity?: RawRarity; title_fr?: string; group?: string }> = {
  'Legendary': { chakra: 6, power: 6, group: 'Leaf Village' },
  '108/130': { chakra: 5, power: 5, title_fr: 'Believe it!' },
  '108/130 A': { chakra: 5, power: 5, title_fr: 'Believe it!' },
  '109/130': { chakra: 4, power: 3, title_fr: 'Ninja Medical', group: 'Leaf Village' },
  '112/130': { chakra: 5, power: 4, group: 'Leaf Village' },
};

// Mission base points (printed on the card).
// The JSON data (missions.json) does not include a base_points field.
// Per the rules: total points = base points printed on card + rank bonus (D:+1, C:+2, B:+3, A:+4).
// Defaulting all missions to 1 base point since no other data source is available.
// Update these values if the physical card printings become available.
const MISSION_BASE_POINTS: Record<string, number> = {
  'MSS 01': 1,
  'MSS 02': 1,
  'MSS 03': 1,
  'MSS 04': 1,
  'MSS 05': 1,
  'MSS 06': 1,
  'MSS 07': 1,
  'MSS 08': 1,
  'MSS 09': 1,
  'MSS 10': 1,
};

// Current set code
const CURRENT_SET = 'KS';

// Map raw JSON rarity to normalized rarity code
const RARITY_MAP: Record<string, CardData['rarity']> = {
  'C': 'C',
  'UC': 'UC',
  'R': 'R',
  'RA': 'RART',
  'S': 'S',
  'SV': 'SV',
  'M': 'M',
  'Legendary': 'L',
  'Mission': 'MMS',
};

// Legendary card is in the JSON with id "Legendary" — corrections above add its stats/effects

function normalizeImagePath(imagePath?: string): string | undefined {
  if (!imagePath) return undefined;
  const normalized = imagePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : '/' + normalized;
}

function normalizeCard(raw: RawCardData): CardData {
  const correctedEffects = EFFECT_CORRECTIONS[raw.id];
  const effects = correctedEffects ?? (raw.effects ?? []);
  const correctedKeywords = KEYWORD_CORRECTIONS[raw.id];
  const correctedName = NAME_CORRECTIONS[raw.id];
  const statCorrection = STAT_CORRECTIONS[raw.id];

  const rawRarity = statCorrection?.rarity ?? raw.rarity;
  const rarity = RARITY_MAP[rawRarity] ?? rawRarity as CardData['rarity'];
  // Use csvId from JSON if present (aligned with external deck builder),
  // otherwise compute from number + rarity
  const cardId = (raw as unknown as { csvId?: string }).csvId
    || `${CURRENT_SET}-${String(raw.number).padStart(3, '0')}-${rarity}`;

  return {
    id: raw.id,
    cardId,
    set: CURRENT_SET,
    number: raw.number,
    name_fr: correctedName ?? raw.name_fr,
    title_fr: statCorrection?.title_fr ?? raw.title_fr ?? '',
    name_en: raw.name_en,
    rarity,
    card_type: raw.card_type,
    has_visual: raw.has_visual || !!raw.image_file,
    chakra: statCorrection?.chakra ?? raw.chakra ?? 0,
    power: statCorrection?.power ?? raw.power ?? 0,
    keywords: correctedKeywords ?? raw.keywords ?? [],
    group: statCorrection?.group ?? raw.group ?? 'Independent',
    effects,
    image_file: normalizeImagePath(raw.image_file),
    is_rare_art: raw.is_rare_art ?? false,
  };
}

function normalizeCharacterCard(raw: RawCardData): CharacterCard {
  const base = normalizeCard(raw);
  return { ...base, card_type: 'character' } as CharacterCard;
}

function normalizeMissionCard(raw: RawCardData): MissionCard {
  const base = normalizeCard(raw);
  return {
    ...base,
    card_type: 'mission',
    basePoints: MISSION_BASE_POINTS[raw.id] ?? 1,
  } as MissionCard;
}

// Singleton cached data
let _allCards: CardData[] | null = null;
let _characters: CharacterCard[] | null = null;
let _missions: MissionCard[] | null = null;
let _playableCharacters: CharacterCard[] | null = null;
let _playableMissions: MissionCard[] | null = null;

export function getAllCards(): CardData[] {
  if (!_allCards) {
    _allCards = (rawCardsData as RawCardData[]).map(normalizeCard);
  }
  return _allCards;
}

export function getAllCharacters(): CharacterCard[] {
  if (!_characters) {
    _characters = (rawCardsData as RawCardData[])
      .filter((c) => c.card_type === 'character')
      .map(normalizeCharacterCard);
  }
  return _characters;
}

export function getAllMissions(): MissionCard[] {
  if (!_missions) {
    _missions = (rawMissionsData as RawCardData[]).map(normalizeMissionCard);
  }
  return _missions;
}

export function getPlayableCharacters(): CharacterCard[] {
  if (!_playableCharacters) {
    _playableCharacters = getAllCharacters().filter((c) => c.has_visual);
  }
  return _playableCharacters;
}

export function getPlayableMissions(): MissionCard[] {
  if (!_playableMissions) {
    _playableMissions = getAllMissions().filter((c) => c.has_visual);
  }
  return _playableMissions;
}
