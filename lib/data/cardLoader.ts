import type { RawCardData } from './types';
import type { CardData, CharacterCard, MissionCard, CardEffect } from '../engine/types';
import rawCardsData from '../../output/data/naruto_mythos_tcg_complete.json';
import rawMissionsData from '../../output/data/missions.json';

// Manual corrections for cards with split/malformed effect text in the JSON
const EFFECT_CORRECTIONS: Record<string, CardEffect[]> = {
  '137/130': [
    { type: 'UPGRADE', description: 'Move this character.' },
    { type: 'MAIN', description: 'Hide an enemy character in this mission.' },
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
    { type: 'MAIN', description: 'effect: POWERUP X where X is the Power of the enemy character that is being hidden.' },
  ],
  '108/130 A': [
    { type: 'MAIN', description: 'Hide an enemy character with Power 3 or less in this mission.' },
    { type: 'MAIN', description: 'effect: POWERUP X where X is the Power of the enemy character that is being hidden.' },
  ],
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

function normalizeImagePath(imagePath?: string): string | undefined {
  if (!imagePath) return undefined;
  const normalized = imagePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : '/' + normalized;
}

function normalizeCard(raw: RawCardData): CardData {
  const correctedEffects = EFFECT_CORRECTIONS[raw.id];
  const effects = correctedEffects ?? (raw.effects ?? []);

  return {
    id: raw.id,
    number: raw.number,
    name_fr: raw.name_fr,
    title_fr: raw.title_fr ?? '',
    name_en: raw.name_en,
    rarity: raw.rarity,
    card_type: raw.card_type,
    has_visual: raw.has_visual || !!raw.image_file,
    chakra: raw.chakra ?? 0,
    power: raw.power ?? 0,
    keywords: raw.keywords ?? [],
    group: raw.group ?? 'Independent',
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
