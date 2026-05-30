import { describe, it, expect } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';
import { filterCollectionCards } from '@/lib/collection/filter';

function mockCard(id: string, rarity: Rarity, set = 'KS', name_fr = id, name_en = id): CardData {
  return {
    id, cardId: id, set, number: 0,
    name_fr, title_fr: '',
    name_en, title_en: '',
    rarity, card_type: 'character', has_visual: true,
    chakra: 1, power: 1, keywords: [], group: '',
    effects: [],
  };
}

function summarize(cards: CardData[]): Array<{ id: string; rarity: string; set: string }> {
  return cards
    .map((c) => ({ id: c.id, rarity: c.rarity, set: c.set }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe('collection filter — snapshot of real production filter', () => {
  const allCards = [
    mockCard('KS-001-C', 'C'),
    mockCard('KS-002-C', 'C'),
    mockCard('KS-056-UC', 'UC'),
    mockCard('KS-104-R', 'R'),
    mockCard('KS-104-RA', 'RA'),
    mockCard('KS-108-MV', 'MV'),
    mockCard('KS-117-L', 'L'),
    mockCard('KS-117-R', 'R'),
    mockCard('KS-133-S', 'S'),
    mockCard('KS-133-MV', 'MV'),
    mockCard('KS-140-S', 'S'),
    mockCard('KS-140-SV', 'SV'),
    mockCard('SS-001-RA', 'RA', 'SS'),
  ];

  it('no filter: returns all cards', () => {
    expect(summarize(filterCollectionCards(allCards, {}))).toMatchSnapshot();
  });

  it('variantsOnly: returns RA, MV, SV, L across all sets', () => {
    expect(summarize(filterCollectionCards(allCards, { variantsOnly: true }))).toMatchSnapshot();
  });

  it('variantsOnly + set KS: excludes SS variants', () => {
    expect(summarize(filterCollectionCards(allCards, { variantsOnly: true, set: 'KS' }))).toMatchSnapshot();
  });

  it('variantsOnly + rarity MV: only Mythos variants', () => {
    expect(summarize(filterCollectionCards(allCards, { variantsOnly: true, rarity: 'MV' }))).toMatchSnapshot();
  });

  it('rarity C without variantsOnly: only commons', () => {
    expect(summarize(filterCollectionCards(allCards, { rarity: 'C' }))).toMatchSnapshot();
  });

  it('searchQuery is case + accent insensitive', () => {
    const cards = [
      mockCard('KS-018-C', 'C', 'KS', 'CHÔJI AKIMICHI', 'CHOJI AKIMICHI'),
      mockCard('KS-104-R', 'R', 'KS', 'TSUNADE', 'TSUNADE'),
    ];
    const result1 = filterCollectionCards(cards, { searchQuery: 'choji', locale: 'fr' });
    const result2 = filterCollectionCards(cards, { searchQuery: 'CHOJI', locale: 'en' });
    expect(result1.map((c) => c.id)).toEqual(['KS-018-C']);
    expect(result2.map((c) => c.id)).toEqual(['KS-018-C']);
  });
});
