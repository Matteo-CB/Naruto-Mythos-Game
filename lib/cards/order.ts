import type { CardData } from '@/lib/engine/types';
import { getAllCards } from '@/lib/data/cardLoader';
import { getSetNumber } from '@/lib/data/sets/registry';

const RARITY_ORDER = [
  'C', 'UC', 'R', 'RA', 'S', 'SV', 'M', 'MV', 'L',
  'SP', 'SPV', 'POP', 'POPV', 'CHIBI', 'CHIBIV', 'MMS',
];

function rarityRank(rarity: string): number {
  const i = RARITY_ORDER.indexOf(rarity);
  return i === -1 ? RARITY_ORDER.length : i;
}

function setRank(setId: string): number {
  const n = getSetNumber(setId);
  return n == null ? Number.MAX_SAFE_INTEGER : n;
}

function compareCards(a: CardData, b: CardData): number {
  const sa = setRank(a.set);
  const sb = setRank(b.set);
  if (sa !== sb) return sa - sb;

  const ma = a.card_type === 'mission' ? 1 : 0;
  const mb = b.card_type === 'mission' ? 1 : 0;
  if (ma !== mb) return ma - mb;

  if (a.number !== b.number) return a.number - b.number;

  const ra = rarityRank(a.rarity);
  const rb = rarityRank(b.rarity);
  if (ra !== rb) return ra - rb;

  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export const ORDERED_CARD_IDS: string[] = getAllCards()
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
