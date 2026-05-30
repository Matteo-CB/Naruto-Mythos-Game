import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';

function mockCard(id: string, rarity: Rarity): CardData {
  return {
    id, cardId: id, set: 'KS', number: 0,
    name_fr: id, title_fr: '',
    rarity, card_type: 'character', has_visual: true,
    chakra: 1, power: 1, keywords: [], group: '', effects: [],
  };
}

const CARDS_BY_ID: Record<string, CardData> = {
  'KS-104-R': mockCard('KS-104-R', 'R'),
  'KS-104-RA': mockCard('KS-104-RA', 'RA'),
  'KS-117-L': mockCard('KS-117-L', 'L'),
  'KS-133-MV': mockCard('KS-133-MV', 'MV'),
  'KS-140-SV': mockCard('KS-140-SV', 'SV'),
};

vi.mock('@/lib/data/cardIndex', () => ({
  getCardById: (id: string) => CARDS_BY_ID[id] ?? null,
}));

const fakeFindUnique = vi.fn();
const fakeInvFindMany = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => fakeFindUnique(...args) },
    variantInventory: { findMany: (...args: unknown[]) => fakeInvFindMany(...args) },
  },
}));

import { validateDeckVariantUnlocks } from '@/lib/variants/serverValidation';

describe('validateDeckVariantUnlocks', () => {
  beforeEach(() => {
    fakeFindUnique.mockReset();
    fakeInvFindMany.mockReset();
    fakeInvFindMany.mockResolvedValue([]);
  });

  it('returns ok when deck has no variants (no DB call needed)', async () => {
    const r = await validateDeckVariantUnlocks('user-1', ['KS-104-R', 'KS-104-R', 'KS-104-R']);
    expect(r.ok).toBe(true);
    expect(r.lockedCardIds).toEqual([]);
    expect(fakeFindUnique).not.toHaveBeenCalled();
  });

  it('returns ok when user owns all variants in deck', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    fakeInvFindMany.mockResolvedValue([
      { cardId: 'KS-104-RA' },
      { cardId: 'KS-133-MV' },
    ]);
    const r = await validateDeckVariantUnlocks('user-1', ['KS-104-RA', 'KS-133-MV', 'KS-104-R']);
    expect(r.ok).toBe(true);
  });

  it('rejects with the locked card ids when user is missing one or more variants', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'bob', email: 'b@c.com' });
    fakeInvFindMany.mockResolvedValue([{ cardId: 'KS-104-RA' }]);
    const r = await validateDeckVariantUnlocks('user-1', ['KS-104-RA', 'KS-117-L', 'KS-140-SV']);
    expect(r.ok).toBe(false);
    expect(r.lockedCardIds.sort()).toEqual(['KS-117-L', 'KS-140-SV']);
  });

  it('bypass for admin username (Kutxyt)', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'Kutxyt', email: 'admin@b.com' });
    const r = await validateDeckVariantUnlocks('user-1', ['KS-117-L', 'KS-140-SV']);
    expect(r.ok).toBe(true);
    expect(r.lockedCardIds).toEqual([]);
  });

  it('bypass for admin email', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'normaluser', email: 'matteo.biyikli3224@gmail.com' });
    const r = await validateDeckVariantUnlocks('user-1', ['KS-117-L']);
    expect(r.ok).toBe(true);
  });

  it('returns not-ok if the user does not exist (defensive)', async () => {
    fakeFindUnique.mockResolvedValue(null);
    const r = await validateDeckVariantUnlocks('ghost', ['KS-117-L']);
    expect(r.ok).toBe(false);
    expect(r.lockedCardIds).toEqual(['KS-117-L']);
  });

  it('treats unknown card ids as non-variants (no DB lookup, no false reject)', async () => {
    const r = await validateDeckVariantUnlocks('user-1', ['ZZ-999-XX', 'KS-104-R']);
    expect(r.ok).toBe(true);
    expect(fakeFindUnique).not.toHaveBeenCalled();
  });
});
