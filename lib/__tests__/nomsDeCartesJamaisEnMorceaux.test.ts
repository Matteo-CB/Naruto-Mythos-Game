import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { porteLeNom, estDuClanUchiha } from '@/lib/effects/nameMatch';
import { allCardData } from '@/lib/data/sets';
import type { CardData } from '@/lib/engine/types';

const RACINE = join(__dirname, '..', '..');

function personnages(): CardData[] {
  return Object.values(allCardData.cards as Record<string, CardData>)
    .filter((c) => c.card_type === 'character');
}

function nomsComplets(): string[] {
  return [...new Set(personnages().map((c) => `${c.name_fr ?? ''} ${c.name_en ?? ''}`.toUpperCase()))];
}

describe('un nom de carte ne se compare jamais en morceaux', () => {
  it('le clan Uchiha ne ramasse ni KIN TSUCHI ni TEUCHI', () => {
    const uchiha = personnages().filter((c) => estDuClanUchiha(c)).map((c) => c.name_en);
    expect([...new Set(uchiha)].sort(), 'seuls les trois Uchiha du jeu').toEqual([
      'FUGAKU UCHIHA', 'ITACHI UCHIHA', 'SASUKE UCHIHA',
    ]);

    const pieges = personnages().filter((c) => /TSUCHI|TEUCHI/i.test(c.name_en ?? ''));
    expect(pieges.length, 'le jeu contient bien des noms qui contiennent UCHI').toBeGreaterThan(0);
    for (const p of pieges) {
      expect(estDuClanUchiha(p), `${p.name_en} n'est pas un Uchiha`).toBe(false);
    }
  });

  it('la comparaison exige un mot entier, pas un fragment', () => {
    const kin = { name_fr: 'KIN TSUCHI', name_en: 'KIN TSUCHI' };
    expect(porteLeNom(kin, 'UCHI'), 'UCHI seul ne doit rien matcher dans KIN TSUCHI').toBe(false);
    expect(porteLeNom(kin, 'KIN'), 'KIN est bien un mot entier').toBe(true);
    expect(porteLeNom({ name_fr: 'NARUTO UZUMAKI', name_en: 'NARUTO UZUMAKI' }, 'NARUTO UZUMAKI')).toBe(true);
    expect(porteLeNom(null, 'NARUTO')).toBe(false);
  });

  it('aucun nom cherche dans le code n en attrape un autre par accident', () => {
    const noms = nomsComplets();
    const source = readFileSync(join(RACINE, 'lib', 'effects', 'handlers', 'SS', 'deckSearch.ts'), 'utf8');
    expect(source, 'la fouille de deck passe par la comparaison par mot').toContain('estDuClanUchiha');

    for (const cherche of ['UCHIHA', 'UCHIWA', 'NARUTO UZUMAKI', 'KONOHAMARU', 'TSUNADE', 'AKAMARU']) {
      const parMorceau = noms.filter((n) => n.includes(cherche));
      const parMot = noms.filter((n) => porteLeNom({ name_fr: n, name_en: '' }, cherche));
      expect(
        parMorceau.length - parMot.length,
        `chercher ${cherche} en morceau attrape ${parMorceau.length - parMot.length} nom(s) de trop: `
        + parMorceau.filter((n) => !parMot.includes(n)).join(', '),
      ).toBe(0);
    }
  });
});

describe('les comparaisons de nom restantes sont sans piege', () => {
  const FICHIERS = ['lib/effects', 'lib/engine'];
  const MOTIF = /name_(fr|en)[^\n]{0,80}\.includes\((['"`])([^'"`]+)\2\)/g;

  function tousLesFichiers(dossier: string): string[] {
    const complet = join(RACINE, dossier);
    let entrees: string[] = [];
    try { entrees = readdirSync(complet); } catch { return []; }
    const trouves: string[] = [];
    for (const e of entrees) {
      const chemin = join(complet, e);
      if (statSync(chemin).isDirectory()) trouves.push(...tousLesFichiers(join(dossier, e)));
      else if (e.endsWith('.ts')) trouves.push(join(dossier, e));
    }
    return trouves;
  }

  it('chaque nom cherche en dur designe une carte et une seule famille', () => {
    const noms = nomsComplets();
    const fautifs: string[] = [];

    for (const dossier of FICHIERS) {
      for (const rel of tousLesFichiers(dossier)) {
        const chemin = rel.split('\\').join('/');
        if (chemin.includes('__tests__')) continue;
        const contenu = readFileSync(join(RACINE, rel), 'utf8');
        for (const trouve of contenu.matchAll(MOTIF)) {
          const cherche = trouve[3].toUpperCase();
          if (cherche.length < 3) continue;
          const parMorceau = noms.filter((n) => n.includes(cherche));
          const parMot = noms.filter((n) => porteLeNom({ name_fr: n, name_en: '' }, cherche));
          const enTrop = parMorceau.filter((n) => !parMot.includes(n));
          if (enTrop.length > 0) {
            fautifs.push(`${chemin}: chercher "${cherche}" attrape aussi ${enTrop.join(', ')}`);
          }
        }
      }
    }

    expect(
      fautifs,
      "Chercher un nom de carte avec includes() attrape les noms qui le contiennent: "
      + "chercher UCHI ramassait KIN TSUCHI et TEUCHI. "
      + "Passer par porteLeNom de lib/effects/nameMatch.ts, qui compare des mots entiers.\n"
      + fautifs.join('\n'),
    ).toEqual([]);
  });
});
