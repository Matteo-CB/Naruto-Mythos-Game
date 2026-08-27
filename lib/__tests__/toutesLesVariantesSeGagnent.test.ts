import { describe, it, expect } from 'vitest';
import { isLockedVariantCard, SETS_TEMPORAIREMENT_DEBLOQUES } from '@/lib/variants/isVariant';
import { isForceUnlockedCard } from '@/lib/variants/forceUnlock';
import { getCardById } from '@/lib/data/cardIndex';
import { allCardData } from '@/lib/data/sets';
import { FORCE_UNLOCKED_CARD_IDS } from '@/lib/variants/constants';
import type { CardData } from '@/lib/engine/types';

const toutesLesCartes = () => Object.values(allCardData.cards as Record<string, CardData>);

describe('toutes les variantes se gagnent, aucune n est offerte', () => {
  it('aucun set n est ouvert en bloc', () => {
    expect(
      [...SETS_TEMPORAIREMENT_DEBLOQUES],
      'ouvrir un set entier rendait toutes ses variantes gratuites pour tout le monde',
    ).toEqual([]);
  });

  it('aucune carte n est debloquee d office', () => {
    expect(FORCE_UNLOCKED_CARD_IDS.size).toBe(0);
  });

  it('les variantes du set 2 sont verrouillees, comme celles du set 1', () => {
    for (const id of ['SS-112-SPV', 'SS-112_2-SPV', 'SS-121-CHIBIV', 'SS-149-L', 'SS-147-POPV', 'SS-149-SV']) {
      const carte = getCardById(id);
      expect(carte, `${id} existe`).toBeTruthy();
      expect(isLockedVariantCard(carte!), `${id} doit se gagner`).toBe(true);
      expect(isForceUnlockedCard(id), `${id} n est offert a personne`).toBe(false);
    }
  });

  it('les variantes du set 1 restent verrouillees', () => {
    const uneVarianteKs = toutesLesCartes()
      .find((c) => String(c.id).startsWith('KS-') && c.rarity === 'RA');
    expect(uneVarianteKs, 'le set 1 a bien des Rare Art').toBeTruthy();
    expect(isLockedVariantCard(uneVarianteKs!), 'elle reste verrouillee').toBe(true);
  });

  it('les deux sets sont traites pareil: aucune variante libre nulle part', () => {
    const libres = toutesLesCartes()
      .filter((c) => isForceUnlockedCard(String(c.id)))
      .map((c) => c.id);
    expect(
      libres.slice(0, 10),
      `${libres.length} carte(s) encore offertes: seuls les administrateurs voient tout, `
      + 'par le contournement d autorisation, jamais par une liste de cadeaux',
    ).toEqual([]);
  });

  it('une carte ordinaire n est evidemment pas verrouillee', () => {
    const ordinaire = getCardById('SS-005-C');
    expect(ordinaire, 'la carte existe').toBeTruthy();
    expect(isLockedVariantCard(ordinaire!)).toBe(false);
  });
});
