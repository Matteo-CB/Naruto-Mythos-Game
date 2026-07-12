import { describe, it, expect } from 'vitest';
import {
  VARIANT_RARITIES,
  VARIANT_PACK_PROBABILITIES,
  BOOSTER_EXCLUDED_VARIANTS,
  TOURNAMENT_PRIZE_CARD_IDS,
  BATTLEPASS_TIER_5_CARD,
  BATTLEPASS_TIER_25_CARD,
  BATTLEPASS_TIER_50_CARD,
  DUPLICATE_XP_BY_RARITY,
  isVariantRarity,
} from '@/lib/variants/constants';

describe('variants constants', () => {
  it('lists all 4 variant rarities', () => {
    expect(VARIANT_RARITIES).toEqual(['RA', 'MV', 'SV', 'L']);
  });

  it('probabilities sum to 1', () => {
    const sum =
      VARIANT_PACK_PROBABILITIES.L +
      VARIANT_PACK_PROBABILITIES.SV +
      VARIANT_PACK_PROBABILITIES.MV +
      VARIANT_PACK_PROBABILITIES.RA +
      VARIANT_PACK_PROBABILITIES.HOLO_C +
      VARIANT_PACK_PROBABILITIES.HOLO_UC;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('rarest rarities have lowest probability', () => {
    expect(VARIANT_PACK_PROBABILITIES.SV).toBeLessThan(VARIANT_PACK_PROBABILITIES.L);
    expect(VARIANT_PACK_PROBABILITIES.L).toBeLessThan(VARIANT_PACK_PROBABILITIES.MV);
    expect(VARIANT_PACK_PROBABILITIES.MV).toBeLessThan(VARIANT_PACK_PROBABILITIES.RA);
    expect(VARIANT_PACK_PROBABILITIES.RA).toBeLessThan(VARIANT_PACK_PROBABILITIES.HOLO_UC);
    expect(VARIANT_PACK_PROBABILITIES.HOLO_UC).toBeLessThan(VARIANT_PACK_PROBABILITIES.HOLO_C);
  });

  it('excludes every tournament prize MV + 3 battlepass MVs', () => {
    expect(BOOSTER_EXCLUDED_VARIANTS.size).toBe(TOURNAMENT_PRIZE_CARD_IDS.length + 3);
    for (const id of TOURNAMENT_PRIZE_CARD_IDS) {
      expect(BOOSTER_EXCLUDED_VARIANTS.has(id)).toBe(true);
    }
    expect(BOOSTER_EXCLUDED_VARIANTS.has(BATTLEPASS_TIER_5_CARD)).toBe(true);
    expect(BOOSTER_EXCLUDED_VARIANTS.has(BATTLEPASS_TIER_25_CARD)).toBe(true);
    expect(BOOSTER_EXCLUDED_VARIANTS.has(BATTLEPASS_TIER_50_CARD)).toBe(true);
  });

  it('duplicate XP scales with rarity', () => {
    expect(DUPLICATE_XP_BY_RARITY.RA).toBe(10);
    expect(DUPLICATE_XP_BY_RARITY.MV).toBe(50);
    expect(DUPLICATE_XP_BY_RARITY.SV).toBe(200);
    expect(DUPLICATE_XP_BY_RARITY.L).toBe(1000);
  });

  it('isVariantRarity recognizes variant rarities', () => {
    expect(isVariantRarity('RA')).toBe(true);
    expect(isVariantRarity('MV')).toBe(true);
    expect(isVariantRarity('SV')).toBe(true);
    expect(isVariantRarity('L')).toBe(true);
    expect(isVariantRarity('C')).toBe(false);
    expect(isVariantRarity('R')).toBe(false);
    expect(isVariantRarity('M')).toBe(false);
    expect(isVariantRarity(null)).toBe(false);
    expect(isVariantRarity(undefined)).toBe(false);
  });
});
