import type { CardData, CharacterCard, MissionCard, Rarity } from '../engine/types';
import rawData from './card-data.json';

// card-data.json is the single source of truth.
// All corrections (effects, keywords, names, stats, basePoints) are baked into the JSON.
// No more correction tables needed.

const CURRENT_SET = 'KS';

// Raw card shape from the JSON (values may be "" for incomplete cards)
interface RawJsonCard {
  id: string;
  rarity: string;
  number: string;
  set: string;
  card_type: 'character' | 'mission';
  name_en: string;
  name_fr: string;
  title_fr: string;
  title_en: string;
  has_visual: boolean;
  chakra: number | '';
  power: number | '';
  keywords: string[];
  group: string;
  effects: { type: string; description: string; description_fr?: string }[];
  image_url: string;
  rarity_display: string;
  image_file: string;
  is_rare_art?: boolean;
  data_complete?: boolean;
  old_id?: string;
  basePoints?: number;
}

function normalizeImagePath(imagePath?: string): string | undefined {
  if (!imagePath) return undefined;
  const normalized = imagePath.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : '/' + normalized;
}

function normalizeCard(raw: RawJsonCard): CardData {
  return {
    id: raw.id,
    cardId: raw.id,
    set: raw.set || CURRENT_SET,
    number: parseInt(raw.number, 10) || 0,
    name_fr: raw.name_fr,
    title_fr: raw.title_fr || '',
    name_en: raw.name_en || undefined,
    title_en: raw.title_en || undefined,
    rarity: raw.rarity as Rarity,
    card_type: raw.card_type,
    has_visual: raw.has_visual || !!raw.image_file,
    chakra: typeof raw.chakra === 'number' ? raw.chakra : 0,
    power: typeof raw.power === 'number' ? raw.power : 0,
    keywords: raw.keywords || [],
    group: raw.group || 'Independent',
    effects: (raw.effects || []).map(e => ({
      type: e.type as 'MAIN' | 'UPGRADE' | 'AMBUSH' | 'SCORE',
      description: e.description,
    })),
    image_file: normalizeImagePath(raw.image_file) || undefined,
    is_rare_art: raw.is_rare_art ?? false,
    data_complete: raw.data_complete ?? false,
  };
}

function normalizeCharacterCard(raw: RawJsonCard): CharacterCard {
  const base = normalizeCard(raw);
  return { ...base, card_type: 'character' } as CharacterCard;
}

function normalizeMissionCard(raw: RawJsonCard): MissionCard {
  const base = normalizeCard(raw);
  return {
    ...base,
    card_type: 'mission',
    basePoints: raw.basePoints ?? 1,
  } as MissionCard;
}

// Access the cards map from the JSON
const rawCards = (rawData as { cards: Record<string, RawJsonCard> }).cards;
const rawCardList = Object.values(rawCards);

// Singleton cached data
let _allCards: CardData[] | null = null;
let _characters: CharacterCard[] | null = null;
let _missions: MissionCard[] | null = null;
let _playableCharacters: CharacterCard[] | null = null;
let _playableMissions: MissionCard[] | null = null;
let _oldIdToNewId: Map<string, string> | null = null;

/**
 * Returns a map from old card IDs (e.g. "001/130", "MSS 01") to new IDs (e.g. "KS-001-C").
 * Used to resolve saved decks that reference legacy IDs.
 */
export function getOldIdMap(): Map<string, string> {
  if (!_oldIdToNewId) {
    _oldIdToNewId = new Map();
    for (const raw of rawCardList) {
      if (raw.old_id) {
        _oldIdToNewId.set(raw.old_id, raw.id);
      }
    }
  }
  return _oldIdToNewId;
}

/**
 * Resolve a card ID that may be in old or new format.
 * Returns the new-format ID, or the original if no mapping found.
 */
export function resolveCardId(id: string): string {
  const oldMap = getOldIdMap();
  return oldMap.get(id) ?? id;
}

export function getAllCards(): CardData[] {
  if (!_allCards) {
    _allCards = rawCardList.map(normalizeCard);
  }
  return _allCards;
}

export function getAllCharacters(): CharacterCard[] {
  if (!_characters) {
    _characters = rawCardList
      .filter((c) => c.card_type === 'character')
      .map(normalizeCharacterCard);
  }
  return _characters;
}

export function getAllMissions(): MissionCard[] {
  if (!_missions) {
    _missions = rawCardList
      .filter((c) => c.card_type === 'mission')
      .map(normalizeMissionCard);
  }
  return _missions;
}

export function getPlayableCharacters(): CharacterCard[] {
  if (!_playableCharacters) {
    _playableCharacters = getAllCharacters().filter((c) => c.has_visual || c.data_complete);
  }
  return _playableCharacters;
}

export function getPlayableMissions(): MissionCard[] {
  if (!_playableMissions) {
    _playableMissions = getAllMissions().filter((c) => c.has_visual || c.data_complete);
  }
  return _playableMissions;
}
