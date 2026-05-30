import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';
import { VARIANT_PACK_SIZE } from '@/lib/variants/constants';

function mockCard(id: string, rarity: Rarity, set = 'KS'): CardData {
  return {
    id, cardId: id, set, number: 0,
    name_fr: id, title_fr: '',
    rarity, card_type: 'character', has_visual: true,
    chakra: 1, power: 1, keywords: [], group: '', effects: [],
  };
}

vi.mock('@/lib/data/cardLoader', () => ({
  getAllCards: () => [
    mockCard('KS-104-RA', 'RA'),
    mockCard('KS-105-RA', 'RA'),
    mockCard('KS-106-RA', 'RA'),
    mockCard('KS-111-MV', 'MV'),
    mockCard('KS-117-L', 'L'),
    mockCard('KS-140-SV', 'SV'),
  ],
}));

const findUserUnique = vi.fn();
const updateUser = vi.fn();
const updateManyInventory = vi.fn();
const findUniqueInventory = vi.fn();
const upsertInventory = vi.fn();
const findManyInventory = vi.fn();
const variantInvFindMany = vi.fn();
const variantInvUpsert = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUserUnique(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
    boosterInventory: {
      updateMany: (...a: unknown[]) => updateManyInventory(...a),
      findUnique: (...a: unknown[]) => findUniqueInventory(...a),
      upsert: (...a: unknown[]) => upsertInventory(...a),
      findMany: (...a: unknown[]) => findManyInventory(...a),
    },
    variantInventory: {
      findMany: (...a: unknown[]) => variantInvFindMany(...a),
      upsert: (...a: unknown[]) => variantInvUpsert(...a),
    },
  },
}));

import {
  openBooster,
  grantBoosters,
  getInventoryForUser,
  NoBoosterError,
  UnknownUserError,
} from '@/lib/boosters/openBooster';
import { clearVariantPoolCache } from '@/lib/variants/variantPool';

