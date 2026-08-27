import { describe, it, expect } from 'vitest';
import { isForceUnlockedCard, getForceUnlockedCardIds } from '@/lib/variants/forceUnlock';
import { applySetStatusOverrides } from '@/lib/data/sets/registry';

describe('force-unlock for not-yet-released (coming_soon / revealing) sets', () => {
  it('les promos du set 2 se gagnent maintenant que le set est sorti', () => {
    for (const id of ['SS-112-SPV', 'SS-122-SPV', 'SS-126-SPV', 'SS-120-CHIBIV', 'SS-147-POPV', 'SS-149-L']) {
      expect(isForceUnlockedCard(id), `${id} n est offert a personne`).toBe(false);
    }
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

  it('l enumeration ne contient aucune carte d un set sorti', () => {
    const ids = getForceUnlockedCardIds();
    for (const id of ['SS-112-SPV', 'SS-126-SPV', 'SS-149-L', 'KS-108-MV']) {
      expect(ids.has(id), `${id} se gagne`).toBe(false);
    }
  });
});
