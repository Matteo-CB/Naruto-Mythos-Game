import type { CharacterCard } from '@/lib/engine/types';

/**
 * Cards whose effects cannot be copied by any copy-effect (Kakashi 016 / 106 /
 * 148, Sakon 062, etc.). Maintained as an explicit allow-list so designer
 * rulings that exclude specific cards land in a single place.
 *
 * Current exclusions:
 *  - Shino Aburame 115 (R/RA) — designer ruling (Marcello): Shino's effects
 *    cannot be copied by Kakashi or anyone else.
 */
const UNCOPYABLE_CARD_NUMBERS = new Set<number>([
  115, // Shino Aburame (R/RA)
]);

/**
 * Returns true if a copy-effect (Kakashi, Sakon, etc.) is allowed to target
 * this character's effects at all. If this returns false, the character
 * should be filtered out of valid-target lists in the pre-filter step.
 */
export function isCharacterCopyable(topCard: CharacterCard): boolean {
  return !UNCOPYABLE_CARD_NUMBERS.has(topCard.number);
}
