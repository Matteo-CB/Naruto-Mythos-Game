import type { CardData } from '@/lib/engine/types';
import { getAllCards } from '@/lib/data/cardLoader';
import { getSetNumber, isSetAvailable } from '@/lib/data/sets/registry';

export const RARITY_ORDER: readonly string[] = [
  'C', 'UC', 'R', 'RA', 'S', 'SV', 'M', 'MV', 'L',
  'SP', 'SPV', 'POP', 'POPV', 'CHIBI', 'CHIBIV', 'SHINOBI', 'SHINOBIV', 'MMS',
];

const SORTED_AS_ONE_RARITY: Record<string, string> = { UC: 'C' };

export function rarityRank(rarity: string): number {
  const i = RARITY_ORDER.indexOf(SORTED_AS_ONE_RARITY[rarity] ?? rarity);
  return i === -1 ? RARITY_ORDER.length : i;
}

function setRank(setId: string): number {
  const n = getSetNumber(setId);
  return n == null ? Number.MAX_SAFE_INTEGER : n;
}

export function compareBySetOrder(a: CardData, b: CardData): number {
  return compareCards(a, b);
}

function compareCards(a: CardData, b: CardData): number {
  const sa = setRank(a.set);
  const sb = setRank(b.set);
  if (sa !== sb) return sa - sb;

  const ra = rarityRank(a.rarity);
  const rb = rarityRank(b.rarity);
  if (ra !== rb) return ra - rb;

  if (a.number !== b.number) return a.number - b.number;

  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function sortCardsForDisplay<T extends CardData>(cards: readonly T[]): T[] {
  return [...cards].sort(compareCards);
}

export const ORDERED_CARD_IDS: string[] = getAllCards()
  .filter((c) => isSetAvailable(c.set))
  .slice()
  .sort(compareCards)
  .map((c) => c.id);

const indexById: Map<string, number> = new Map(
  ORDERED_CARD_IDS.map((id, i) => [id, i]),
);

export function getAdjacentCardIds(id: string): { prev: string; next: string } {
  const n = ORDERED_CARD_IDS.length;
  const i = indexById.get(id);
  if (i === undefined || n === 0) return { prev: id, next: id };
  return {
    prev: ORDERED_CARD_IDS[(i - 1 + n) % n],
    next: ORDERED_CARD_IDS[(i + 1) % n],
  };
}