describe('openBooster', () => {
  beforeEach(() => {
    findUserUnique.mockReset();
    updateUser.mockReset();
    updateManyInventory.mockReset();
    findUniqueInventory.mockReset();
    upsertInventory.mockReset();
    findManyInventory.mockReset();
    variantInvFindMany.mockReset();
    variantInvUpsert.mockReset();
    variantInvFindMany.mockResolvedValue([]);
    variantInvUpsert.mockResolvedValue({ count: 1 });
    clearVariantPoolCache();
  });

  it('throws UnknownUserError when user does not exist', async () => {
    findUserUnique.mockResolvedValue(null);
    await expect(openBooster('ghost', 'KS')).rejects.toBeInstanceOf(UnknownUserError);
  });

  it('throws NoBoosterError when count is 0', async () => {
    findUserUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    updateManyInventory.mockResolvedValue({ count: 0 });
    await expect(openBooster('u1', 'KS')).rejects.toBeInstanceOf(NoBoosterError);
  });

  it('decrements inventory by exactly 1 on success', async () => {
    findUserUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    updateManyInventory.mockResolvedValue({ count: 1 });
    updateUser.mockResolvedValue({});
    findUniqueInventory.mockResolvedValue({ count: 6 });

    await openBooster('u1', 'KS');

    expect(updateManyInventory).toHaveBeenCalledTimes(1);
    const args = updateManyInventory.mock.calls[0][0];
    expect(args.where).toMatchObject({ userId: 'u1', setId: 'KS', count: { gt: 0 } });
    expect(args.data).toMatchObject({ count: { decrement: 1 } });
  });

  it('returns 3 cards from the eligible pool', async () => {
    findUserUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    updateManyInventory.mockResolvedValue({ count: 1 });
    updateUser.mockResolvedValue({});
    findUniqueInventory.mockResolvedValue({ count: 4 });

    const r = await openBooster('u1', 'KS');
    expect(r.cards).toHaveLength(VARIANT_PACK_SIZE);
    for (const c of r.cards) {
      expect(['RA', 'MV', 'SV', 'L']).toContain(c.rarity);
      expect(c.set).toBe('KS');
    }
  });

  it('increments variant inventory for each card (new and duplicate)', async () => {
    findUserUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    variantInvFindMany.mockResolvedValue([{ cardId: 'KS-104-RA' }]);
    updateManyInventory.mockResolvedValue({ count: 1 });
    findUniqueInventory.mockResolvedValue({ count: 0 });

    const r = await openBooster('u1', 'KS', { mode: 'forceL' });

    expect(variantInvUpsert).toHaveBeenCalledTimes(VARIANT_PACK_SIZE);
    expect(r.cards.some((c) => c.cardId === 'KS-117-L')).toBe(true);
    expect(r.newCardIds).toContain('KS-117-L');
  });

  it('increments inventory even when all rolled cards are duplicates', async () => {
    const allVariantIds = ['KS-104-RA', 'KS-105-RA', 'KS-106-RA', 'KS-111-MV', 'KS-117-L', 'KS-140-SV'];
    findUserUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    variantInvFindMany.mockResolvedValue(allVariantIds.map((cardId) => ({ cardId })));
    updateManyInventory.mockResolvedValue({ count: 1 });
    findUniqueInventory.mockResolvedValue({ count: 0 });

    const r = await openBooster('u1', 'KS');
    expect(r.duplicateCardIds.length).toBe(VARIANT_PACK_SIZE);
    expect(r.newCardIds).toEqual([]);
    expect(variantInvUpsert).toHaveBeenCalledTimes(VARIANT_PACK_SIZE);
  });

  it('admins also decrement their booster inventory (no bypass)', async () => {
    findUserUnique.mockResolvedValue({ username: 'Kutxyt', email: 'whatever@x.com' });
    updateUser.mockResolvedValue({});
    updateManyInventory.mockResolvedValue({ count: 1 });
    findUniqueInventory.mockResolvedValue({ count: 0 });

    const r = await openBooster('admin-id', 'KS');
    expect(updateManyInventory).toHaveBeenCalled();
    expect(r.cards).toHaveLength(VARIANT_PACK_SIZE);
  });

  it('admin with no boosters left is refused too', async () => {
    findUserUnique.mockResolvedValue({ username: 'Kutxyt', email: 'whatever@x.com' });
    updateManyInventory.mockResolvedValue({ count: 0 });

    await expect(openBooster('admin-id', 'KS')).rejects.toMatchObject({ code: 'NO_BOOSTER' });
  });

  it('never rolls excluded cards (booster exclusion list)', async () => {
    findUserUnique.mockResolvedValue({ username: 'a', email: 'a@b.com' });
    updateManyInventory.mockResolvedValue({ count: 1 });
    updateUser.mockResolvedValue({});
    findUniqueInventory.mockResolvedValue({ count: 0 });

    for (let i = 0; i < 30; i++) {
      const r = await openBooster('u1', 'KS');
      for (const c of r.cards) {
        expect(['KS-108-MV', 'KS-120-MV', 'KS-128-MV', 'KS-137-MV', 'KS-133-MV', 'KS-133_2-MV']).not.toContain(c.cardId);
      }
    }
  });
});

describe('grantBoosters', () => {
  beforeEach(() => {
    upsertInventory.mockReset();
  });

  it('upserts with positive quantity', async () => {
    upsertInventory.mockResolvedValue({ count: 5 });
    const r = await grantBoosters('u1', 'KS', 3);
    expect(r.newCount).toBe(5);
    expect(upsertInventory).toHaveBeenCalledTimes(1);
  });

  it('throws on non-positive quantity', async () => {
    await expect(grantBoosters('u1', 'KS', 0)).rejects.toThrow();
    await expect(grantBoosters('u1', 'KS', -2)).rejects.toThrow();
  });
});

describe('getInventoryForUser', () => {
  beforeEach(() => {
    findManyInventory.mockReset();
  });

  it('returns mapped inventory rows', async () => {
    findManyInventory.mockResolvedValue([
      { setId: 'KS', count: 7 },
      { setId: 'SS', count: 2 },
    ]);
    const r = await getInventoryForUser('u1');
    expect(r).toEqual([
      { setId: 'KS', count: 7 },
      { setId: 'SS', count: 2 },
    ]);
  });

  it('returns empty array when user has no inventory rows', async () => {
    findManyInventory.mockResolvedValue([]);
    const r = await getInventoryForUser('u1');
    expect(r).toEqual([]);
  });
});
