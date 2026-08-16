import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { executeMissionPhase } from '@/lib/engine/phases/MissionPhase';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

const SHINIGAMI = 'SS-057-UC';
const ALLIE = 'KS-001-C';

function plateau(nombreDEnnemis: number): GameState {
  const p2 = [];
  for (let i = 0; i < nombreDEnnemis; i++) {
    p2.push(simChar(ALLIE, { owner: 'player2', instanceId: `ennemi${i}` }));
  }
  const state = buildSimState({
    p1: [simChar(SHINIGAMI, { owner: 'player1', instanceId: 'shini' })],
    p2,
    missions: 2,
    chakra1: 20,
    edgeHolder: 'player1',
  });
  state.phase = 'mission';
  return state;
}

function pointsTotaux(state: GameState): number {
  return state.player1.missionPoints + state.player2.missionPoints;
}

describe('Shinigami ne gele plus le decompte des points', () => {
  it('avec une seule cible, le decompte se fait dans la foulee', () => {
    const apres = executeMissionPhase(plateau(1));
    expect(apres.pendingActions.length, 'aucune question a poser').toBe(0);
    expect(pointsTotaux(apres), 'des points ont ete marques').toBeGreaterThan(0);
  });

  it('avec plusieurs cibles, le decompte reprend une fois la cible choisie', () => {
    const depart = plateau(2);
    const enAttente = executeMissionPhase(depart);

    expect(enAttente.pendingActions.length, 'une cible doit etre choisie').toBe(1);
    expect(pointsTotaux(enAttente), 'rien n_est encore marque').toBe(0);

    const question = enAttente.pendingActions[0];
    const apres = GameEngine.applyAction(enAttente, question.player, {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: ['ennemi0'],
    } as never);

    expect(apres.pendingActions.length, 'plus rien en suspens').toBe(0);
    expect(pointsTotaux(apres), 'le decompte a bien eu lieu apres le choix').toBeGreaterThan(0);
  });

  it('le marqueur des Shinigami deja traites est remis a zero a chaque manche', () => {
    const state = plateau(1);
    state.missionPhaseShinigamiIds = ['shini'];
    const apres = GameEngine.transitionToMissionPhase(state);
    expect(apres.missionPhaseShinigamiIds, 'la manche repart sur une liste vide')
      .not.toContain('shini');
  });
});
