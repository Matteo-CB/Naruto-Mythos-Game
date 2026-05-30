import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueUser = vi.fn();
const updateUser = vi.fn();
const upsertInventory = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
    boosterInventory: {
      upsert: (...a: unknown[]) => upsertInventory(...a),
    },
  },
}));

import { awardXp } from '@/lib/battlepass/awardXp';

describe('awardXp', () => {
  beforeEach(() => {
    findUniqueUser.mockReset();
    updateUser.mockReset();
    upsertInventory.mockReset();
  });

  it('returns early with current state if xp <= 0', async () => {
    findUniqueUser.mockResolvedValue({ battlepassXp: 500, battlepassTier: 2 });
    const r = await awardXp('u1', 0);
    expect(r.newXp).toBe(500);
    expect(r.tiersAutoClaimed).toEqual([]);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('throws on unknown user', async () => {
    findUniqueUser
      .mockResolvedValueOnce({ battlepassXp: 0, battlepassTier: 0, infiniteBoostersGranted: 0 });
    findUniqueUser.mockResolvedValueOnce(null);
    await expect(awardXp('u1', 100)).resolves.toBeTruthy();
    findUniqueUser.mockReset();
    findUniqueUser.mockResolvedValue(null);
    await expect(awardXp('ghost', 100)).rejects.toThrow();
  });

  it('adds xp without crossing a tier', async () => {
    findUniqueUser.mockResolvedValue({
      battlepassXp: 100, battlepassTier: 0, infiniteBoostersGranted: 0,
    });
    updateUser.mockResolvedValue({});
    const r = await awardXp('u1', 50);
    expect(r.newXp).toBe(150);
    expect(r.tiersAutoClaimed).toEqual([]);
    expect(r.boostersGranted).toBe(0);
    expect(upsertInventory).not.toHaveBeenCalled();
  });

  it('crosses tier 1 and grants 1 booster', async () => {
    findUniqueUser.mockResolvedValue({
      battlepassXp: 100, battlepassTier: 0, infiniteBoostersGranted: 0,
    });
    updateUser.mockResolvedValue({});
    upsertInventory.mockResolvedValue({ count: 1 });
    const r = await awardXp('u1', 150);
    expect(r.newXp).toBe(250);
    expect(r.tiersAutoClaimed).toEqual([1]);
    expect(r.boostersGranted).toBe(1);
    expect(upsertInventory).toHaveBeenCalledTimes(1);
  });

  it('crosses multiple tiers atomically', async () => {
    findUniqueUser.mockResolvedValue({
      battlepassXp: 0, battlepassTier: 0, infiniteBoostersGranted: 0,
    });
    updateUser.mockResolvedValue({});
    upsertInventory.mockResolvedValue({ count: 1 });
    const r = await awardXp('u1', 800);
    expect(r.newXp).toBe(800);
    expect(r.tiersAutoClaimed).toEqual([1, 2, 3, 4]);
    expect(r.boostersGranted).toBe(4);
  });

  it('does NOT auto-unlock tier 25 card on crossing (player must claim manually)', async () => {
    findUniqueUser.mockResolvedValue({
      battlepassXp: 4800, battlepassTier: 24, infiniteBoostersGranted: 0,
    });
    updateUser.mockResolvedValue({});
    upsertInventory.mockResolvedValue({ count: 1 });
    const r = await awardXp('u1', 400);
    expect(r.tiersAutoClaimed).toContain(25);
    expect(r.cardsUnlocked).not.toContain('KS-133_2-MV');
    expect(r.cardsUnlocked).toEqual([]);
  });

  it('does NOT auto-unlock tier 50 card on crossing (player must claim manually)', async () => {
    findUniqueUser.mockResolvedValue({
      battlepassXp: 9800, battlepassTier: 49, infiniteBoostersGranted: 0,
    });
    updateUser.mockResolvedValue({});
    upsertInventory.mockResolvedValue({ count: 1 });
    const r = await awardXp('u1', 200);
    expect(r.tiersAutoClaimed).toContain(50);
    expect(r.cardsUnlocked).not.toContain('KS-133-MV');
    expect(r.cardsUnlocked).toEqual([]);
  });

  it('grants infinite boosters past tier 50', async () => {
    findUniqueUser.mockResolvedValue({
      battlepassXp: 10000, battlepassTier: 50, infiniteBoostersGranted: 0,
    });
    updateUser.mockResolvedValue({});
    upsertInventory.mockResolvedValue({ count: 5 });
    const r = await awardXp('u1', 1500);
    expect(r.infiniteBoostersFromTail).toBe(3);
    expect(r.boostersGranted).toBe(3);
  });
});
