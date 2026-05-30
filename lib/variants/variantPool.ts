import type { CardData } from '@/lib/engine/types';
import { getAllCards } from '@/lib/data/cardLoader';
import { isVariantCard, parseCardId, stripVariantSuffix } from './isVariant';
import { BOOSTER_EXCLUDED_VARIANTS, VARIANT_RARITIES, type VariantRarity } from './constants';

const eligibleSetCache = new Map<string, CardData[]>();
const eligibleByRarityCache = new Map<string, Record<VariantRarity, CardData[]>>();

export function clearVariantPoolCache(): void {
  eligibleSetCache.clear();
  eligibleByRarityCache.clear();
}

export function allVariantCards(): CardData[] {
  return getAllCards().filter(isVariantCard);
}

export function eligibleVariantsForSet(setId: string): CardData[] {
  const cached = eligibleSetCache.get(setId);
  if (cached) return cached;
  const list = allVariantCards().filter(
    (card) => card.set === setId && !BOOSTER_EXCLUDED_VARIANTS.has(card.cardId),
  );
  eligibleSetCache.set(setId, list);
  return list;
}

export function eligibleVariantsForSetByRarity(setId: string): Record<VariantRarity, CardData[]> {
  const cached = eligibleByRarityCache.get(setId);
  if (cached) return cached;
  const out: Record<VariantRarity, CardData[]> = { RA: [], MV: [], SV: [], L: [] };
  for (const card of eligibleVariantsForSet(setId)) {
    const r = card.rarity as VariantRarity;
    if ((VARIANT_RARITIES as readonly string[]).includes(r)) {
      out[r].push(card);
    }
  }
  eligibleByRarityCache.set(setId, out);
  return out;
}

export function hasAnyVariantsForSet(setId: string): boolean {
  return eligibleVariantsForSet(setId).length > 0;
}

const FALLBACK_CHAINS: Record<string, string[]> = {
  RA: ['R'],
  MV: ['M', 'R', 'S'],
  SV: ['S'],
  L: ['S', 'R'],
};

export function resolveVariantToBaseCardId(cardId: string): string {
  const parsed = parseCardId(cardId);
  if (!parsed) return cardId;
  const chain = FALLBACK_CHAINS[parsed.rarity];
  if (!chain) return cardId;
  const number = stripVariantSuffix(parsed.number);
  const existingIds = new Set(getAllCards().map((c) => c.cardId));
  for (const candidate of chain) {
    const candidateId = `${parsed.set}-${number}-${candidate}`;
    if (existingIds.has(candidateId)) return candidateId;
  }
  return cardId;
}
