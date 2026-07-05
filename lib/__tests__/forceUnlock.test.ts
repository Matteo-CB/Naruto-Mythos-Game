import { describe, it, expect } from 'vitest';
import { isForceUnlockedCard, getForceUnlockedCardIds } from '@/lib/variants/forceUnlock';

describe('force-unlock for pre-release (coming_soon) sets', () => {
  it('unlocks every Set 2 (SS) card, variants included, while the set is coming_soon', () => {
    expect(isForceUnlockedCard('SS-112-SPV')).toBe(true);
    expect(isForceUnlockedCard('SS-122-SPV')).toBe(true);
    expect(isForceUnlockedCard('SS-126-SPV')).toBe(true);
    expect(isForceUnlockedCard('SS-120-CHIBIV')).toBe(true);
    expect(isForceUnlockedCard('SS-147-POPV')).toBe(true);
    expect(isForceUnlockedCard('SS-000-L')).toBe(true);
    expect(isForceUnlockedCard('SS-121-R')).toBe(true);
  });

  it('does NOT force-unlock locked variants from an available set (KS)', () => {
    expect(isForceUnlockedCard('KS-108-MV')).toBe(false);
    expect(isForceUnlockedCard('KS-133-L')).toBe(false);
    expect(isForceUnlockedCard('KS-108-RA')).toBe(false);
  });

  it('getForceUnlockedCardIds enumerates all SS cards but no KS variant', () => {
    const ids = getForceUnlockedCardIds();
    expect(ids.has('SS-112-SPV')).toBe(true);
    expect(ids.has('SS-126-SPV')).toBe(true);
    expect(ids.has('SS-000-L')).toBe(true);
    expect(ids.has('KS-108-MV')).toBe(false);
  });
});
