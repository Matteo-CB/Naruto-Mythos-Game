import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { routing } from '@/lib/i18n/routing';

const RACINE = join(__dirname, '..', '..');

const TRADUCTIONS_INTERDITES: Record<string, RegExp> = {
  fr: /premi[eè]re frappe|embuscade|effet principal|effet d[e']\s?am[eé]lioration|effet de score/i,
  es: /primer golpe|emboscada|efecto principal|efecto de mejora/i,
  pt: /primeiro ataque|primeiro golpe|emboscada|efeito principal|efeito de melhoria/i,
  it: /primo colpo|agguato|imboscata|effetto principale|effetto di potenziamento/i,
  pl: /pierwsze uderzenie|zasadzk|efekt g[łl]ówny|efekt ulepszenia/i,
  ja: /先制攻撃|奇襲|ファーストストライク|アップグレード効果/,
};

function feuilles(o: unknown, chemin = ''): Array<[string, string]> {
  if (typeof o === 'string') return [[chemin, o]];
  if (!o || typeof o !== 'object') return [];
  const sortie: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    sortie.push(...feuilles(v, chemin ? `${chemin}.${k}` : k));
  }
  return sortie;
}

describe('les mots-cles du jeu ne sont jamais traduits', () => {
  it('la table des types d effet est identique dans toutes les langues', () => {
    const attendu = {
      MAIN: 'MAIN', UPGRADE: 'UPGRADE', AMBUSH: 'AMBUSH', SCORE: 'SCORE',
      DUEL: 'DUEL', ATTACH: 'ATTACH', FIRST_STRIKE: 'FIRST STRIKE',
    };
    for (const locale of routing.locales) {
      const messages = JSON.parse(readFileSync(join(RACINE, 'messages', `${locale}.json`), 'utf8'));
      expect(messages.card?.effectTypes, `${locale} garde les mots-cles en anglais`).toEqual(attendu);
    }
  });

  it('aucun texte d interface ne traduit un mot-cle', () => {
    const fautifs: string[] = [];
    for (const locale of routing.locales) {
      const motif = TRADUCTIONS_INTERDITES[locale];
      if (!motif) continue;
      const messages = JSON.parse(readFileSync(join(RACINE, 'messages', `${locale}.json`), 'utf8'));
      for (const [chemin, valeur] of feuilles(messages)) {
        if (chemin.startsWith('seoPages') || chemin.startsWith('seo.')) continue;
        if (motif.test(valeur)) fautifs.push(`${locale} ${chemin} : ${valeur.slice(0, 90)}`);
      }
    }
    expect(
      fautifs,
      'MAIN, AMBUSH, UPGRADE, SCORE, DUEL, ATTACH, FIRST STRIKE et POWERUP restent en anglais dans toutes les langues',
    ).toEqual([]);
  });

  it('aucune ligne de journal des nouveautes ne traduit un mot-cle', () => {
    const changelog = JSON.parse(readFileSync(join(RACINE, 'lib', 'data', 'changelog.json'), 'utf8'));
    const fautifs: string[] = [];
    for (const entree of changelog.entries as Array<Record<string, unknown>>) {
      for (const locale of routing.locales) {
        const motif = TRADUCTIONS_INTERDITES[locale];
        if (!motif) continue;
        const lignes = (entree[`changes_${locale}`] as string[] | undefined) ?? [];
        for (const ligne of lignes) {
          if (motif.test(ligne)) fautifs.push(`${entree.date} ${locale} : ${ligne.slice(0, 90)}`);
        }
      }
    }
    expect(fautifs, 'ecrire AMBUSH, UPGRADE ou FIRST STRIKE, jamais leur traduction').toEqual([]);
  });
});
