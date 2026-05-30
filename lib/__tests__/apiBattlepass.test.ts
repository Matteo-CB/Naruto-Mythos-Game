import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const findUniqueUser = vi.fn();
const variantInvFindMany = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
    },
    variantInventory: {
      findMany: (...a: unknown[]) => variantInvFindMany(...a),
    },
  },
}));

import { GET } from '@/app/api/battlepass/route';

describe('GET /api/battlepass', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findUniqueUser.mockReset();
    variantInvFindMany.mockReset();
    variantInvFindMany.mockResolvedValue([]);
  });

  it('returns 401 unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 if user not found', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-missing' } });
    findUniqueUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns full battlepass state for a fresh user (xp=0)', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-new' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 0,
      battlepassTier: 0,
      infiniteBoostersGranted: 0,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.xp).toBe(0);
    expect(body.tier).toBe(0);
    expect(body.tierCount).toBe(50);
    expect(body.tiers).toHaveLength(50);
    expect(body.tiers[0].tier).toBe(1);
    expect(body.tiers[0].xpRequired).toBe(200);
    expect(body.tiers[0].reached).toBe(false);
    expect(body.isMaxNamedTier).toBe(false);
  });

  it('marks tier 25 reward as the Kakashi 137 MV card', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 5000,
      battlepassTier: 25,
      infiniteBoostersGranted: 0,
    });
    variantInvFindMany.mockResolvedValue([{ cardId: 'KS-137-MV' }]);
    const res = await GET();
    const body = await res.json();
    const tier25 = body.tiers.find((t: { tier: number }) => t.tier === 25);
    expect(tier25.reward.type).toBe('card');
    expect(tier25.reward.cardId).toBe('KS-137-MV');
    expect(tier25.reward.cardOwned).toBe(true);
    expect(tier25.reward.cardClaimable).toBe(false);
    expect(tier25.reached).toBe(true);
  });

  it('marks tier 25 card as claimable when reached but not yet owned', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 5000,
      battlepassTier: 25,
      infiniteBoostersGranted: 0,
    });
    const res = await GET();
    const body = await res.json();
    const tier25 = body.tiers.find((t: { tier: number }) => t.tier === 25);
    expect(tier25.reward.cardClaimable).toBe(true);
    expect(tier25.reward.cardOwned).toBe(false);
  });

  it('tier 25 NOT claimable if not reached', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 200, battlepassTier: 1, infiniteBoostersGranted: 0,
    });
    const res = await GET();
    const body = await res.json();
    const tier25 = body.tiers.find((t: { tier: number }) => t.tier === 25);
    expect(tier25.reward.cardClaimable).toBe(false);
  });

  it('marks tier 50 reward as the 133 MV card', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 10000,
      battlepassTier: 50,
      infiniteBoostersGranted: 0,
    });
    const res = await GET();
    const body = await res.json();
    const tier50 = body.tiers.find((t: { tier: number }) => t.tier === 50);
    expect(tier50.reward.type).toBe('card');
    expect(tier50.reward.cardId).toBe('KS-133-MV');
    expect(tier50.reward.cardOwned).toBe(false);
    expect(body.isMaxNamedTier).toBe(true);
  });

  it('all tiers except 5, 25 and 50 grant a booster', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 0, battlepassTier: 0, infiniteBoostersGranted: 0,
    });
    const res = await GET();
    const body = await res.json();
    for (const t of body.tiers) {
      if (t.tier === 5 || t.tier === 25 || t.tier === 50) {
        expect(t.reward.type).toBe('card');
      } else {
        expect(t.reward.type).toBe('booster');
      }
    }
  });

  it('returns infinite tail data when past tier 50', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 10750,
      battlepassTier: 50,
      infiniteBoostersGranted: 1,
    });
    const res = await GET();
    const body = await res.json();
    expect(body.isMaxNamedTier).toBe(true);
    expect(body.infiniteBoostersEarned).toBe(1);
    expect(body.xpIntoCurrentInfiniteStep).toBe(250);
    expect(body.xpToNextInfiniteBooster).toBe(250);
  });
});
