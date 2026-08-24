import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

function plateau(deck: string[], defausse: string[]): GameState {
  const s = buildSimState({ missions: 2, chakra1: 30, edgeHolder: 'player1' });
  s.phase = 'action';
  s.player1.deck = deck.map((i) => getCardById(i) as CharacterCard);
  s.player1.discardPile = defausse.map((i) => getCardById(i) as CharacterCard);
  return s;
}

function jouer(s: GameState, id: string): GameState {
  s.player1.hand = [getCardById(id) as CharacterCard];
  return GameEngine.applyAction(s, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  } as never);
}

const SANS_EQUIPEMENT = ['KS-009-C', 'KS-011-C', 'KS-013-C', 'KS-015-C', 'KS-019-C'];

describe('une fouille de deck montre toujours les cartes regardees', () => {
  it('SUIKO 074 sans equipement valide demande d abord si on active l effet', () => {
    const apres = jouer(plateau(SANS_EQUIPEMENT, []), 'SS-074-C');
    const question = apres.pendingActions[0];
    expect(question, 'une fenetre s ouvre malgre l absence de cible').toBeDefined();
    const effet = apres.pendingEffects.find((e) => e.id === question.sourceEffectId)!;
    expect(effet.isMandatory, 'un effet instantane reste refusable').not.toBe(true);
    expect(effet.isOptional || effet.rootOptional).toBe(true);
  });

  it('en acceptant, les cinq cartes sont montrees puis repartent sous le deck', () => {
    const avecFenetre = jouer(plateau(SANS_EQUIPEMENT, []), 'SS-074-C');
    const confirmation = avecFenetre.pendingActions[0];
    const montre = GameEngine.applyAction(avecFenetre, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: confirmation.id, selectedTargets: [confirmation.options[0]],
    } as never);

    const fenetre = montre.pendingActions[0];
    expect(fenetre?.descriptionKey, 'c est bien la fenetre d information').toBe('game.effect.desc.ssDeckSearchShow');
    expect(fenetre.options.length, 'les cinq cartes regardees sont montrees').toBe(5);
    const charge = JSON.parse(montre.pendingEffects.find((e) => e.id === fenetre.sourceEffectId)!.effectDescription);
    expect(charge.cards.length, 'leur identite est transmise au client').toBe(5);
    const apres = GameEngine.applyAction(montre, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: fenetre.id, selectedTargets: [fenetre.options[0]],
    } as never);
    expect(apres.player1.deck.length, 'aucune carte perdue').toBe(5);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.ssDeckSearchBottom'),
      'le journal dit ou elles sont parties',
    ).toBe(true);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'),
      'le refus reste journalise une fois l effet accepte',
    ).toBe(true);
  });
});

describe('KUJAKU 072 demande confirmation, son effet est optionnel', () => {
  it('une fenetre de confirmation s ouvre au lieu d appliquer directement', () => {
    const apres = jouer(plateau(SANS_EQUIPEMENT, ['SS-080-C']), 'SS-072-C');
    expect(apres.pendingActions[0]?.descriptionKey, 'la question est posee').toBe('game.effect.desc.ss072ConfirmMain');
    expect(apres.player1.hand.length, 'rien n est recupere avant la reponse').toBe(0);
  });

  it('en acceptant, l equipement revient bien en main', () => {
    const avant = jouer(plateau(SANS_EQUIPEMENT, ['SS-080-C']), 'SS-072-C');
    const question = avant.pendingActions[0];
    const apres = GameEngine.applyAction(avant, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: [question.options[0]],
    } as never);
    expect(apres.player1.hand.map((c) => c.id), 'l equipement est en main').toContain('SS-080-C');
    expect(apres.player1.discardPile.length, 'et a quitte la defausse').toBe(0);
  });
});

describe('le PARCHEMIN DU SCEAU 095 montre aussi ce qu il a regarde', () => {
  it('sans personnage Jutsu, les 3 cartes sont montrees', () => {
    const s = plateau(SANS_EQUIPEMENT, []);
    s.activeMissions[0].player1Characters.push({
      instanceId: 'hote', card: getCardById('KS-011-C') as CharacterCard, isHidden: false,
      wasRevealedAtLeastOnce: true, powerTokens: 0, stack: [getCardById('KS-011-C') as CharacterCard],
      controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0,
    } as never);
    const apres = jouer(s, 'SS-095-UC');
    const confirmation = apres.pendingActions[0];
    const effet = apres.pendingEffects.find((e) => e.id === confirmation.sourceEffectId)!;
    expect(effet.isMandatory, 'le joueur peut refuser de regarder').not.toBe(true);

    const montre = GameEngine.applyAction(apres, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: confirmation.id, selectedTargets: [confirmation.options[0]],
    } as never);
    const question = montre.pendingActions[0];
    expect(question?.descriptionKey, 'la fenetre d information s ouvre').toBe('game.effect.desc.ssDeckSearchShow');
    expect(question.options.length, 'les trois cartes du dessus sont montrees').toBe(3);
  });
});
