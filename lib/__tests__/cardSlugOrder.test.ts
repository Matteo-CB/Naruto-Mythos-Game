import { describe, it, expect } from 'vitest';
import { getAllCards } from '@/lib/data/cardLoader';
import { getSetNumber } from '@/lib/data/sets/registry';
import { ORDERED_CARD_IDS, getAdjacentCardIds } from '@/lib/cards/order';
import { slugify, cardIdToSlug, slugToCardId } from '@/lib/cards/slug';
import type { CardData } from '@/lib/engine/types';

const CARDS = getAllCards();
const BY_ID = new Map<string, CardData>(CARDS.map((c) => [c.id, c]));

describe('slugify', () => {
  it('strips diacritics, lowercases, and dashes non-alphanumerics', () => {
    expect(slugify('Naruto Uzumaki')).toBe('naruto-uzumaki');
    expect(slugify('Le Jinchūriki')).toBe('le-jinchuriki');
    expect(slugify("Génie de l'Akatsuki")).toBe('genie-de-l-akatsuki');
    expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
    expect(slugify('ARAIGNEE GEANTE')).toBe('araignee-geante');
  });

  it('produces a clean slug: only lowercase, digits and single dashes', () => {
    for (const c of CARDS) {
      const slug = cardIdToSlug(c.id);
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

describe('card slug map', () => {
  it('assigns a unique slug to every card', () => {
    const slugs = CARDS.map((c) => cardIdToSlug(c.id));
    expect(new Set(slugs).size).toBe(CARDS.length);
  });

  it('round-trips id -> slug -> id for every card', () => {
    for (const c of CARDS) {
      expect(slugToCardId(cardIdToSlug(c.id))).toBe(c.id);
    }
  });

  it('base rarities have no rarity suffix, variants do', () => {
    const secret = CARDS.find((c) => c.rarity === 'S');
    if (secret) expect(cardIdToSlug(secret.id).endsWith('-s')).toBe(false);
    const rareArt = CARDS.find((c) => c.rarity === 'RA');
    if (rareArt) expect(cardIdToSlug(rareArt.id)).toContain('-ra');
    const legendary = CARDS.find((c) => c.rarity === 'L');
    if (legendary) expect(cardIdToSlug(legendary.id)).toContain('-l');
  });

  it('returns undefined for an unknown slug', () => {
    expect(slugToCardId('this-card-does-not-exist-9999')).toBeUndefined();
  });
});

describe('global card ordering', () => {
  it('lists every card exactly once', () => {
    expect(ORDERED_CARD_IDS.length).toBe(CARDS.length);
    expect(new Set(ORDERED_CARD_IDS).size).toBe(CARDS.length);
  });

  it('groups cards by set number, ascending', () => {
    let prevRank = -1;
    for (const id of ORDERED_CARD_IDS) {
      const card = BY_ID.get(id)!;
      const rank = getSetNumber(card.set) ?? Number.MAX_SAFE_INTEGER;
      expect(rank).toBeGreaterThanOrEqual(prevRank);
      prevRank = rank;
    }
  });

  it('places missions after characters within the same set', () => {
    const seenMissionInSet = new Set<string>();
    for (const id of ORDERED_CARD_IDS) {
      const card = BY_ID.get(id)!;
      if (card.card_type === 'mission') {
        seenMissionInSet.add(card.set);
      } else {
        expect(seenMissionInSet.has(card.set)).toBe(false);
      }
    }
  });

  it('includes mission cards and variant cards', () => {
    expect(ORDERED_CARD_IDS.some((id) => BY_ID.get(id)!.card_type === 'mission')).toBe(true);
    expect(ORDERED_CARD_IDS.some((id) => BY_ID.get(id)!.rarity === 'RA')).toBe(true);
  });
});

describe('prev/next navigation', () => {
  it('wraps circularly at the extremities', () => {
    const first = ORDERED_CARD_IDS[0];
    const last = ORDERED_CARD_IDS[ORDERED_CARD_IDS.length - 1];
    expect(getAdjacentCardIds(first).prev).toBe(last);
    expect(getAdjacentCardIds(last).next).toBe(first);
  });

  it('prev and next are inverse of each other', () => {
    for (const id of [ORDERED_CARD_IDS[0], ORDERED_CARD_IDS[5], ORDERED_CARD_IDS[ORDERED_CARD_IDS.length - 1]]) {
      const { next } = getAdjacentCardIds(id);
      expect(getAdjacentCardIds(next).prev).toBe(id);
      const { prev } = getAdjacentCardIds(id);
      expect(getAdjacentCardIds(prev).next).toBe(id);
    }
  });

  it('continues from the last card of a set to the first card of the next set', () => {
    const ksIds = ORDERED_CARD_IDS.filter((id) => BY_ID.get(id)!.set === 'KS');
    const ssIds = ORDERED_CARD_IDS.filter((id) => BY_ID.get(id)!.set === 'SS');
    if (ksIds.length > 0 && ssIds.length > 0) {
      const lastKs = ksIds[ksIds.length - 1];
      const firstSs = ssIds[0];
      expect(getAdjacentCardIds(lastKs).next).toBe(firstSs);
      expect(getAdjacentCardIds(firstSs).prev).toBe(lastKs);
    }
  });

  it('returns the same id for an unknown card (no crash)', () => {
    expect(getAdjacentCardIds('KS-DOES-NOT-EXIST')).toEqual({ prev: 'KS-DOES-NOT-EXIST', next: 'KS-DOES-NOT-EXIST' });
  });
});
