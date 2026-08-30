import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { prixDuControle, affordableEnemiesIn } from '@/lib/effects/handlers/SS/orochimaru127';
import type { GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const OROCHIMARU = 'SS-127-R';
const ITACHI = 'KS-128-R';
const SHIKAMARU = 'KS-021-C';

function plateau(chakra: number): GameState {
  return buildSimState({
    p1: [
      simChar(OROCHIMARU, { owner: 'player1', instanceId: 'oro' }),
      simChar(ITACHI, { owner: 'player1', instanceId: 'itachi' }),
    ],
    p2: [simChar(SHIKAMARU, { owner: 'player2', instanceId: 'shika' })],
    missions: 2,
    chakra1: chakra,
  });
}

describe('prendre le controle en payant la puissance ne rapporte jamais de Chakra', () => {
  beforeAll(() => { initializeRegistry(); });

  it('l aura d Itachi fait bien descendre Shikamaru sous zero', () => {
    const state = plateau(0);
    const shika = state.activeMissions[0].player2Characters[0];
    expect(getEffectivePower(state, shika, shika.controlledBy)).toBe(-1);
  });

  it('le prix paye vaut zero, jamais un gain', () => {
    const state = plateau(0);
    const shika = state.activeMissions[0].player2Characters[0];
    expect(prixDuControle(state, shika)).toBe(0);
  });

  it('une cible a puissance negative reste prenable meme sans Chakra', () => {
    const state = plateau(0);
    expect(affordableEnemiesIn(state, 'player1', 0).map((c) => c.instanceId)).toEqual(['shika']);
  });

  it('une cible a puissance positive coute bien sa puissance', () => {
    const state = buildSimState({
      p1: [simChar(OROCHIMARU, { owner: 'player1', instanceId: 'oro' })],
      p2: [simChar('KS-108-R', { owner: 'player2', instanceId: 'cible' })],
      missions: 2,
      chakra1: 30,
    });
    const cible = state.activeMissions[0].player2Characters[0];
    const puissance = getEffectivePower(state, cible, cible.controlledBy);
    expect(puissance).toBeGreaterThan(0);
    expect(prixDuControle(state, cible)).toBe(puissance);
  });

  it('une cible trop chere reste hors de portee', () => {
    const state = buildSimState({
      p1: [simChar(OROCHIMARU, { owner: 'player1', instanceId: 'oro' })],
      p2: [simChar('KS-108-R', { owner: 'player2', instanceId: 'cible' })],
      missions: 2,
      chakra1: 0,
    });
    expect(affordableEnemiesIn(state, 'player1', 0)).toEqual([]);
  });

  it('le moteur paie par cette source unique, sans recalculer la puissance', () => {
    const moteur = readFileSync(join(RACINE, 'lib/effects/EffectEngine.ts'), 'utf8');
    const bloc = moteur.slice(moteur.indexOf("case 'SS127_TAKE_CONTROL'"), moteur.indexOf("case 'SS139_DISCARD'"));
    expect(bloc).toContain('prixDuControle(newState, ss127Found.character)');
    expect(bloc, 'la puissance brute ne doit plus servir de prix').not.toContain('getEffectivePower');
  });

  it('aucun mouvement de Chakra calcule ne peut devenir negatif', () => {
    function fichiers(dossier: string, acc: string[] = []): string[] {
      for (const entree of readdirSync(dossier)) {
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) {
          if (entree === '__tests__') continue;
          fichiers(chemin, acc);
        } else if (entree.endsWith('.ts')) acc.push(chemin);
      }
      return acc;
    }

    const motif = /chakra\s*(?:-|\+)=?\s*[a-zA-Z_$][\w$]*|chakra:\s*[^,;]*chakra\s*[-+]\s*[a-zA-Z_$][\w$]*/;
    const suspects: string[] = [];
    for (const chemin of [...fichiers(join(RACINE, 'lib/effects')), ...fichiers(join(RACINE, 'lib/engine'))]) {
      const source = readFileSync(chemin, 'utf8');
      const lignes = source.split(SAUT);
      lignes.forEach((ligne, i) => {
        if (!motif.test(ligne)) return;
        const contexte = lignes.slice(Math.max(0, i - 12), i + 1).join(' ');
        const borne = /Math\.max\(0|Math\.min\(|> 0\)|<= 0\)|>= 0\)|=== 0\)|< prix|< cout|< ss127Prix|chakra <|\.length/.test(contexte);
        if (borne) return;
        const entree = `${chemin.slice(RACINE.length + 1).split(SEP).join('/')}  ${ligne.trim()}`;
        if (MOUVEMENTS_DEJA_SURS.includes(entree)) return;
        suspects.push(`${entree.slice(0, 140)}`);
      });
    }
    expect(suspects, 'un montant de Chakra calcule doit etre borne avant de bouger le pool').toEqual([]);
  });
});

const MOUVEMENTS_DEJA_SURS = [
  'lib/effects/EffectEngine.ts  ps_dosu69.chakra -= actualCost_dosu69;',
  'lib/effects/handlers/SS/sanninSummons.ts  [sourcePlayer]: { ...state[sourcePlayer], chakra: state[sourcePlayer].chakra + total },',
  'lib/effects/handlers/SS/tayuya039.ts  [sourcePlayer]: { ...ps, chakra: ps.chakra + TAYUYA_039_CHAKRA },',
  'lib/engine/phases/ActionPhase.ts  ps.chakra -= effectiveCost;',
  'lib/engine/phases/EndPhase.ts  chakra: newState[controleur].chakra - cout,',
];

const SEP = String.fromCharCode(92);
const SAUT = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');
