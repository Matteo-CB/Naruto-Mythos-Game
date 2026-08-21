import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { resynchroniserLesOptionsDeMain, SELECTIONS_SUR_TOUTE_LA_MAIN } from '@/lib/effects/handOptions';
import { kabuto139PiocheEtDefausse } from '@/lib/effects/ContinuousEffects';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const KABUTO_139 = 'SS-139-R';
const SAKON_SON = 'KS-061-C';
const REMPLISSAGE = 'KS-009-C';

beforeAll(() => { initializeRegistry(); });

function plateau(tailleMain: number, tailleDeck: number): GameState {
  const s = buildSimState({
    p1: [simChar(KABUTO_139, { owner: 'player1', instanceId: 'kabuto' })],
    p2: [], missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = Array.from({ length: tailleMain }, () => getCharacterById(SAKON_SON)!);
  s.player1.deck = Array.from({ length: tailleDeck }, () => getCharacterById(REMPLISSAGE)!);
  return s;
}

function questionDeDefausse(s: GameState) {
  const effet = s.pendingEffects.find((e) => e.targetSelectionType === 'SS139_DISCARD');
  const action = s.pendingActions.find((a) => a.sourceEffectId === effet?.id);
  return { effet, action };
}

describe('le choix de defausse suit la main reelle', () => {
  it('temoin: sans pioche entre temps, toutes les cartes en main sont proposees', () => {
    const depart = plateau(4, 10);
    const apres = kabuto139PiocheEtDefausse(depart, 'player1', 1);
    const { effet, action } = questionDeDefausse(apres);
    expect(apres.player1.hand.length, 'la pioche de Kabuto a eu lieu').toBe(5);
    expect(effet?.validTargets.length, 'les 5 cartes sont proposees').toBe(5);
    expect(action?.options.length).toBe(5);
  });

  it('des cartes piochees apres la question sont proposees elles aussi', () => {
    const depart = plateau(4, 10);
    let s = kabuto139PiocheEtDefausse(depart, 'player1', 1);
    expect(questionDeDefausse(s).effet?.validTargets.length, 'la question part sur 5 cartes').toBe(5);

    const deck = [...s.player1.deck];
    const piochees = deck.splice(0, 3);
    s = { ...s, player1: { ...s.player1, deck, hand: [...s.player1.hand, ...piochees] } };
    expect(s.player1.hand.length, 'la main est montee a 8').toBe(8);

    const rafraichi = resynchroniserLesOptionsDeMain(s);
    const { effet, action } = questionDeDefausse(rafraichi);
    expect(effet?.validTargets.length, 'les 8 cartes de la main sont proposees').toBe(8);
    expect(action?.options.length, 'la fenetre propose les 8 cartes').toBe(8);
    expect(effet?.validTargets).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
  });

  it('des cartes qui quittent la main disparaissent des choix', () => {
    const depart = plateau(6, 10);
    let s = kabuto139PiocheEtDefausse(depart, 'player1', 1);
    expect(questionDeDefausse(s).effet?.validTargets.length).toBe(7);

    s = { ...s, player1: { ...s.player1, hand: s.player1.hand.slice(0, 3) } };
    const rafraichi = resynchroniserLesOptionsDeMain(s);
    expect(
      questionDeDefausse(rafraichi).effet?.validTargets.length,
      'on ne propose jamais une carte qui n est plus en main',
    ).toBe(3);
  });

  it('une liste perimee bloquait vraiment le choix, elle ne le grisait pas seulement', () => {
    const depart = plateau(4, 10);
    let s = kabuto139PiocheEtDefausse(depart, 'player1', 1);

    const deck = [...s.player1.deck];
    const piochees = deck.splice(0, 3);
    s = { ...s, player1: { ...s.player1, deck, hand: [...s.player1.hand, ...piochees] } };

    const perime: GameState = {
      ...s,
      pendingEffects: s.pendingEffects.map((e) =>
        e.targetSelectionType === 'SS139_DISCARD' ? { ...e, validTargets: ['0', '1', '2', '3', '4'] } : e),
      pendingActions: s.pendingActions.map((a) => ({ ...a, options: ['0', '1', '2', '3', '4'] })),
    };
    expect(perime.player1.hand.length, 'huit cartes en main').toBe(8);

    const refuse = GameEngine.applyAction(perime, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: perime.pendingActions[0].id, selectedTargets: ['7'],
    } as never);
    expect(
      refuse.player1.discardPile.length,
      'le moteur refuse une carte absente de la liste, le joueur est vraiment bloque',
    ).toBe(0);

    const repare = resynchroniserLesOptionsDeMain(perime);
    const apres = GameEngine.applyAction(repare, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: repare.pendingActions[0].id, selectedTargets: ['7'],
    } as never);
    expect(apres.player1.discardPile.length, 'une fois la liste a jour, le choix passe').toBe(1);
    expect(apres.player1.hand.length).toBe(7);
  });

  it('la remise a jour tourne sur chaque action du moteur', () => {
    const source = readFileSync(join(__dirname, '..', 'engine', 'GameEngine.ts'), 'utf8');
    const debut = source.indexOf('static applyAction(');
    const corps = source.slice(debut, debut + 900);
    expect(corps, 'le filet est branche comme les autres').toContain('resynchroniserLesOptionsDeMain');
  });

  it('chaque type de selection liste est bien une main entiere', () => {
    const source = readFileSync(join(__dirname, '..', 'effects', 'EffectEngine.ts'), 'utf8');
    const handlers = ['asuma113b', 'guy119b']
      .map((f) => readFileSync(join(__dirname, '..', 'effects', 'handlers', 'KS', 'rare', `${f}.ts`), 'utf8'))
      .join('\n');
    const continu = readFileSync(join(__dirname, '..', 'effects', 'ContinuousEffects.ts'), 'utf8');
    const tout = source + handlers + continu;
    const absents = Object.keys(SELECTIONS_SUR_TOUTE_LA_MAIN).filter((t) => !tout.includes(t));
    expect(absents, 'un type liste ici doit exister dans le moteur').toEqual([]);
  });
});
