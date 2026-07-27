import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';

export const SEALED_BOOSTER_COUNT = 5;

export interface SiteFacts {
  cardCount: number;
  characterCount: number;
  boosterCount: number;
}

let cached: SiteFacts | null = null;

export function getSiteFacts(): SiteFacts {
  if (!cached) {
    const characterCount = getPlayableCharacters().length;
    cached = {
      cardCount: characterCount + getPlayableMissions().length,
      characterCount,
      boosterCount: SEALED_BOOSTER_COUNT,
    };
  }
  return cached;
}

export function resetSiteFactsCache(): void {
  cached = null;
}
