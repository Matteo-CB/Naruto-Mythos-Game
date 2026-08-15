import { getCardById } from '@/lib/data/cardIndex';

export const PENDING_EFFECT_IMPLEMENTATION: ReadonlySet<string> = new Set([
]);

function printingKey(cardId: string): string | null {
  const card = getCardById(cardId);
  if (!card) return null;
  return `${card.set}#${card.card_type}#${Number(card.number)}`;
}

let keysAwaiting: Set<string> | null = null;

function awaitingKeys(): Set<string> {
  if (keysAwaiting) return keysAwaiting;
  const keys = new Set<string>();
  for (const id of PENDING_EFFECT_IMPLEMENTATION) {
    const key = printingKey(id);
    if (key) keys.add(key);
  }
  keysAwaiting = keys;
  return keys;
}

// A card awaits its handler if it is listed, or if any other printing of the same card is:
// an alternate art shares its base card's effects, so it shares its implementation status.
export function awaitsEffectImplementation(cardId: string): boolean {
  if (PENDING_EFFECT_IMPLEMENTATION.has(cardId)) return true;
  const key = printingKey(cardId);
  return key !== null && awaitingKeys().has(key);
}
