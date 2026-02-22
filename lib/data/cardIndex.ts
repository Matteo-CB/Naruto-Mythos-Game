import type { CardData, CharacterCard, MissionCard } from '../engine/types';
import { getAllCards, getAllCharacters, getAllMissions, getPlayableCharacters, getPlayableMissions } from './cardLoader';

// Singleton index maps
let _byId: Map<string, CardData> | null = null;
let _byOldId: Map<string, CardData> | null = null;
let _charById: Map<string, CharacterCard> | null = null;
let _missionById: Map<string, MissionCard> | null = null;
let _byName: Map<string, CardData[]> | null = null;
let _byGroup: Map<string, CardData[]> | null = null;
let _byKeyword: Map<string, CardData[]> | null = null;
let _byRarity: Map<string, CardData[]> | null = null;

function buildIdMap(): Map<string, CardData> {
  const map = new Map<string, CardData>();
  for (const card of getAllCards()) {
    map.set(card.id, card);
  }
  return map;
}

function buildOldIdMap(): Map<string, CardData> {
  // Build a mapping from old-format IDs (e.g. "001/130") to CardData
  // Uses the number and rarity to reconstruct old IDs
  const map = new Map<string, CardData>();
  const rarityToOld: Record<string, string> = {
    'C': 'C', 'UC': 'UC', 'R': 'R', 'RA': 'RA',
    'S': 'S', 'SV': 'SV', 'M': 'M', 'MV': 'MV', 'L': 'Legendary', 'MMS': 'Mission',
  };

  for (const card of getAllCards()) {
    // Standard old ID format: "NNN/130"
    const numStr = String(card.number).padStart(3, '0');

    if (card.rarity === 'L') {
      map.set('Legendary', card);
    } else if (card.rarity === 'MMS') {
      map.set(`MSS ${numStr.replace(/^0+/, '').padStart(2, '0')}`, card);
    } else if (card.rarity === 'RA') {
      map.set(`${numStr}/130 A`, card);
    } else {
      map.set(`${numStr}/130`, card);
    }
  }
  return map;
}

function buildCharIdMap(): Map<string, CharacterCard> {
  const map = new Map<string, CharacterCard>();
  for (const card of getAllCharacters()) {
    map.set(card.id, card);
  }
  return map;
}

function buildMissionIdMap(): Map<string, MissionCard> {
  const map = new Map<string, MissionCard>();
  for (const card of getAllMissions()) {
    map.set(card.id, card);
  }
  return map;
}

function buildNameMap(): Map<string, CardData[]> {
  const map = new Map<string, CardData[]>();
  for (const card of getAllCards()) {
    const name = card.name_fr.toUpperCase();
    const existing = map.get(name) ?? [];
    existing.push(card);
    map.set(name, existing);
  }
  return map;
}

function buildGroupMap(): Map<string, CardData[]> {
  const map = new Map<string, CardData[]>();
  for (const card of getAllCards()) {
    const group = card.group;
    const existing = map.get(group) ?? [];
    existing.push(card);
    map.set(group, existing);
  }
  return map;
}

function buildKeywordMap(): Map<string, CardData[]> {
  const map = new Map<string, CardData[]>();
  for (const card of getAllCards()) {
    for (const keyword of card.keywords) {
      const existing = map.get(keyword) ?? [];
      existing.push(card);
      map.set(keyword, existing);
    }
  }
  return map;
}

function buildRarityMap(): Map<string, CardData[]> {
  const map = new Map<string, CardData[]>();
  for (const card of getAllCards()) {
    const existing = map.get(card.rarity) ?? [];
    existing.push(card);
    map.set(card.rarity, existing);
  }
  return map;
}

export function getCardById(id: string): CardData | undefined {
  if (!_byId) _byId = buildIdMap();
  // Try new ID first, then old ID format
  const result = _byId.get(id);
  if (result) return result;
  if (!_byOldId) _byOldId = buildOldIdMap();
  return _byOldId.get(id);
}

export function getCharacterById(id: string): CharacterCard | undefined {
  if (!_charById) _charById = buildCharIdMap();
  return _charById.get(id);
}

export function getMissionById(id: string): MissionCard | undefined {
  if (!_missionById) _missionById = buildMissionIdMap();
  return _missionById.get(id);
}

export function getCardsByName(name: string): CardData[] {
  if (!_byName) _byName = buildNameMap();
  return _byName.get(name.toUpperCase()) ?? [];
}

export function getCardsByGroup(group: string): CardData[] {
  if (!_byGroup) _byGroup = buildGroupMap();
  return _byGroup.get(group) ?? [];
}

export function getCardsByKeyword(keyword: string): CardData[] {
  if (!_byKeyword) _byKeyword = buildKeywordMap();
  return _byKeyword.get(keyword) ?? [];
}

export function getCardsByRarity(rarity: string): CardData[] {
  if (!_byRarity) _byRarity = buildRarityMap();
  return _byRarity.get(rarity) ?? [];
}

export function getUniqueGroups(): string[] {
  if (!_byGroup) _byGroup = buildGroupMap();
  return Array.from(_byGroup.keys()).sort();
}

export function getUniqueKeywords(): string[] {
  if (!_byKeyword) _byKeyword = buildKeywordMap();
  return Array.from(_byKeyword.keys()).sort();
}

export function getUniqueRarities(): string[] {
  if (!_byRarity) _byRarity = buildRarityMap();
  return Array.from(_byRarity.keys());
}

// Check if two card IDs refer to the same "version" for deck-building purposes
// RA variants of the same card number are NOT considered different versions
export function isSameVersion(cardId1: string, cardId2: string): boolean {
  // KS-108-R and KS-108-RA are the same version
  const normalize = (id: string) => id.replace('-RA', '-R');
  return normalize(cardId1) === normalize(cardId2);
}

export { getAllCards, getAllCharacters, getAllMissions, getPlayableCharacters, getPlayableMissions };
