import { describe, it, expect } from 'vitest';
import { isLockedVariantCard } from '@/lib/variants/isVariant';
import { isForceUnlockedCard } from '@/lib/variants/forceUnlock';
import { getCardById } from '@/lib/data/cardIndex';
import { allCardData } from '@/lib/data/sets';
import type { CardData } from '@/lib/engine/types';

describe('les variantes du set 2 sont ouvertes a tout le monde', () => {
  it('aucune carte du set 2 n_est verrouillee, quelle que soit sa rarete', () => {
    const verrouillees = Object.values(allCardData.cards as Record<string, CardData>)
      .filter((c) => String(c.id).startsWith('SS-'))
      .filter((c) => isLockedVariantCard(c))
      .map((c) => c.id);
    expect(verrouillees, 'aucune variante du set 2 verrouillee').toEqual([]);
  });

  it('le deblocage force couvre aussi les identifiants du set 2', () => {
    for (const id of ['SS-112-SPV', 'SS-121-SPV', 'SS-121-CHIBIV', 'SS-149-L', 'SS-147-POPV', 'SS-149-SV']) {
      expect(getCardById(id), `${id} existe`).toBeTruthy();
      expect(isForceUnlockedCard(id), `${id} est debloquee`).toBe(true);
    }
  });

  it('les variantes du set 1 restent verrouillees', () => {
    const uneVarianteKs = Object.values(allCardData.cards as Record<string, CardData>)
      .find((c) => String(c.id).startsWith('KS-') && c.rarity === 'RA');
    expect(uneVarianteKs, 'le set 1 a bien des Rare Art').toBeTruthy();
    expect(isLockedVariantCard(uneVarianteKs!), 'elle reste verrouillee').toBe(true);
  });
});
