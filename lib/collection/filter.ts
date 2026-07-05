import type { CardData } from '@/lib/engine/types';
import { isVariantCard } from '@/lib/variants/isVariant';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import { routing } from '@/lib/i18n/routing';

export interface CollectionFilterOptions {
  variantsOnly?: boolean;
  rarity?: string;
  group?: string;
  set?: string;
  searchQuery?: string;
  locale?: string;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function matchesCollectionFilters(card: CardData, opts: CollectionFilterOptions): boolean {
  if (opts.variantsOnly && !isVariantCard(card)) return false;
  if (opts.rarity && opts.rarity !== 'all' && card.rarity !== opts.rarity) return false;
  if (opts.group && opts.group !== 'all' && card.group !== opts.group) return false;
  if (opts.set && opts.set !== 'all' && card.set !== opts.set) return false;
  if (opts.searchQuery && opts.searchQuery.trim() !== '') {
    const locale = opts.locale ?? routing.defaultLocale;
    const q = normalize(opts.searchQuery);
    if (
      !normalize(getCardName(card, locale)).includes(q) &&
      !normalize(getCardTitle(card, locale)).includes(q) &&
      !normalize(card.name_fr).includes(q) &&
      !card.id.toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  return true;
}

export function filterCollectionCards(cards: CardData[], opts: CollectionFilterOptions): CardData[] {
  return cards.filter((c) => matchesCollectionFilters(c, opts));
}
