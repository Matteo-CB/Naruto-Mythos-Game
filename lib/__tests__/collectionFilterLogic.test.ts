import { describe, it, expect } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';
import { isVariantCard } from '@/lib/variants/isVariant';

function mockCard(id: string, rarity: Rarity, set = 'KS'): CardData {
  return {
    id,
    cardId: id,
    set,
    number: 0,
    name_fr: id,
    title_fr: '',
    name_en: id,
    title_en: '',
    rarity,
    card_type: 'character',
    has_visual: true,
    chakra: 1,
    power: 1,
    keywords: [],
    group: '',
    effects: [],
  };
}

function applyFilters(
  cards: CardData[],
  options: {
    variantsOnly?: boolean;
    rarity?: string;
    group?: string;
    set?: string;
  },
): CardData[] {
  return cards.filter((card) => {
    if (options.variantsOnly && !isVariantCard(card)) return false;
    if (options.rarity && options.rarity !== 'all' && card.rarity !== options.rarity) return false;
    if (options.group && options.group !== 'all' && card.group !== options.group) return false;
    if (options.set && options.set !== 'all' && card.set !== options.set) return false;
    return true;
  });
}

describe('collection filter — variantsOnly pill', () => {
  const cards = [
    mockCard('KS-001-C', 'C'),
    mockCard('KS-104-R', 'R'),
    mockCard('KS-104-RA', 'RA'),
    mockCard('KS-117-L', 'L'),
    mockCard('KS-133-M', 'M'),
    mockCard('KS-133-MV', 'MV'),
    mockCard('KS-140-S', 'S'),
    mockCard('KS-140-SV', 'SV'),
  ];

  it('returns only variants when variantsOnly is true', () => {
    const filtered = applyFilters(cards, { variantsOnly: true });
    expect(filtered.map((c) => c.id).sort()).toEqual([
      'KS-104-RA',
      'KS-117-L',
      'KS-133-MV',
      'KS-140-SV',
    ]);
  });

  it('returns all cards when variantsOnly is false', () => {
    const filtered = applyFilters(cards, { variantsOnly: false });
    expect(filtered.length).toBe(cards.length);
  });

  it('combines variantsOnly with rarity filter', () => {
    const filtered = applyFilters(cards, { variantsOnly: true, rarity: 'L' });
    expect(filtered.map((c) => c.id)).toEqual(['KS-117-L']);
  });

  it('combines variantsOnly with set filter', () => {
    const ssCard = mockCard('SS-001-RA', 'RA', 'SS');
    const filtered = applyFilters([...cards, ssCard], { variantsOnly: true, set: 'KS' });
    expect(filtered.every((c) => c.set === 'KS')).toBe(true);
    expect(filtered.map((c) => c.id)).not.toContain('SS-001-RA');
  });

  it('returns empty when no variant matches set+rarity combo', () => {
    const filtered = applyFilters(cards, { variantsOnly: true, rarity: 'C' });
    expect(filtered).toEqual([]);
  });
});

describe('locked vs unlocked logic for a card in the grid', () => {
  function lockedFor(card: CardData, unlockedIds: Set<string>): boolean {
    return isVariantCard(card) && !unlockedIds.has(card.id);
  }

  const variant = mockCard('KS-133-MV', 'MV');
  const base = mockCard('KS-133-M', 'M');

  it('non-variant cards are never locked', () => {
    expect(lockedFor(base, new Set())).toBe(false);
    expect(lockedFor(base, new Set(['KS-133-M']))).toBe(false);
  });

  it('variant cards are locked when not in unlocked set', () => {
    expect(lockedFor(variant, new Set())).toBe(true);
  });

  it('variant cards are unlocked when in unlocked set', () => {
    expect(lockedFor(variant, new Set(['KS-133-MV']))).toBe(false);
  });
});
