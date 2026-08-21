import { describe, it, expect } from 'vitest';
import { allCardData, allEffectDescriptionsFr } from '@/lib/data/sets';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import { HIDDEN_PRINTING_IDS, isHiddenPrinting } from '@/lib/data/sets/hiddenPrintings';

describe('les impressions masquees n_existent nulle part', () => {
  it('la liste couvre les impressions retirees', () => {
    expect(HIDDEN_PRINTING_IDS.length, 'vingt-cinq impressions').toBe(25);
  });

  it('aucune n_apparait dans les donnees de carte', () => {
    const presentes = HIDDEN_PRINTING_IDS.filter((id) => !!(allCardData.cards as Record<string, unknown>)[id]);
    expect(presentes, 'absentes des donnees').toEqual([]);
  });

  it('aucune n_est trouvable par identifiant ni dans le catalogue', () => {
    const parId = HIDDEN_PRINTING_IDS.filter((id) => !!getCardById(id));
    expect(parId, 'introuvables par identifiant').toEqual([]);
    const dansCatalogue = getAllCards().filter((c) => isHiddenPrinting((c as { id: string }).id)).map((c) => (c as { id: string }).id);
    expect(dansCatalogue, 'absentes du catalogue').toEqual([]);
  });

  it('aucune ne garde de texte d_effet', () => {
    const avecTexte = HIDDEN_PRINTING_IDS.filter((id) => !!allEffectDescriptionsFr[id]);
    expect(avecTexte, 'aucun texte residuel').toEqual([]);
  });

  it('les impressions conservees sont toujours la', () => {
    for (const id of ['SS-112-SPV', 'SS-122-SPV', 'SS-123-SPV',
      'SS-126-SPV', 'SS-149-SPV', 'SS-149-L', 'SS-149-SV', 'SS-149-POPV', 'SS-149-CHIBIV', 'SS-147-POPV',
      'SS-111-SHINOBIV', 'SS-123-SHINOBIV', 'SS-121-CHIBIV']) {
      expect(getCardById(id), `${id} reste disponible`).toBeTruthy();
    }
  });
});
