import type { CharacterCard, MissionCard } from '../types';
import { MIN_DECK_SIZE, MAX_COPIES_PER_VERSION, MISSION_CARDS_PER_PLAYER } from '../types';
import { cardVersionKey } from '@/lib/cards/versionKey';

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}


export function validateDeck(
  characterCards: CharacterCard[],
  missionCards: MissionCard[],
): DeckValidationResult {
  const errors: string[] = [];

  
  if (characterCards.length < MIN_DECK_SIZE) {
    errors.push(`Deck needs at least ${MIN_DECK_SIZE} cards (has ${characterCards.length}).`);
  }

  
  if (missionCards.length !== MISSION_CARDS_PER_PLAYER) {
    errors.push(`Must select exactly ${MISSION_CARDS_PER_PLAYER} mission cards (has ${missionCards.length}).`);
  }

  
  
  
  const versionCounts = new Map<string, number>();
  for (const card of characterCards) {
    const baseVersion = cardVersionKey(card.id);
    const count = (versionCounts.get(baseVersion) ?? 0) + 1;
    versionCounts.set(baseVersion, count);
  }

  for (const [version, count] of versionCounts) {
    if (count > MAX_COPIES_PER_VERSION) {
      errors.push(`Too many copies of version ${version}: ${count} (max ${MAX_COPIES_PER_VERSION}).`);
    }
  }

  
  for (const card of characterCards) {
    if (!card.has_visual && !card.data_complete) {
      errors.push(`Card ${card.id} (${card.name_fr}) is not playable (no visual).`);
    }
  }

  
  const missionVersions = new Set<string>();
  for (const card of missionCards) {
    const version = cardVersionKey(card.id);
    if (missionVersions.has(version)) {
      errors.push(`Only one artwork of mission ${version} may be in a deck.`);
    }
    missionVersions.add(version);
  }

  for (const card of missionCards) {
    if (!card.has_visual && !card.data_complete) {
      errors.push(`Mission ${card.id} (${card.name_fr}) is not playable (no visual).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
