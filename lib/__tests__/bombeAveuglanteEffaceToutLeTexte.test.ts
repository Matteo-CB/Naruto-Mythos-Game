import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { allCardData } from '@/lib/data/sets';
import { GameEngine } from '@/lib/engine/GameEngine';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { executeEndPhase } from '@/lib/engine/phases/EndPhase';
import {
  calculateContinuousChakraBonus,
  shouldRetainPowerTokens,
  isImmuneToEnemyHideOrDefeat,
  isHiddenRevealBlocked,
} from '@/lib/effects/ContinuousEffects';
import { effetsActifsDe, textIsBlanked } from '@/lib/effects/handlers/SS/attachmentStatics';
import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const BOMBE = 'SS-083-UC';

function poserBombe(char: CharacterInPlay, victime: PlayerID): void {
  const lanceur: PlayerID = victime === 'player1' ? 'player2' : 'player1';
  char.attachments = [
    ...(char.attachments ?? []),
    { card: getCardById(BOMBE), owner: lanceur, controlledBy: lanceur } as never,
  ];
}

function plateau(carteId: string, avecBombe: boolean): { etat: GameState; cible: CharacterInPlay } {
  const s = buildSimState({
    p1: [simChar(carteId, { owner: 'player1', instanceId: 'cible' })],
    p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  const cible = s.activeMissions[0].player1Characters[0];
  if (avecBombe) poserBombe(cible, 'player1');
  return { etat: s, cible };
}

function personnagesAvecEffets(): Array<CardData & { effects?: Array<{ type: string; description: string }> }> {
  return Object.values(allCardData.cards as Record<string, CardData & { effects?: Array<{ type: string; description: string }> }>)
    .filter((c) => c.card_type === 'character' && (c.effects ?? []).length > 0);
}

describe('une carte sous BOMBE AVEUGLANTE se comporte comme une vanille', () => {
  it('aucun effet ne reste lisible, sur toutes les cartes du jeu', () => {
    const fautifs: string[] = [];
    let examinees = 0;

    for (const carte of personnagesAvecEffets()) {
      const { cible } = plateau(carte.id, true);
      examinees += 1;
      if (!textIsBlanked(cible)) {
        fautifs.push(`${carte.id}: la bombe n est pas vue comme posee`);
        continue;
      }
      const actifs = effetsActifsDe(cible);
      if (actifs.length !== 0) {
        fautifs.push(`${carte.id} ${carte.name_fr}: ${actifs.length} effet(s) encore actif(s)`);
      }
    }

    expect(examinees, 'le balayage couvre tout le catalogue').toBeGreaterThan(300);
    expect(fautifs.slice(0, 10), `${fautifs.length} cartes fautives`).toEqual([]);
  });

  it('sans bombe, les memes cartes gardent bien leurs effets', () => {
    const muettes: string[] = [];
    for (const carte of personnagesAvecEffets()) {
      const { cible } = plateau(carte.id, false);
      if (effetsActifsDe(cible).length === 0) muettes.push(carte.id);
    }
    expect(muettes, 'la bombe ne doit pas etre le seul cas ou le texte disparait').toEqual([]);
  });
});

describe('les regles continues lisent toutes le texte efface', () => {
  it('ROCK LEE et GAI perdent leurs jetons a la fin du tour sous la bombe', () => {
    for (const carteId of ['KS-039-UC', 'KS-043-UC', 'SS-115-R']) {
      const sans = plateau(carteId, false);
      expect(
        shouldRetainPowerTokens(sans.cible),
        `${carteId} garde ses jetons quand son texte est lisible`,
      ).toBe(true);

      const avec = plateau(carteId, true);
      expect(
        shouldRetainPowerTokens(avec.cible),
        `${carteId}: son texte est efface, il doit perdre ses jetons comme n importe quelle carte`,
      ).toBe(false);
    }
  });

  it('la fin de tour retire reellement les jetons', () => {
    const sans = plateau('KS-039-UC', false);
    sans.cible.powerTokens = 4;
    const gardes = executeEndPhase(sans.etat)
      .activeMissions[0].player1Characters.find((c) => c.instanceId === 'cible');
    expect(gardes?.powerTokens, 'sans bombe, ROCK LEE garde bien ses jetons').toBe(4);

    const avec = plateau('KS-039-UC', true);
    avec.cible.powerTokens = 4;
    const perdus = executeEndPhase(avec.etat)
      .activeMissions[0].player1Characters.find((c) => c.instanceId === 'cible');
    expect(perdus?.powerTokens, 'les jetons tombent a zero comme pour une vanille').toBe(0);
  });

  it('une aura de puissance ne rayonne plus', () => {
    const s = buildSimState({
      p1: [
        simChar('KS-015-C', { owner: 'player1', instanceId: 'kakashi' }),
        simChar('KS-011-C', { owner: 'player1', instanceId: 'allie' }),
      ],
      p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    const kakashi = s.activeMissions[0].player1Characters[0];
    const allie = s.activeMissions[0].player1Characters[1];

    const avant = calculateCharacterPower(s, allie, 'player1');
    poserBombe(kakashi, 'player1');
    const apres = calculateCharacterPower(s, allie, 'player1');
    expect(
      apres,
      "KAKASHI 015 donne +1 aux autres de l equipe 7: texte efface, l aura s eteint",
    ).toBe(avant - 1);
  });

  it('un bonus de chakra continu s eteint', () => {
    const { etat, cible } = plateau('KS-064-C', false);
    const avecTexte = calculateContinuousChakraBonus(etat, 'player1', 0, cible);
    const bombe = plateau('KS-064-C', true);
    const sansTexte = calculateContinuousChakraBonus(bombe.etat, 'player1', 0, bombe.cible);
    expect(sansTexte, 'aucun chakra continu ne survit a la bombe').toBeLessThanOrEqual(avecTexte);
    expect(sansTexte).toBe(0);
  });

  it('une immunite ne protege plus', () => {
    const immunises = personnagesAvecEffets().filter((c) => (c.effects ?? []).some(
      (e) => e.description.includes("Can't be hidden or defeated by enemy effects"),
    ));
    expect(immunises.length, 'le jeu contient bien des cartes immunisees').toBeGreaterThan(0);
    for (const carte of immunises) {
      expect(isImmuneToEnemyHideOrDefeat(plateau(carte.id, false).cible), `${carte.id} immunise`).toBe(true);
      expect(
        isImmuneToEnemyHideOrDefeat(plateau(carte.id, true).cible),
        `${carte.id}: texte efface, plus aucune immunite`,
      ).toBe(false);
    }
  });

  it('un verrou de revelation saute', () => {
    const verrous = personnagesAvecEffets().filter((c) => (c.effects ?? []).some(
      (e) => e.description.toLowerCase().includes('cannot play characters while hidden'),
    ));
    expect(verrous.length, 'le jeu contient bien une carte qui bloque les revelations').toBeGreaterThan(0);

    for (const carte of verrous) {
      const s = buildSimState({
        p1: [], p2: [simChar(carte.id, { owner: 'player2', instanceId: 'verrou' })],
        missions: 2, chakra1: 40, edgeHolder: 'player1',
      });
      const porteur = s.activeMissions[0].player2Characters[0];
      expect(isHiddenRevealBlocked(s, 0, 'player1'), `${carte.id} bloque`).toBe(true);
      poserBombe(porteur, 'player2');
      expect(isHiddenRevealBlocked(s, 0, 'player1'), `${carte.id}: texte efface, plus de blocage`).toBe(false);
    }
  });
});

describe('la bombe n efface que la carte qu elle porte', () => {
  it('les effets de la mission ne sont pas touches', () => {
    const s = buildSimState({
      p1: [simChar('KS-039-UC', { owner: 'player1', instanceId: 'cible' })],
      p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    const avant = JSON.stringify(s.activeMissions.map((m) => m.card.effects ?? []));
    poserBombe(s.activeMissions[0].player1Characters[0], 'player1');
    const apres = JSON.stringify(s.activeMissions.map((m) => m.card.effects ?? []));
    expect(apres, 'la mission garde son texte').toBe(avant);
  });

  it('les autres personnages gardent le leur', () => {
    const s = buildSimState({
      p1: [
        simChar('KS-039-UC', { owner: 'player1', instanceId: 'bombarde' }),
        simChar('KS-043-UC', { owner: 'player1', instanceId: 'voisin' }),
      ],
      p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    poserBombe(s.activeMissions[0].player1Characters[0], 'player1');
    expect(effetsActifsDe(s.activeMissions[0].player1Characters[0]).length).toBe(0);
    expect(
      effetsActifsDe(s.activeMissions[0].player1Characters[1]).length,
      'le voisin n est pas concerne',
    ).toBeGreaterThan(0);
  });

  it('la bombe elle-meme continue d exister sur sa cible', () => {
    const { cible } = plateau('KS-039-UC', true);
    expect((cible.attachments ?? []).length, 'l equipement reste en place').toBe(1);
  });
});

describe('aucune regle continue ne lit le texte sans passer par l accesseur', () => {
  const RACINE = join(__dirname, '..', '..');

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

  it('ContinuousEffects ne lit plus les effets d un personnage en direct', () => {
    const src = readFileSync(join(RACINE, 'lib/effects/ContinuousEffects.ts'), 'utf8');
    const lectures = src.split('\n')
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => /\w+\.effects \?\? \[\]/.test(l) && !/mission\.card\.effects/.test(l));
    expect(
      lectures.map(({ n, l }) => `${n}: ${l.trim().slice(0, 90)}`),
      'lire les effets imprimes sans passer par effetsActifsDe ignore BOMBE AVEUGLANTE 083, '
      + 'qui doit rendre la carte muette comme une vanille',
    ).toEqual([]);
  });

  it('les regles continues restent pilotees par le texte imprime, pas par un numero de carte', () => {
    const src = readFileSync(join(RACINE, 'lib/effects/ContinuousEffects.ts'), 'utf8');
    const at = src.indexOf('export function shouldRetainPowerTokens');
    const corps = src.slice(at, at + 400);
    expect(
      corps,
      'un numero de carte en dur laisserait une future carte au meme texte sans effet',
    ).not.toMatch(/number === \d+/);
    expect(corps).toContain('effetsActifsDe');
  });

  it('l accesseur est bien la seule porte, et il rend une liste vide', () => {
    const { cible } = plateau('KS-039-UC', true);
    expect(effetsActifsDe(cible)).toEqual([]);
    expect(effetsActifsDe(null)).toEqual([]);
    expect(effetsActifsDe(undefined)).toEqual([]);
  });

  it('aucun autre fichier de regles ne contourne l accesseur pour un personnage en jeu', () => {
    const suspects: string[] = [];
    for (const dossier of ['lib/effects', 'lib/engine']) {
      for (const rel of fichiers(dossier)) {
        const chemin = rel.split('\\').join('/');
        if (chemin.includes('__tests__')) continue;
        if (chemin === 'lib/effects/ContinuousEffects.ts') continue;
        const contenu = readFileSync(join(RACINE, rel), 'utf8');
        for (const ligne of contenu.split('\n')) {
          if (!/\w+Top\w*\.effects|topCard\.effects/.test(ligne)) continue;
          if (/e\.type === 'MAIN' && .*\[⧗\]/.test(ligne)) suspects.push(`${chemin}: ${ligne.trim().slice(0, 80)}`);
        }
      }
    }
    expect(
      suspects,
      'une regle continue lue hors de l accesseur echappe a la bombe:\n' + suspects.join('\n'),
    ).toEqual([]);
  });
});
