import { getCardById } from '@/lib/data/cardIndex';

export const PENDING_EFFECT_IMPLEMENTATION: ReadonlySet<string> = new Set([
  'SS-013-UC',
  'SS-014-C',
  'SS-017-C',
  'SS-018-UC',
  'SS-021-C',
  'SS-022-UC',
  'SS-052-C',
  'SS-055-UC',
  'SS-056-UC',
  'SS-060-UC',
  'SS-068-UC',
  'SS-073-C',
  'SS-076-UC',
  'SS-113-R',
  'SS-129-R',
  'SS-131-R',
  'SS-133-R',
  'SS-135-R',
  'SS-138-R',
  'SS-140-R',
  'SS-141-S',
  'SS-144-S',
  'SS-145-S',
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
