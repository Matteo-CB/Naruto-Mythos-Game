import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '..', '..');
const FICHIERS = ['lib/effects/EffectEngine.ts', 'lib/engine/GameEngine.ts'];

const TYPES_DE_COPIE = [
  'KAKASHI_COPY_EFFECT',
  'SAKON062_COPY_EFFECT',
  'KAKASHI148_COPY_EFFECT',
  'COPY_EFFECT_CHOSEN',
];

interface Maillon { fichier: string; ligne: number; type: string; corps: string }

function maillonsDeCopie(): Maillon[] {
  const trouves: Maillon[] = [];
  for (const fichier of FICHIERS) {
    const lignes = readFileSync(join(RACINE, fichier), 'utf8').split('\n');
    lignes.forEach((ligne, i) => {
      const m = /targetSelectionType: '([A-Z0-9_]+)'/.exec(ligne);
      if (!m || !TYPES_DE_COPIE.includes(m[1])) return;
      if (/^\s*case /.test(ligne)) return;
      trouves.push({
        fichier, ligne: i + 1, type: m[1],
        corps: lignes.slice(Math.max(0, i - 12), i + 14).join('\n'),
      });
    });
  }
  return trouves;
}

describe('un maillon de la chaine de copie ne perd jamais son contexte', () => {
  const maillons = maillonsDeCopie();

  it('la garde trouve bien les maillons a verifier', () => {
    expect(maillons.length, 'sinon ce test ne verifie rien').toBeGreaterThanOrEqual(8);
    for (const type of TYPES_DE_COPIE) {
      expect(maillons.some((m) => m.type === type), `aucun maillon ${type}`).toBe(true);
    }
  });

  it('aucun maillon ne fige isUpgrade a false', () => {
    const fautifs = maillons
      .filter((m) => /isUpgrade:\s*false/.test(m.corps))
      .map((m) => `${m.fichier}:${m.ligne} (${m.type})`);
    expect(
      fautifs,
      'la liste des effets copiables est batie avec le vrai isUpgrade, puis relue au maillon suivant: '
      + 'le figer a false fait disparaitre les effets UPGRADE entre le choix et la resolution, '
      + 'et le joueur voit "aucun effet valide" apres avoir selectionne',
    ).toEqual([]);
  });

  it('chaque maillon transmet isUpgrade, wasRevealed et wasFirstCard', () => {
    const manques: string[] = [];
    for (const m of maillons) {
      for (const champ of ['isUpgrade', 'wasRevealed', 'wasFirstCard']) {
        if (!new RegExp(`${champ}:`).test(m.corps)) {
          manques.push(`${m.fichier}:${m.ligne} (${m.type}) sans ${champ}`);
        }
      }
    }
    expect(
      manques,
      'AMBUSH depend de wasRevealed, FIRST STRIKE de wasFirstCard, UPGRADE de isUpgrade: '
      + 'un maillon qui en oublie un filtre autrement que le maillon precedent',
    ).toEqual([]);
  });
});

describe('chaque filtre de copie recoit la condition complete', () => {
  it('aucun appel a isCopyableEffect ne se prive de wasUpgrade ni du copieur', () => {
    const fautifs: string[] = [];
    for (const fichier of [...FICHIERS, 'lib/effects/handlers/KS/uncommon/sakon062.ts',
      'lib/effects/handlers/KS/uncommon/kakashi016.ts']) {
      const source = readFileSync(join(RACINE, fichier), 'utf8');
      const appels = source.split('isCopyableEffect(').slice(1)
        .map((suite) => suite.slice(0, suite.indexOf('})') + 2));
      appels.forEach((appel, i) => {
        if (!appel.includes('wasUpgrade')) fautifs.push(`${fichier} appel ${i + 1}: sans wasUpgrade`);
        if (!appel.includes('copieur')) fautifs.push(`${fichier} appel ${i + 1}: sans copieur`);
      });
    }
    expect(
      fautifs,
      'sans wasUpgrade un UPGRADE est toujours refuse, et sans copieur la restriction imprimee '
      + '"non-upgrade" de KAKASHI n est pas consultee',
    ).toEqual([]);
  });
});
