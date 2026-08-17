import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const SASUKE = 'SS-148-S';
const BASE = 'KS-009-C';
const SOMMET = 'KS-001-C';

function repondreAuxQuestions(state: GameState): GameState {
  let courant = state;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 12) {
    const question = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, question.player, {
      type: 'SELECT_TARGET',
      pendingActionId: question.id,
      selectedTargets: [question.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

function missionDe(state: GameState, instanceId: string): number {
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    if ([...mission.player1Characters, ...mission.player2Characters].some((c) => c.instanceId === instanceId)) return i;
  }
  return -1;
}

function plateau(ennemiAmeliore: boolean): GameState {
  const ennemi = simChar(SOMMET, { owner: 'player2', instanceId: 'victime' });
  if (ennemiAmeliore) {
    ennemi.stack = [getCardById(BASE) as CharacterCard, getCardById(SOMMET) as CharacterCard];
  }
  const state = buildSimState({
    p2: [ennemi],
    missions: 2,
    chakra1: 40,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.hand = [getCardById(SASUKE) as CharacterCard];
  return state;
}

function jouerSasuke(state: GameState): GameState {
  return repondreAuxQuestions(GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  } as never));
}

describe('Sasuke Secret 148 vainc un ennemi ameliore puis se deplace', () => {
  it('l ennemi ameliore plus faible est vaincu', () => {
    const apres = jouerSasuke(plateau(true));
    expect(
      apres.activeMissions[0].player2Characters.map((c) => c.instanceId),
      'la victime a quitte la mission',
    ).not.toContain('victime');
    expect(apres.player2.discardPile.length, 'la pile entiere part a la defausse').toBe(2);
  });

  it('apres la defaite, Sasuke change reellement de mission', () => {
    const apres = jouerSasuke(plateau(true));
    const sasuke = [...apres.activeMissions[0].player1Characters, ...apres.activeMissions[1].player1Characters]
      .find((c) => c.card.id === SASUKE || c.stack.some((s) => s.id === SASUKE));
    expect(sasuke, 'Sasuke est toujours en jeu').toBeDefined();
    expect(missionDe(apres, sasuke!.instanceId), 'il a quitte la mission de depart').toBe(1);
  });

  it('face a un Naruto ameliore, le DUEL et le MAIN se resolvent tous les deux', () => {
    const naruto = simChar('KS-133-S', { owner: 'player2', instanceId: 'naruto' });
    naruto.stack = [getCardById(BASE) as CharacterCard, getCardById('KS-133-S') as CharacterCard];
    const state = buildSimState({
      p2: [naruto],
      missions: 2,
      chakra1: 40,
      edgeHolder: 'player1',
    });
    state.phase = 'action';
    state.player1.hand = [getCardById(SASUKE) as CharacterCard];

    const apres = jouerSasuke(state);
    expect(
      apres.activeMissions[0].player2Characters.map((c) => c.instanceId),
      'le Naruto ameliore est bien vaincu',
    ).not.toContain('naruto');

    const sasuke = [...apres.activeMissions[0].player1Characters, ...apres.activeMissions[1].player1Characters]
      .find((c) => c.stack.some((s) => s.id === SASUKE));
    expect(sasuke!.powerTokens, 'le DUEL a bien accorde ses 3 jetons').toBe(3);
    expect(missionDe(apres, sasuke!.instanceId), 'et le deplacement force a eu lieu').toBe(1);
  });

  it('sans ennemi ameliore, rien ne se passe et il ne bouge pas', () => {
    const apres = jouerSasuke(plateau(false));
    expect(
      apres.activeMissions[0].player2Characters.map((c) => c.instanceId),
      'un ennemi non ameliore est intouchable',
    ).toContain('victime');
    const sasuke = apres.activeMissions[0].player1Characters
      .find((c) => c.card.id === SASUKE || c.stack.some((s) => s.id === SASUKE));
    expect(sasuke, 'le deplacement est conditionne par la defaite').toBeDefined();
  });
});
