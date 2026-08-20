import { describe, it, expect } from 'vitest';
import { generateSealedPool, generateBooster } from '@/lib/sealed/boosterGenerator';

describe('sealed booster: IRL composition + ephemeral variants', () => {
  it('booster has the real-booster composition of 10 cards (no bonus variant slot)', () => {
    const booster = generateBooster(0, 'KS');
    expect(booster.cards.length).toBe(10);
  });

  it('any card flagged as a temporary variant has a variant rarity', () => {
    const pool = generateSealedPool(30, 'KS');
    for (const booster of pool.boosters) {
      for (const v of booster.cards.filter((c) => c.isTemporaryVariant)) {
        expect(['RA', 'MV', 'SV', 'L']).toContain(v.rarity);
        expect(v.isHolo).toBe(false);
      }
    }
  });

  it('temporary variants are tracked in pool.temporaryVariants', () => {
    const pool = generateSealedPool(30, 'KS');
    const flagged = pool.allCards.filter((c) => c.isTemporaryVariant).map((c) => c.id).sort();
    expect([...pool.temporaryVariants].sort()).toEqual(flagged);
  });

  it('a variant stays exceptional, at the rate printed on the notice', () => {
    const pool = generateSealedPool(100, 'KS');
    expect(
      pool.temporaryVariants.length,
      'one legendary in eight hundred packs, one numbered secret in four thousand',
    ).toBeLessThanOrEqual(2);
    for (const id of pool.temporaryVariants) {
      const carte = pool.allCards.find((c) => c.id === id)!;
      expect(['L', 'SV'], `${id} is not a Konoha Shido chase rarity`).toContain(carte.rarity);
    }
  });

  it('non-variant cards have isTemporaryVariant=false', () => {
    const pool = generateSealedPool(5, 'KS');
    for (const booster of pool.boosters) {
      for (const c of booster.cards.filter((c) => !['RA', 'MV', 'SV', 'L'].includes(c.rarity))) {
        expect(c.isTemporaryVariant).toBe(false);
      }
    }
  });

  it('reserved excluded variants never appear in a sealed pool', () => {
    const pool = generateSealedPool(50, 'KS');
    const excludedIds = new Set([
      'KS-108-MV', 'KS-120-MV', 'KS-128-MV', 'KS-137-MV',
      'KS-133-MV', 'KS-133_2-MV',
    ]);
    for (const id of pool.temporaryVariants) {
      expect(excludedIds.has(id)).toBe(false);
    }
  });

  it('all cards have a unique sealedInstanceId', () => {
    const pool = generateSealedPool(5, 'KS');
    const ids = new Set(pool.allCards.map((c) => c.sealedInstanceId));
    expect(ids.size).toBe(pool.allCards.length);
  });
});
