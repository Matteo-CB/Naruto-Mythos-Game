import { BATTLEPASS_TIER_COUNT, BATTLEPASS_MAX_NAMED_XP } from '@/lib/battlepass/constants';
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
    expect(body.tierCount).toBe(BATTLEPASS_TIER_COUNT);
    expect(body.tiers).toHaveLength(BATTLEPASS_TIER_COUNT);
    expect(body.tiers[0].tier).toBe(1);
    expect(body.tiers[0].xpRequired).toBe(200);
    expect(body.tiers[0].reached).toBe(false);
    expect(body.isMaxNamedTier).toBe(false);
  });

  it('un palier a chibi expose la carte, possedee', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 5000,
      battlepassTier: 25,
      infiniteBoostersGranted: 0,
    });
    variantInvFindMany.mockResolvedValue([{ cardId: 'SS-115-CHIBIV' }]);
    const res = await GET();
    const body = await res.json();
    const tier25 = body.tiers.find((t: { tier: number }) => t.tier === 24);
    expect(tier25.reward.type).toBe('card');
    expect(tier25.reward.cardId).toBe('SS-115-CHIBIV');
    expect(tier25.reward.cardOwned).toBe(true);
    expect(tier25.reward.cardClaimable).toBe(false);
    expect(tier25.reached).toBe(true);
  });

  it('un chibi atteint mais non possede est reclamable', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 5000,
      battlepassTier: 25,
      infiniteBoostersGranted: 0,
    });
    const res = await GET();
    const body = await res.json();
    const tier25 = body.tiers.find((t: { tier: number }) => t.tier === 24);
    expect(tier25.reward.cardClaimable).toBe(true);
    expect(tier25.reward.cardOwned).toBe(false);
  });

  it('un chibi non atteint n est pas reclamable', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 200, battlepassTier: 1, infiniteBoostersGranted: 0,
    });
    const res = await GET();
    const body = await res.json();
    const tier25 = body.tiers.find((t: { tier: number }) => t.tier === 24);
    expect(tier25.reward.cardClaimable).toBe(false);
  });

  it('le tout dernier palier expose le chibi de SASUKE', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: BATTLEPASS_MAX_NAMED_XP,
      battlepassTier: BATTLEPASS_TIER_COUNT,
      infiniteBoostersGranted: 0,
    });
    const res = await GET();
    const body = await res.json();
    const dernier = body.tiers.find((t: { tier: number }) => t.tier === BATTLEPASS_TIER_COUNT);
    expect(dernier.reward.type).toBe('card');
    expect(dernier.reward.cardId).toBe('SS-126-CHIBIV');
    expect(dernier.reward.cardOwned).toBe(false);
    expect(body.isMaxNamedTier).toBe(true);
  });

  it('un palier multiple de quatre donne une carte, les autres un booster', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: 0, battlepassTier: 0, infiniteBoostersGranted: 0,
    });
    const res = await GET();
    const body = await res.json();
    for (const t of body.tiers) {
      expect(t.reward.type, `palier ${t.tier}`).toBe(t.tier % 4 === 0 ? 'card' : 'booster');
    }
  });

  it('la queue infinie demarre apres le dernier palier', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    findUniqueUser.mockResolvedValue({
      battlepassXp: BATTLEPASS_MAX_NAMED_XP + 750,
      battlepassTier: BATTLEPASS_TIER_COUNT,
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
