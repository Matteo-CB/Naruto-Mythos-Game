import { describe, it, expect } from 'vitest';
import { isForceUnlockedCard, getForceUnlockedCardIds } from '@/lib/variants/forceUnlock';
import { applySetStatusOverrides } from '@/lib/data/sets/registry';

describe('force-unlock for not-yet-released (coming_soon / revealing) sets', () => {
  it('keeps the Set 2 promo variants unlocked now that the set is released', () => {
    expect(isForceUnlockedCard('SS-112-SPV')).toBe(true);
    expect(isForceUnlockedCard('SS-122-SPV')).toBe(true);
    expect(isForceUnlockedCard('SS-126-SPV')).toBe(true);
    expect(isForceUnlockedCard('SS-120-CHIBIV')).toBe(true);
    expect(isForceUnlockedCard('SS-147-POPV')).toBe(true);
    expect(isForceUnlockedCard('SS-000-L')).toBe(true);
  });

  it('unlocks every card of a set that is still being revealed', () => {
    applySetStatusOverrides({ SS: 'revealing' });
    expect(isForceUnlockedCard('SS-121-R')).toBe(true);
    expect(isForceUnlockedCard('SS-046-UC')).toBe(true);
    applySetStatusOverrides(null);
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
