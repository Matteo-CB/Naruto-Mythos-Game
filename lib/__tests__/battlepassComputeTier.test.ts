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
    expect(xpRequiredForTier(BATTLEPASS_TIER_COUNT)).toBe(BATTLEPASS_MAX_NAMED_XP);
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
  it('un palier multiple de quatre offre un chibi', () => {
    for (const t of [4, 8, 12, 56]) {
      expect(getTierReward(t).type, `palier ${t}`).toBe('card');
      expect(getTierReward(t).cardId, `palier ${t}`).toMatch(/CHIBIV$/);
    }
  });

  it('le tout dernier palier offre le chibi de SASUKE', () => {
    const dernier = getTierReward(BATTLEPASS_TIER_COUNT);
    expect(dernier.cardId, 'la recompense finale de la saison').toBe('SS-126-CHIBIV');
  });

  it('un palier multiple de cinq ajoute le booster de Konoha Shido', () => {
    for (const t of [5, 10, 25, 50]) {
      expect(getTierReward(t).boosterSetIds, `palier ${t}`).toEqual(['SS', 'KS']);
    }
  });

  it('tous les autres paliers donnent un seul booster Shinobi Shiren', () => {
    for (const t of [1, 2, 6, 9, 23, 49]) {
      expect(getTierReward(t).type, `palier ${t}`).toBe('booster');
      expect(getTierReward(t).boosterSetIds, `palier ${t}`).toEqual(['SS']);
    }
  });

  it('chaque palier de la saison donne au moins un booster', () => {
    for (let t = 1; t <= BATTLEPASS_TIER_COUNT; t += 1) {
      expect(getTierReward(t).boosterSetIds.length, `palier ${t}`).toBeGreaterThanOrEqual(1);
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
    expect(r.totalBoosters, 'un booster par palier, aucun multiple de cinq ici').toBe(4);
    expect(r.totalCards, 'le palier 4 porte le premier chibi').toEqual(['SS-031-CHIBIV']);
  });

  it('skips already-claimed tiers', () => {
    const r = computeClaimable(800, [1, 2]);
    expect(r.unclaimedTiers).toEqual([3, 4]);
    expect(r.totalBoosters).toBe(2);
  });

  it('les chibis reclamables sont listes a part des boosters', () => {
    const r = computeClaimable(5200, []);
    expect(r.totalCards, 'le premier chibi de la saison').toContain('SS-031-CHIBIV');
    expect(r.unclaimedTiers).toContain(25);
    expect(r.totalBoosters, 'les doubles boosters comptent pour deux').toBeGreaterThan(r.unclaimedTiers.length);
  });
});
