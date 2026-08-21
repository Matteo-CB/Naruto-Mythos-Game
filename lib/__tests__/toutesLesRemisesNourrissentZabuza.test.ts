import { describe, it, expect } from 'vitest';
import { allCardData } from '@/lib/data/sets';
import type { CardData } from '@/lib/engine/types';

const MOTIF_REMISE = /pay(?:ing|s)?\s+(?:\d+|X)\s+less|costs?\s+(?:\d+|X)\s+less|less to play/i;

const REMISES_CONNUES = [
  'KS-002-UC', 'KS-007-C', 'KS-008-UC', 'KS-033-UC', 'KS-034-C', 'KS-053-UC',
  'KS-075-C', 'KS-078-UC', 'KS-090-C', 'KS-096-C',
  'KS-105-MV', 'KS-105-R', 'KS-105-RA',
  'KS-109-MV', 'KS-109-R', 'KS-109-RA',
  'KS-125-R', 'KS-125-RA', 'KS-132-S', 'KS-132-SV',
  'KS-135-MV', 'KS-135-S', 'KS-135-SV',
  'SS-008-C', 'SS-021-C', 'SS-022-UC',
  'SS-032-C', 'SS-034-C', 'SS-036-C', 'SS-039-C', 'SS-040-UC', 'SS-043-UC',
  'SS-051-UC', 'SS-067-C', 'SS-086-C',
  'SS-111-CHIBIV', 'SS-111-R', 'SS-111-SHINOBIV',
  'SS-126-CHIBIV', 'SS-126-MV', 'SS-126-POPV', 'SS-126-R', 'SS-126-RA', 'SS-126-SPV', 'SS-126_2-MV',
  'SS-132-R', 'SS-133-R',
  'SS-140-R',
  'SS-144-CHIBIV', 'SS-144-S',
  'SS-149-CHIBIV', 'SS-149-L', 'SS-149-POPV', 'SS-149-S', 'SS-149-SPV', 'SS-149-SV',
  'SS-998-L',
].sort();

function cartesQuiReduisentUnCout(): string[] {
  const trouvees = new Set<string>();
  for (const carte of Object.values(allCardData.cards as Record<string, CardData>)) {
    for (const effet of carte.effects ?? []) {
      if (MOTIF_REMISE.test(effet.description)) trouvees.add(carte.id);
    }
  }
  return [...trouvees].sort();
}

describe('toute carte qui reduit un cout doit nourrir Zabuza 136', () => {
  it('aucune carte a remise n a ete ajoutee sans etre verifiee', () => {
    const actuelles = cartesQuiReduisentUnCout();
    const nouvelles = actuelles.filter((id) => !REMISES_CONNUES.includes(id));
    const disparues = REMISES_CONNUES.filter((id) => !actuelles.includes(id));

    expect(
      nouvelles,
      `Ces cartes reduisent un cout et ne sont pas encore verifiees pour ZABUZA MOMOCHI 136.\n`
      + `Verifiez que leur remise passe par calculateEffectiveCost ou par le parametre costReduction\n`
      + `des aides communes, puis ajoutez leur identifiant a REMISES_CONNUES:\n  ${nouvelles.join('\n  ')}`,
    ).toEqual([]);

    expect(disparues, `Ces cartes ne portent plus de remise, retirez-les de la liste:\n  ${disparues.join('\n  ')}`).toEqual([]);
  });

  it('la liste couvre bien les familles citees par le concepteur', () => {
    const actuelles = cartesQuiReduisentUnCout();
    for (const attendu of ['KS-053-UC', 'KS-135-S', 'KS-033-UC', 'KS-090-C', 'KS-075-C', 'SS-036-C']) {
      expect(actuelles, `${attendu} doit etre reconnu comme une carte a remise`).toContain(attendu);
    }
  });
});
