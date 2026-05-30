import { describe, it, expect } from 'vitest';
import {
  computeTierState,
  tierForXp,
  xpRequiredForTier,
  tiersCrossed,
  infiniteBoostersDelta,
  infiniteBoostersTotalForXp,
} from '@/lib/battlepass/computeTier';
import {
  BATTLEPASS_INFINITE_STEP_XP,
  BATTLEPASS_MAX_NAMED_XP,
  BATTLEPASS_TIER_COUNT,
  BATTLEPASS_XP_PER_TIER,
} from '@/lib/battlepass/constants';
import { computeClaimable } from '@/lib/battlepass/claimRewards';
import { getTierReward } from '@/lib/battlepass/constants';

describe('battlepass tier math', () => {
  it('tier 0 at 0 XP', () => {
    expect(tierForXp(0)).toBe(0);
  });

  it('tier 1 at exactly 200 XP', () => {
    expect(tierForXp(199)).toBe(0);
    expect(tierForXp(200)).toBe(1);
  });

  it('linear ramp up to tier 50', () => {
    for (let t = 0; t <= BATTLEPASS_TIER_COUNT; t++) {
      expect(tierForXp(t * BATTLEPASS_XP_PER_TIER)).toBe(t);
    }
  });

  it('caps at tier 50 even with overflow XP', () => {
    expect(tierForXp(99999999)).toBe(BATTLEPASS_TIER_COUNT);
  });

  it('xpRequiredForTier(tier) is linear', () => {
    expect(xpRequiredForTier(1)).toBe(BATTLEPASS_XP_PER_TIER);
    expect(xpRequiredForTier(25)).toBe(25 * BATTLEPASS_XP_PER_TIER);
    expect(xpRequiredForTier(50)).toBe(BATTLEPASS_MAX_NAMED_XP);
  });
});

describe('computeTierState', () => {
  it('shows progress within a tier', () => {
    const s = computeTierState(450);
    expect(s.tier).toBe(2);
    expect(s.xpForCurrentTier).toBe(400);
    expect(s.xpForNextTier).toBe(600);
    expect(s.xpIntoCurrentTier).toBe(50);
    expect(s.xpToNext).toBe(150);
    expect(s.isMaxNamedTier).toBe(false);
    expect(s.infiniteBoostersEarned).toBe(0);
  });

  it('caps named track at tier 50', () => {
    const s = computeTierState(BATTLEPASS_MAX_NAMED_XP);
    expect(s.tier).toBe(BATTLEPASS_TIER_COUNT);
    expect(s.isMaxNamedTier).toBe(true);
    expect(s.xpForNextTier).toBeNull();
    expect(s.xpToNext).toBeNull();
    expect(s.infiniteBoostersEarned).toBe(0);
    expect(s.xpToNextInfiniteBooster).toBe(BATTLEPASS_INFINITE_STEP_XP);
  });

  it('grants 1 booster every 500 XP after tier 50', () => {
    const s1 = computeTierState(BATTLEPASS_MAX_NAMED_XP + 500);
    expect(s1.infiniteBoostersEarned).toBe(1);
    const s2 = computeTierState(BATTLEPASS_MAX_NAMED_XP + 1499);
    expect(s2.infiniteBoostersEarned).toBe(2);
    const s3 = computeTierState(BATTLEPASS_MAX_NAMED_XP + 1500);
    expect(s3.infiniteBoostersEarned).toBe(3);
  });
});

describe('tiersCrossed', () => {
  it('returns empty when no tier crossed', () => {
    expect(tiersCrossed(50, 100)).toEqual([]);
    expect(tiersCrossed(199, 199)).toEqual([]);
  });

  it('returns single tier when crossing one boundary', () => {
    expect(tiersCrossed(150, 250)).toEqual([1]);
  });

  it('returns multiple tiers crossed in one XP gain', () => {
    expect(tiersCrossed(0, 800)).toEqual([1, 2, 3, 4]);
  });

  it('caps at tier 50', () => {
    const r = tiersCrossed(0, BATTLEPASS_MAX_NAMED_XP + 5000);
    expect(r[r.length - 1]).toBe(BATTLEPASS_TIER_COUNT);
  });
});

describe('infiniteBoostersDelta', () => {
  it('returns 0 below tier 50', () => {
    expect(infiniteBoostersDelta(0, 5000)).toBe(0);
  });

  it('counts crossings of 500 XP past tier 50', () => {
    expect(infiniteBoostersDelta(BATTLEPASS_MAX_NAMED_XP - 100, BATTLEPASS_MAX_NAMED_XP + 600)).toBe(1);
    expect(infiniteBoostersDelta(BATTLEPASS_MAX_NAMED_XP, BATTLEPASS_MAX_NAMED_XP + 1500)).toBe(3);
  });

  it('infiniteBoostersTotalForXp is monotonic', () => {
    for (let xp = BATTLEPASS_MAX_NAMED_XP; xp <= BATTLEPASS_MAX_NAMED_XP + 5000; xp += 50) {
      const a = infiniteBoostersTotalForXp(xp);
      const b = infiniteBoostersTotalForXp(xp + 50);
      expect(b).toBeGreaterThanOrEqual(a);
    }
  });
});

describe('getTierReward', () => {
  it('tier 25 is a card reward', () => {
    expect(getTierReward(25).type).toBe('card');
    expect(getTierReward(25).cardId).toBeTruthy();
  });

  it('tier 50 is a card reward', () => {
    expect(getTierReward(50).type).toBe('card');
  });

  it('every other tier is a booster', () => {
    for (const t of [1, 2, 10, 24, 26, 49]) {
      expect(getTierReward(t).type).toBe('booster');
    }
  });
});

describe('computeClaimable', () => {
  it('returns nothing when nothing reached', () => {
    const r = computeClaimable(0, []);
    expect(r.unclaimedTiers).toEqual([]);
    expect(r.rewards).toEqual([]);
    expect(r.totalBoosters).toBe(0);
    expect(r.totalCards).toEqual([]);
  });

  it('returns all unclaimed tiers up to current', () => {
    const r = computeClaimable(800, []);
    expect(r.unclaimedTiers).toEqual([1, 2, 3, 4]);
    expect(r.totalBoosters).toBe(4);
    expect(r.totalCards).toEqual([]);
  });

  it('skips already-claimed tiers', () => {
    const r = computeClaimable(800, [1, 2]);
    expect(r.unclaimedTiers).toEqual([3, 4]);
    expect(r.totalBoosters).toBe(2);
  });

  it('separates card rewards (tier 25 and 50)', () => {
    const r = computeClaimable(5200, []);
    expect(r.totalCards).toContain('KS-133_2-MV');
    expect(r.unclaimedTiers).toContain(25);
  });
});
