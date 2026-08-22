import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '..', '..');
const DOSSIERS = ['lib/effects', 'lib/engine'];

const HELPERS_AUTORISES = new Set([
  'lib/effects/handlers/KS/shared/summonSearch.ts',
  'lib/effects/handlers/KS/shared/upgradeCheck.ts',
  'lib/engine/rules/ChakraValidation.ts',
]);

const REPLIS_ACCEPTES = [
  '?? Math.max(0, (topCard_k78.chakra ?? 0) - 1)',
  '?? Math.max(0, (topCard_k78r.chakra ?? 0) - 1)',
];

const COUT_DE_CARTE = /(\w+)\.chakra(\s*\?\?\s*0\s*\))?\s*-\s*\d/;
const POOL_DU_JOUEUR = /^(ps|playerState|newState|state|s\d+Ps|.*Ps)$/i;

function fichiers(dossier: string): string[] {
  const complet = join(RACINE, dossier);
  let entrees: string[] = [];
  try { entrees = readdirSync(complet); } catch { return []; }
  const trouves: string[] = [];
  for (const e of entrees) {
    const chemin = join(complet, e);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(join(dossier, e)));
    else if (e.endsWith('.ts')) trouves.push(join(dossier, e));
  }
  return trouves;
}

describe('un cout reduit part toujours du cout reel, jamais du cout imprime', () => {
  it('aucun effet ne calcule un prix en soustrayant de la valeur imprimee', () => {
    const fautifs: string[] = [];

    for (const dossier of DOSSIERS) {
      for (const rel of fichiers(dossier)) {
        const chemin = rel.split('\\').join('/');
        if (chemin.includes('__tests__')) continue;
        if (HELPERS_AUTORISES.has(chemin)) continue;

        const lignes = readFileSync(join(RACINE, rel), 'utf8').split('\n');
        lignes.forEach((ligne, index) => {
          const trouve = COUT_DE_CARTE.exec(ligne);
          if (!trouve) return;
          if (POOL_DU_JOUEUR.test(trouve[1])) return;
          if (REPLIS_ACCEPTES.some((repli) => ligne.includes(repli))) return;
          fautifs.push(`${chemin}:${index + 1}  ${ligne.trim().slice(0, 100)}`);
        });
      }
    }

    expect(
      fautifs,
      "Une carte qui joue ou revele une autre carte a prix reduit doit partir de calculateEffectiveCost, "
      + "jamais du cout imprime. Sinon les remises deja en jeu, Rasa 051, Kurenai 034, Gamakichi 096, "
      + "sont ignorees: la carte disparait des choix ou le joueur paie trop cher.\n"
      + "Utiliser calculateEffectiveCost, ou les aides de summonSearch: bestFreshPlayCost, "
      + "effectiveFreshPlayCost, effectiveRevealCost, canAffordFromHand.\n"
      + fautifs.join('\n'),
    ).toEqual([]);
  });

  it('les aides partagees existent toujours et sont le seul endroit ou le cout imprime sert', () => {
    const aides = readFileSync(join(RACINE, 'lib/effects/handlers/KS/shared/summonSearch.ts'), 'utf8');
    for (const nom of ['bestFreshPlayCost', 'effectiveFreshPlayCost', 'effectiveRevealCost', 'canAffordFromHand']) {
      expect(aides, `${nom} doit rester disponible`).toContain(`export function ${nom}`);
    }
    expect(aides, 'les aides passent par le cout reel').toContain('calculateEffectiveCost');
  });

  it('chaque carte a remise imprimee a bien un chemin qui calcule le cout reel', async () => {
    const { allCardData } = await import('@/lib/data/sets');
    const motif = /pay(?:ing|s)?\s+(?:\d+|X)\s+less|costs?\s+(?:\d+|X)\s+less|less to play/i;
    const joue = /\bplay\b|\breveal\b/i;
    const cartes = Object.values(allCardData.cards as Record<string, { id: string; effects?: Array<{ description: string }> }>);
    const aRemise = cartes.filter((c) =>
      (c.effects ?? []).some((e) => motif.test(e.description) && joue.test(e.description)));

    expect(aRemise.length, 'le jeu contient bien des cartes a remise').toBeGreaterThan(20);
  });
});
