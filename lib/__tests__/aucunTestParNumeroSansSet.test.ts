import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';

const DOSSIERS = ['lib/effects', 'lib/engine'];

function fichiersTs(racine: string): string[] {
  const trouves: string[] = [];
  const parcourir = (chemin: string) => {
    for (const entree of readdirSync(chemin)) {
      const complet = join(chemin, entree);
      if (statSync(complet).isDirectory()) parcourir(complet);
      else if (entree.endsWith('.ts')) trouves.push(complet);
    }
  };
  parcourir(join(process.cwd(), racine));
  return trouves;
}
const MOTIF = /\.number\s*(?:!==|===)\s*\d+/;

function lignesSuspectes(): string[] {
  const suspectes: string[] = [];
  for (const racine of DOSSIERS) {
    for (const fichier of fichiersTs(racine)) {
      if (fichier.includes('__tests__')) continue;
      const source = readFileSync(fichier, 'utf8');
      source.split('\n').forEach((ligne, index) => {
        if (!MOTIF.test(ligne)) return;
        if (/\.set\s*(?:!==|===)/.test(ligne)) return;
        if (/missionNumber|parseInt/.test(ligne)) return;
        suspectes.push(`${fichier}:${index + 1} ${ligne.trim()}`);
      });
    }
  }
  return suspectes;
}

describe('aucune carte ne peut etre confondue avec celle d un autre set', () => {
  it('tout test sur un numero de carte precise aussi son set', () => {
    const suspectes = lignesSuspectes();
    expect(
      suspectes,
      'Ces lignes reconnaissent une carte par son numero seul. Deux sets partagent les memes numeros,\n'
      + 'donc la carte d un autre set declenchera l effet par erreur, comme GRAND-MERE SANSHO 067 qui\n'
      + 'declenchait le REMPART 067. Ajoutez la verification du set sur la meme ligne:\n  '
      + suspectes.join('\n  '),
    ).toEqual([]);
  });
});
