import type { CharacterCard } from '@/lib/engine/types';


const UNCOPYABLE_CARD_NUMBERS = new Set<number>([
  115, // Shino Aburame (R/RA)
]);


export function isCharacterCopyable(topCard: CharacterCard): boolean {
  return !UNCOPYABLE_CARD_NUMBERS.has(topCard.number);
}
