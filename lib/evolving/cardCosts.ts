import { getAllCards } from '@/lib/data/cardLoader';

export type EvolvingCostMode = 'per-copy' | 'flat';

export interface EvolvingCardCost {
  pointCost: number;
  maxCopies: 1 | 2;
  costMode: EvolvingCostMode;
}

export interface EvolvingHeroSpec {
  set: string;
  number: string;
  pointCost: number;
  costMode: EvolvingCostMode;
}

export const EVOLVING_HERO_SPECS: ReadonlyArray<EvolvingHeroSpec> = [
  { set: 'KS', number: '107', pointCost: 2, costMode: 'per-copy' },
  { set: 'KS', number: '120', pointCost: 2, costMode: 'per-copy' },
  { set: 'KS', number: '135', pointCost: 2, costMode: 'per-copy' },
  { set: 'KS', number: '020', pointCost: 1, costMode: 'per-copy' },
  { set: 'KS', number: '026', pointCost: 1, costMode: 'per-copy' },
  { set: 'KS', number: '031', pointCost: 1, costMode: 'per-copy' },
  { set: 'KS', number: '033', pointCost: 1, costMode: 'per-copy' },
  { set: 'KS', number: '053', pointCost: 1, costMode: 'per-copy' },
  { set: 'KS', number: '122', pointCost: 1, costMode: 'per-copy' },
  { set: 'KS', number: '133', pointCost: 1, costMode: 'per-copy' },
  { set: 'KS', number: '136', pointCost: 1, costMode: 'per-copy' },
  { set: 'KS', number: '021', pointCost: 1, costMode: 'flat' },
  { set: 'KS', number: '101', pointCost: 1, costMode: 'flat' },
];

function buildEvolvingCardsMap(): Map<string, EvolvingCardCost> {
  const map = new Map<string, EvolvingCardCost>();
  let allCards: ReadonlyArray<{ id: string; card_type?: string }> = [];
  try {
    allCards = getAllCards();
  } catch {
    allCards = [];
  }
  for (const spec of EVOLVING_HERO_SPECS) {
    const prefix = `${spec.set}-${spec.number}-`;
    for (const card of allCards) {
      if (!card.id.startsWith(prefix)) continue;
      if (card.card_type === 'mission') continue;
      map.set(card.id, {
        pointCost: spec.pointCost,
        maxCopies: 2,
        costMode: spec.costMode,
      });
    }
  }
  return map;
}

export const EVOLVING_CARDS: ReadonlyMap<string, EvolvingCardCost> = buildEvolvingCardsMap();

export function isEvolvingHeroCard(cardId: string): boolean {
  return EVOLVING_CARDS.has(cardId);
}
