import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import type { GameState } from '@/lib/engine/types';

void EffectEngine;

const UKON = 'SS-038-UC';
const SAKON = 'KS-062-UC';
const ENNEMI = 'KS-001-C';

function puissanceEnnemie(state: GameState): number {
  const cible = state.activeMissions[0].player2Characters.find((c) => c.instanceId === 'cible');
  if (!cible) throw new Error('la cible a quitte le plateau');
  return getEffectivePower(state, cible, 'player2');
}

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

function plateau(avecSakon: boolean): GameState {
  const state = buildSimState({
    p1: avecSakon
      ? [
        simChar(UKON, { owner: 'player1', instanceId: 'ukon' }),
        simChar(SAKON, { owner: 'player1', instanceId: 'sakon', hidden: true }),
      ]
      : [simChar(UKON, { owner: 'player1', instanceId: 'ukon', hidden: true })],
    p2: [simChar(ENNEMI, { owner: 'player2', instanceId: 'cible' })],
    missions: 2,
    chakra1: 40,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

describe('Ukon 038 pose en attachement retire bien 5 puissance', () => {
  it('revele lui-meme, il fait perdre 5 puissance a sa cible', () => {
    const depart = plateau(false);
    const avant = puissanceEnnemie(depart);

    const revele = GameEngine.applyAction(depart, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'ukon',
    } as never);
    const apres = repondreAuxQuestions(revele);

    expect(puissanceEnnemie(apres), 'la cible perd exactement 5').toBe(avant - 5);
  });

  it('copie par Sakon, la penalite reste de 5 et ne devient pas un bonus', () => {
    const depart = plateau(true);
    const avant = puissanceEnnemie(depart);

    const revele = GameEngine.applyAction(depart, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sakon',
    } as never);
    const apres = repondreAuxQuestions(revele);

    const attaches = apres.activeMissions[0].player2Characters
      .find((c) => c.instanceId === 'cible')?.attachments ?? [];
    expect(attaches.length, 'la copie a bien pose un attachement').toBe(1);
    expect(
      puissanceEnnemie(apres),
      'la puissance imprimee du copieur ne doit jamais renforcer la cible',
    ).toBe(avant - 5);
  });
});
