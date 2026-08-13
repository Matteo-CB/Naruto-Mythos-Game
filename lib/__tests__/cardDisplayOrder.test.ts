import { describe, it, expect } from 'vitest';
import { sortCardsForDisplay, compareBySetOrder, rarityRank } from '@/lib/cards/order';
import { getAllCards } from '@/lib/data/cardLoader';
import { getSetNumber } from '@/lib/data/sets/registry';
import type { CardData } from '@/lib/engine/types';

describe('ordre d affichage des cartes', () => {
  it('trie par set, puis par rarete, puis par numero', () => {
    const tries = sortCardsForDisplay(getAllCards() as CardData[]);
    for (let i = 1; i < tries.length; i++) {
      const a = tries[i - 1];
      const b = tries[i];
      const sa = getSetNumber(a.set) ?? Number.MAX_SAFE_INTEGER;
      const sb = getSetNumber(b.set) ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) { expect(sa).toBeLessThan(sb); continue; }
      const ra = rarityRank(a.rarity);
      const rb = rarityRank(b.rarity);
      if (ra !== rb) { expect(ra).toBeLessThan(rb); continue; }
      expect(a.number).toBeLessThanOrEqual(b.number);
    }
  });

  it('compte les communes et les peu communes comme une seule rarete', () => {
    expect(rarityRank('C')).toBe(rarityRank('UC'));
    expect(rarityRank('C')).toBeLessThan(rarityRank('R'));
    expect(rarityRank('R')).toBeLessThan(rarityRank('RA'));
    expect(rarityRank('RA')).toBeLessThan(rarityRank('S'));
    expect(rarityRank('L')).toBeLessThan(rarityRank('MMS'));
  });

  it('entremele communes et peu communes selon leur numero imprime', () => {
    const ss = sortCardsForDisplay(
      (getAllCards() as CardData[]).filter((c) => c.set === 'SS' && (c.rarity === 'C' || c.rarity === 'UC')),
    );
    const numeros = ss.map((c) => c.number);
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b));
    expect(ss.some((c) => c.rarity === 'UC')).toBe(true);
    expect(ss.some((c) => c.rarity === 'C')).toBe(true);
  });

  it('place les missions en dernier', () => {
    const tries = sortCardsForDisplay(getAllCards() as CardData[]);
    const premiereMission = tries.findIndex((c) => c.card_type === 'mission');
    if (premiereMission >= 0) {
      const setDeLaMission = tries[premiereMission].set;
      const apres = tries.slice(premiereMission).filter((c) => c.set === setDeLaMission);
      expect(apres.every((c) => c.card_type === 'mission')).toBe(true);
    }
  });

  it('est stable et total', () => {
    const cartes = getAllCards() as CardData[];
    const a = sortCardsForDisplay(cartes).map((c) => c.id);
    const b = sortCardsForDisplay([...cartes].reverse()).map((c) => c.id);
    expect(a).toEqual(b);
    expect(compareBySetOrder(cartes[0], cartes[0])).toBe(0);
  });
});
