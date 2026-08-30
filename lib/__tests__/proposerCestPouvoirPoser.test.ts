import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import { peutEtreJouee, missionsJouablesPour } from '@/lib/engine/rules/placement';
import { canAffordFromHand, findAffordableInHandByPredicate } from '@/lib/effects/handlers/KS/shared/summonSearch';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const SEPARATEUR = String.fromCharCode(92);
const SAUT = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');

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

const INVOCATION = 'KS-098-C';

function plateauAvecMemeNomPartout(carte: CharacterCard, chakra: number): GameState {
  const state = buildSimState({ p1: [], p2: [], missions: 3, chakra1: chakra });
  for (const mission of state.activeMissions) {
    mission.player1Characters.push(
      simChar(carte.id, { owner: 'player1', instanceId: 'bloc-' + mission.rank }) as never,
    );
  }
  state.player1.hand = [carte];
  return state;
}

describe('une carte proposee est toujours une carte posable, pour toute carte du jeu', () => {
  beforeAll(() => { initializeRegistry(); });

  it('la regle du meme nom ferme la porte partout, donc la carte n est pas proposee', () => {
    const carte = getCardById(INVOCATION) as CharacterCard;
    const state = plateauAvecMemeNomPartout(carte, 30);
    expect(peutEtreJouee(state, 'player1', carte, 0)).toBe(false);
    expect(canAffordFromHand(state, 'player1', carte, 0)).toBe(false);
    expect(findAffordableInHandByPredicate(state, 'player1', () => true, 0)).toEqual([]);
  });

  it('des que la porte s ouvre quelque part, la carte redevient proposee', () => {
    const carte = getCardById(INVOCATION) as CharacterCard;
    const state = plateauAvecMemeNomPartout(carte, 30);
    state.activeMissions[1].player1Characters = [];
    expect(peutEtreJouee(state, 'player1', carte, 0)).toBe(true);
    expect(canAffordFromHand(state, 'player1', carte, 0)).toBe(true);
    expect(findAffordableInHandByPredicate(state, 'player1', () => true, 0)).toEqual([0]);
  });

  it('la main partagee et la pose repondent la meme chose sur toutes les cartes du jeu', () => {
    const state = buildSimState({ p1: [], p2: [], missions: 3, chakra1: 6 });
    const desaccords: string[] = [];
    for (const carte of getAllCards()) {
      if (carte.card_type !== 'character') continue;
      state.player1.hand = [carte as CharacterCard];
      const propose = canAffordFromHand(state, 'player1', carte as CharacterCard, 0);
      const posable = missionsJouablesPour(state, 'player1', carte as never, 0).length > 0;
      if (propose !== posable) desaccords.push(`${carte.id} propose=${propose} posable=${posable}`);
    }
    expect(desaccords, 'proposer et poser doivent toujours coincider').toEqual([]);
  });

  it('sans aucune mission en jeu, plus rien n est proposable', () => {
    const state = buildSimState({ p1: [], p2: [], missions: 2, chakra1: 99 });
    state.activeMissions = [];
    for (const carte of getAllCards().slice(0, 40)) {
      if (carte.card_type !== 'character') continue;
      expect(peutEtreJouee(state, 'player1', carte as never, 0), carte.id).toBe(false);
    }
  });

  it('la regle de pose vit dans son propre module, sans dependre du moteur d effets', () => {
    const source = readFileSync(join(RACINE, 'lib/engine/rules/placement.ts'), 'utf8');
    expect(source, 'aucune dependance vers le moteur d effets, sinon les cycles reviennent')
      .not.toMatch(/from '.*EffectEngine'/);
    expect(source).toContain('export function peutEtreJouee');
    expect(source).toContain('export function missionsJouablesPour');
  });

  it('plus aucun filtre de proposition ne juge sur le seul prix', () => {
    const motif = /chakra\s*>=\s*(?:\(?[a-zA-Z_$][\w$.]*\.chakra|bestFreshPlayCost|effectiveFreshPlayCost)/;
    const fautifs: string[] = [];
    for (const chemin of [...fichiers(join(RACINE, 'lib/effects')), ...fichiers(join(RACINE, 'lib/engine'))]) {
      const relatif = chemin.slice(RACINE.length + 1).split(SEPARATEUR).join('/');
      if (LECTURES_DE_PRIX_LEGITIMES.includes(relatif)) continue;
      readFileSync(chemin, 'utf8').split(SAUT).forEach((ligne, i) => {
        if (!motif.test(ligne)) return;
        fautifs.push(`${relatif}:${i + 1}  ${ligne.trim().slice(0, 110)}`);
      });
    }
    expect(
      fautifs,
      'proposer une carte a jouer doit passer par peutEtreJouee, sinon elle part a la defausse au clic',
    ).toEqual([]);
  });
});

const LECTURES_DE_PRIX_LEGITIMES = [
  'lib/effects/handlers/KS/shared/summonSearch.ts',
  'lib/effects/handlers/KS/shared/upgradeCheck.ts',
  'lib/engine/rules/placement.ts',
];
