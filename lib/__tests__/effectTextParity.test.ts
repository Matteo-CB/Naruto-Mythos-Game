import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { getCardEffectDescriptions } from '@/lib/data/effectDescriptions';
import { allCardData } from '@/lib/data/sets';
import type { CardData } from '@/lib/engine/types';

registerAllSetHandlers();
void EffectEngine;

const LANGUES = ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl'];

function cartesAvecEffets(): CardData[] {
  return Object.values(allCardData.cards as Record<string, CardData>)
    .filter((c) => (c.effects ?? []).length > 0);
}

function marqueurEnTete(texte: string): string {
  const debut = texte.trimStart();
  if (debut.startsWith('[⧗]')) return 'continu';
  if (debut.startsWith('[↯]')) return 'instant';
  return 'aucun';
}

describe('le texte d_effet de chaque carte existe dans les sept langues', () => {
  it('il y a bien plusieurs centaines de cartes a effet', () => {
    expect(cartesAvecEffets().length, 'le catalogue est complet').toBeGreaterThanOrEqual(400);
  });

  it('chaque carte a autant de lignes que d_effets, sans ligne vide', () => {
    const manques: string[] = [];
    for (const carte of cartesAvecEffets()) {
      const attendu = (carte.effects ?? []).length;
      for (const langue of LANGUES) {
        const textes = getCardEffectDescriptions(carte.id, langue);
        if (!textes || textes.length !== attendu || textes.some((t) => !t.trim())) {
          manques.push(`${langue} ${carte.id}`);
        }
      }
    }
    expect(manques, 'aucune carte sans texte').toEqual([]);
  });

  it('le marqueur de tete de chaque ligne suit la carte imprimee', () => {
    const ecarts: string[] = [];
    for (const carte of cartesAvecEffets()) {
      const effets = carte.effects ?? [];
      for (const langue of LANGUES) {
        const textes = getCardEffectDescriptions(carte.id, langue);
        if (!textes) continue;
        effets.forEach((effet, i) => {
          const attendu = marqueurEnTete(effet.description);
          const obtenu = marqueurEnTete(textes[i] ?? '');
          if (attendu !== obtenu) ecarts.push(`${langue} ${carte.id} #${i} ${attendu} contre ${obtenu}`);
        });
      }
    }
    expect(ecarts, 'les marqueurs de tete concordent').toEqual([]);
  });
});
