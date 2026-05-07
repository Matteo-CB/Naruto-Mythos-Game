import type { CharacterCard } from '@/lib/engine/types';


const UNCOPYABLE_CARD_NUMBERS = new Set<number>([
  15,  // Kakashi Hatake (C) - Team 7 Sensei
  16,  // Kakashi Hatake (UC) - Sharingan, copy effect itself
  106, // Kakashi Hatake (R) - Curse Sealing
  115, // Shino Aburame (R/RA)
  137, // Kakashi Hatake (S) - Lightning Blade
  148, // Kakashi Hatake (M) - Original Team 7, copy effect itself
]);


export function isCharacterCopyable(topCard: CharacterCard): boolean {
  return !UNCOPYABLE_CARD_NUMBERS.has(topCard.number);
}
