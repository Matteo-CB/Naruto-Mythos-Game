import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';
import { findUpgradeTargetIdx, peutEtreJouee, missionsJouablesPour } from '@/lib/engine/rules/placement';
import { ameliorationLibreAutorisee, SENJU_NUMEROS } from '@/lib/engine/rules/senjuUpgrade';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const HASHIRAMA = 'SS-129-R';
const TOBIRAMA = 'SS-131-R';
const OROCHIMARU = 'KS-050-C';
const AUTRE = 'KS-009-C';

function carte(id: string): CharacterCard {
  return getCardById(id) as CharacterCard;
}

function plateau(avecOrochimaru: boolean, chakra = 20): GameState {
  const allies = [simChar(AUTRE, { owner: 'player1', instanceId: 'cible' })];
  if (avecOrochimaru) allies.push(simChar(OROCHIMARU, { owner: 'player1', instanceId: 'oro' }));
  const state = buildSimState({ p1: allies, p2: [], missions: 2, chakra1: chakra });
  state.player1.chakra = chakra;
  state.activePlayer = 'player1';
  state.phase = 'action';
  return state;
}

function sourcesDe(dossiers: string[]): string[] {
  const trouves: string[] = [];
  const visite = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { if (e !== 'node_modules' && e !== '.next') visite(p); continue; }
      if (/\.(ts|tsx)$/.test(e) && !p.includes('__tests__')) trouves.push(p);
    }
  };
  for (const d of dossiers) visite(join(RACINE, d));
  return trouves;
}

describe('HASHIRAMA et TOBIRAMA peuvent ameliorer un autre nom, par quelque chemin qu ils arrivent', () => {
  beforeAll(() => { initializeRegistry(); });

  it('les deux cartes portent bien cette permission conditionnee a OROCHIMARU', () => {
    for (const id of [HASHIRAMA, TOBIRAMA]) {
      const c = carte(id);
      expect(c, `${id} existe`).toBeTruthy();
      expect(SENJU_NUMEROS).toContain(Number(c.number));
      const duel = (c.effects ?? []).find((e) => e.type === 'DUEL');
      expect(duel?.description, `${id} porte la permission`).toContain('upgrade over friendly characters');
      expect(duel?.description, 'et elle est continue').toContain('[⧗]');
    }
    expect(carte(OROCHIMARU).name_en?.toUpperCase()).toContain('OROCHIMARU');
  });

  it('la permission depend de la presence d OROCHIMARU sur la mission', () => {
    expect(ameliorationLibreAutorisee(carte(HASHIRAMA), plateau(true), 0), 'avec lui').toBe(true);
    expect(ameliorationLibreAutorisee(carte(HASHIRAMA), plateau(false), 0), 'sans lui').toBe(false);
    expect(
      ameliorationLibreAutorisee(carte(HASHIRAMA), plateau(true), 1),
      'et elle vaut mission par mission',
    ).toBe(false);
  });

  it('sans le plateau, la permission est perdue en silence: c est le piege', () => {
    expect(
      checkFlexibleUpgrade(carte(HASHIRAMA), carte(AUTRE)),
      'appeler sans etat rend toujours faux, il faut passer le plateau',
    ).toBe(false);
    expect(
      checkFlexibleUpgrade(carte(HASHIRAMA), carte(AUTRE), plateau(true), 0),
      'avec le plateau la permission s applique',
    ).toBe(true);
  });

  it('le chemin central de placement propose bien l amelioration', () => {
    for (const id of [HASHIRAMA, TOBIRAMA]) {
      const avec = plateau(true);
      const idx = findUpgradeTargetIdx(
        avec.activeMissions[0].player1Characters, carte(id), undefined, avec, 0,
      );
      expect(idx, `${id} doit trouver une cible d amelioration`).toBeGreaterThanOrEqual(0);

      const sans = plateau(false);
      expect(
        findUpgradeTargetIdx(sans.activeMissions[0].player1Characters, carte(id), undefined, sans, 0),
        `${id} ne doit rien trouver sans OROCHIMARU`,
      ).toBe(-1);
    }
  });

  it('un Senju devient posable grace a l amelioration meme quand le Chakra manque', () => {
    const cout = carte(HASHIRAMA).chakra ?? 0;
    const cible = carte(AUTRE).chakra ?? 0;
    const justeAssezPourAmeliorer = Math.max(0, cout - cible);
    expect(justeAssezPourAmeliorer, 'l amelioration coute moins cher que la pose').toBeLessThan(cout);

    const avec = plateau(true, justeAssezPourAmeliorer);
    expect(
      peutEtreJouee(avec, 'player1', carte(HASHIRAMA) as never, 0),
      'avec OROCHIMARU il peut se poser en amelioration',
    ).toBe(true);

    const sans = plateau(false, justeAssezPourAmeliorer);
    expect(
      peutEtreJouee(sans, 'player1', carte(HASHIRAMA) as never, 0),
      'sans lui, le Chakra ne suffit pas pour une pose normale',
    ).toBe(false);
  });

  it('la mission qui porte OROCHIMARU est la seule ouverte a l amelioration', () => {
    const coutAmelioration = Math.max(0, (carte(HASHIRAMA).chakra ?? 0) - (carte(AUTRE).chakra ?? 0));
    const etat = plateau(true, coutAmelioration);
    const jouables = missionsJouablesPour(etat, 'player1', carte(HASHIRAMA) as never, 0);
    expect(
      jouables,
      'la mission sans cible exigerait le prix plein, hors de portee',
    ).toEqual([0]);
  });

  it('plus aucun appel ne perd le plateau en route', () => {
    const autorises = ['lib/cards/sim/generate.ts'];
    const fautifs: string[] = [];
    for (const f of sourcesDe(['lib', 'app', 'components'])) {
      const relatif = f.replace(RACINE, '').replace(/\\/g, '/').replace(/^\//, '');
      if (autorises.some((a) => relatif.endsWith(a))) continue;
      const contenu = readFileSync(f, 'utf8');
      contenu.split(String.fromCharCode(10)).forEach((ligne, i) => {
        if (!ligne.includes('checkFlexibleUpgrade(')) return;
        if (ligne.includes('export function')) return;
        const args = ligne.slice(ligne.indexOf('checkFlexibleUpgrade('));
        if (/state|State/.test(args)) return;
        fautifs.push(`${relatif}:${i + 1}`);
      });
    }
    expect(
      fautifs,
      'sans le plateau, HASHIRAMA et TOBIRAMA perdent leur amelioration sans le moindre message',
    ).toEqual([]);
  });

  it('le handler de KABUTO 053 passe lui aussi le plateau', () => {
    const source = readFileSync(join(RACINE, 'lib/effects/handlers/KS/uncommon/kabuto053.ts'), 'utf8');
    expect(source, 'le tirage depuis la defausse tient compte de la permission')
      .toContain('checkFlexibleUpgrade(topCard as any, tc, state, mi)');
  });
});
