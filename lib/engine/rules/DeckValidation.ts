import type { CharacterCard, MissionCard } from '../types';
import { MIN_DECK_SIZE, MAX_COPIES_PER_VERSION, MISSION_CARDS_PER_PLAYER } from '../types';

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a deck according to the construction rules:
 * - Minimum 30 character cards
 * - Max 2 copies of the same version (card number + edition)
 * - Rare Art variants of the same card number are NOT different versions
 * - Exactly 3 mission cards
 */
export function validateDeck(
  characterCards: CharacterCard[],
  missionCards: MissionCard[],
): DeckValidationResult {
  const errors: string[] = [];

  // Check minimum character cards
  if (characterCards.length < MIN_DECK_SIZE) {
    errors.push(`Deck needs at least ${MIN_DECK_SIZE} character cards (has ${characterCards.length}).`);
  }

  // Check mission cards count
  if (missionCards.length !== MISSION_CARDS_PER_PLAYER) {
    errors.push(`Must select exactly ${MISSION_CARDS_PER_PLAYER} mission cards (has ${missionCards.length}).`);
  }

  // Check max copies per version
  const versionCounts = new Map<string, number>();
  for (const card of characterCards) {
    // Normalize version: strip " A" suffix (RA variants are same version)
    const baseVersion = card.id.replace(/\s*A$/, '').trim();
    const count = (versionCounts.get(baseVersion) ?? 0) + 1;
    versionCounts.set(baseVersion, count);
  }

  for (const [version, count] of versionCounts) {
    if (count > MAX_COPIES_PER_VERSION) {
      errors.push(`Too many copies of version ${version}: ${count} (max ${MAX_COPIES_PER_VERSION}).`);
    }
  }

  // Check all character cards are playable (have visuals)
  for (const card of characterCards) {
    if (!card.has_visual) {
      errors.push(`Card ${card.id} (${card.name_fr}) is not playable (no visual).`);
    }
  }

  // Check all mission cards are playable
  for (const card of missionCards) {
    if (!card.has_visual) {
      errors.push(`Mission ${card.id} (${card.name_fr}) is not playable (no visual).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
