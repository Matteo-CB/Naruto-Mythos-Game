import { describe, it, expect } from 'vitest';
import { STATIC_RANKED_BANNED_CARD_IDS, isStaticRankedBanned } from '@/lib/data/rankedBans';
import { getAllCards } from '@/lib/data/cardLoader';
import { isSetRankedLegal, ALL_SET_IDS, getSetStatus } from '@/lib/data/sets/registry';

describe('plus aucune carte publiee n est bannie du classe', () => {
  it('la liste de bannissement est vide', () => {
    expect(STATIC_RANKED_BANNED_CARD_IDS.size).toBe(0);
  });

  it('aucune carte du catalogue n est refusee en classe', () => {
    const bannies = getAllCards().filter((c) => isStaticRankedBanned(c.id));
    expect(bannies.map((c) => c.id), 'aucune carte ne doit rester bannie').toEqual([]);
  });

  it('les deux sets publies sont legaux en classe', () => {
    expect(isSetRankedLegal('KS')).toBe(true);
    expect(isSetRankedLegal('SS')).toBe(true);
  });

  it('un set non publie resterait ecarte, la regle structurelle est conservee', () => {
    const nonPublies = ALL_SET_IDS.filter((id) => getSetStatus(id) !== 'available');
    for (const id of nonPublies) {
      expect(isSetRankedLegal(id), `${id} n est pas publie`).toBe(false);
    }
  });
});
