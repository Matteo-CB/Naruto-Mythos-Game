import { describe, it, expect } from 'vitest';
import { parseDuelCharacterName } from '@/lib/effects/duelUtils';
import { allCardData, allEffectDescriptionsEn } from '@/lib/data/sets';
import type { CardData } from '@/lib/engine/types';

function nomsDeCartes(): Set<string> {
  const noms = new Set<string>();
  for (const carte of Object.values(allCardData.cards as Record<string, CardData>)) {
    if (carte.name_fr) noms.add(carte.name_fr.toUpperCase());
    if (carte.name_en) noms.add(carte.name_en.toUpperCase());
  }
  return noms;
}

function designeUnPersonnage(nom: string, noms: Set<string>): boolean {
  const cherche = nom.toUpperCase();
  for (const connu of noms) {
    if (connu.includes(cherche) || cherche.includes(connu)) return true;
  }
  return false;
}

describe('chaque DUEL imprime designe un personnage qui existe', () => {
  it('aucun DUEL ne reste muet faute de nom lisible', () => {
    const noms = nomsDeCartes();
    const morts: string[] = [];
    let total = 0;

    for (const carte of Object.values(allCardData.cards as Record<string, CardData>)) {
      const textes = allEffectDescriptionsEn[carte.id] ?? [];
      (carte.effects ?? []).forEach((effet, index) => {
        if (effet.type !== 'DUEL') return;
        total += 1;
        const texte = textes[index] ?? effet.description ?? '';
        const nom = parseDuelCharacterName(texte);
        if (!nom || !designeUnPersonnage(nom, noms)) {
          morts.push(`${carte.id} ${carte.name_fr} -> ${nom ?? 'aucun nom lu'} | ${texte.slice(0, 60)}`);
        }
      });
    }

    expect(total, 'le jeu contient bien des DUEL').toBeGreaterThan(20);
    expect(
      morts,
      `ces DUEL ne peuvent jamais se declencher:\n  ${morts.join('\n  ')}`,
    ).toEqual([]);
  });

  it('le prefixe DUEL est facultatif, car le type de l effet le dit deja', () => {
    expect(parseDuelCharacterName('[↯] Kakashi Hatake: Move the strongest enemy.')).toBe('Kakashi Hatake');
    expect(parseDuelCharacterName('DUEL Kakashi Hatake: Move the strongest enemy.')).toBe('Kakashi Hatake');
    expect(parseDuelCharacterName('DUEL Gaara')).toBe('Gaara');
    expect(parseDuelCharacterName('Rock Lee, MAIN effect: Instead, defeat them.')).toBe('Rock Lee');
    expect(parseDuelCharacterName('')).toBe(null);
  });
});
