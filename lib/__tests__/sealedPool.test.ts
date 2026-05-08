import { describe, it, expect } from 'vitest';
import { generateSealedPool, generateBooster, separateSealedPool } from '../sealed/boosterGenerator';

describe('generateSealedPool — invariants', () => {
  it('produces N boosters when given boosterCount=N', () => {
    for (const n of [4, 5, 6]) {
      const pool = generateSealedPool(n);
      expect(pool.boosters.length).toBe(n);
    }
  });

  it('default boosterCount is 6', () => {
    const pool = generateSealedPool();
    expect(pool.boosters.length).toBe(6);
  });

  it('allCards array length equals sum of booster.cards lengths', () => {
    const pool = generateSealedPool(5);
    const expected = pool.boosters.reduce((acc, b) => acc + b.cards.length, 0);
    expect(pool.allCards.length).toBe(expected);
  });

  it('every card has a unique sealedInstanceId across the whole pool', () => {
    const pool = generateSealedPool(6);
    const ids = pool.allCards.map((c) => c.sealedInstanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('separateSealedPool divides correctly into characters and missions', () => {
    const pool = generateSealedPool(5);
    const sep = separateSealedPool(pool);
    expect(sep.characters.length + sep.missions.length).toBe(pool.allCards.length);
    for (const c of sep.characters) {
      expect(c.card_type).toBe('character');
    }
    for (const m of sep.missions) {
      expect(m.card_type).toBe('mission');
    }
  });
});

describe('generateBooster — structure', () => {
  it('produces exactly 10 cards (4C + 3UC + 1R + 1H + 1M)', () => {
    const b = generateBooster(0);
    expect(b.cards.length).toBe(10);
  });

  it('contains exactly one mission card', () => {
    const b = generateBooster(0);
    const missions = b.cards.filter((c) => c.card_type === 'mission');
    expect(missions.length).toBe(1);
  });

  it('boosterIndex is preserved', () => {
    const b = generateBooster(3);
    expect(b.boosterIndex).toBe(3);
  });
});

describe('generateSealedPool — instance ID format', () => {
  it('every sealedInstanceId starts with "sealed-"', () => {
    const pool = generateSealedPool(3);
    for (const c of pool.allCards) {
      expect(c.sealedInstanceId.startsWith('sealed-')).toBe(true);
    }
  });

  it('isHolo is set on the rare slot in each booster', () => {
    const pool = generateSealedPool(3);
    for (const b of pool.boosters) {
      const holos = b.cards.filter((c) => c.isHolo);
      expect(holos.length).toBeGreaterThanOrEqual(1);
    }
  });
});
