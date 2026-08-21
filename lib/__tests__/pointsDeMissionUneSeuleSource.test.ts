import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { executeMissionPhase } from '@/lib/engine/phases/MissionPhase';
import { pointsGagnesEnRemportant, missionCompteDouble } from '@/lib/effects/missions/ssMissions';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

const RACINE = join(__dirname, '..', '..');
const DOSSIERS = ['components', 'app', 'lib/ai', 'lib/motion'];

const AUTORISES = new Set([
  'components/cards/MissionCard.tsx',
]);

function fichiers(dossier: string): string[] {
  const complet = join(RACINE, dossier);
  let entrees: string[] = [];
  try { entrees = readdirSync(complet); } catch { return []; }
  const trouves: string[] = [];
  for (const e of entrees) {
    if (e === 'node_modules' || e === '.next') continue;
    const chemin = join(complet, e);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(join(dossier, e)));
    else if (/\.(ts|tsx)$/.test(e)) trouves.push(join(dossier, e));
  }
  return trouves;
}

const CALCUL_A_LA_MAIN = /basePoints[^\n]{0,60}rankBonus|rankBonus[^\n]{0,60}basePoints/;

describe('la valeur d une mission a une seule source', () => {
  it('aucun affichage ni aucune IA ne recalcule les points a la main', () => {
    const fautifs: string[] = [];
    for (const dossier of DOSSIERS) {
      for (const rel of fichiers(dossier)) {
        const chemin = rel.split('\\').join('/');
        if (AUTORISES.has(chemin)) continue;
        const source = readFileSync(join(RACINE, rel), 'utf8');
        for (const ligne of source.split('\n')) {
          if (ligne.includes(':') && ligne.includes('number')) continue;
          if (CALCUL_A_LA_MAIN.test(ligne)) fautifs.push(`${chemin}: ${ligne.trim()}`);
        }
      }
    }
    expect(
      fautifs,
      'une mission qui compte double vaut le double partout: passer par pointsGagnesEnRemportant',
    ).toEqual([]);
  });

  it('le moteur reconnait la mission qui compte double par son texte, pas par son numero', () => {
    const source = readFileSync(join(RACINE, 'lib/engine/phases/MissionPhase.ts'), 'utf8');
    const debut = source.indexOf('export function startHighPrioritySecondPass');
    const corps = source.slice(debut, debut + 900);
    expect(corps, 'une future mission au meme texte doit marquer deux fois elle aussi').toContain('missionCompteDouble');
    expect(corps, 'aucun numero de carte en dur').not.toContain('SS_MISSION_HIGH_PRIORITY');
  });
});

const PRIORITE_HAUTE = 'SS-004-MMS';
const FORT = 'KS-009-C';

beforeAll(() => { initializeRegistry(); });

function marque(missionId: string): { affiche: number; gagne: number } {
  let s: GameState = buildSimState({
    p1: [simChar(FORT, { owner: 'player1', instanceId: 'gagnant' })],
    p2: [],
    missions: 1, missionIds: [missionId], chakra1: 5,
  });
  s.phase = 'mission';
  const affiche = pointsGagnesEnRemportant(s.activeMissions[0]);

  s = executeMissionPhase(s);
  let garde = 0;
  while (s.pendingActions.length > 0 && garde < 10) {
    const q = s.pendingActions[0];
    s = GameEngine.applyAction(s, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
    } as never);
    garde += 1;
  }
  return { affiche, gagne: s.player1.missionPoints };
}

describe('ce qui est affiche est ce qui est reellement gagne', () => {
  it('la mission qui compte double annonce et rapporte le double', () => {
    expect(missionCompteDouble(buildSimState({ missions: 1, missionIds: [PRIORITE_HAUTE] }).activeMissions[0])).toBe(true);
    const { affiche, gagne } = marque(PRIORITE_HAUTE);
    expect(gagne, 'le joueur touche exactement ce que le plateau annoncait').toBe(affiche);
  });

  it('une mission normale annonce et rapporte son total habituel', () => {
    const { affiche, gagne } = marque('SS-005-MMS');
    expect(gagne).toBe(affiche);
  });
});
