import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { executeMissionPhase } from '@/lib/engine/phases/MissionPhase';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

const SHINIGAMI = 'SS-057-UC';
const ENNEMI = 'KS-001-C';

function plateau(nombreDEnnemis: number): GameState {
  const p2 = [];
  for (let i = 0; i < nombreDEnnemis; i++) {
    p2.push(simChar(ENNEMI, { owner: 'player2', instanceId: `ennemi${i}` }));
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

function ennemisEnJeu(state: GameState): number {
  return state.activeMissions.reduce((total, m) => total + m.player2Characters.length, 0);
}

function decompteFige(state: GameState): boolean {
  return state.missionScoringComplete === true
    && state.pendingActions.length === 0
    && state.player1.missionPoints === 0
    && state.player2.missionPoints === 0;
}

describe('Shinigami ne gele plus le decompte des points', () => {
  it('avec une seule cible, il frappe et le decompte suit sans question', () => {
    const apres = executeMissionPhase(plateau(1));
    expect(apres.pendingActions.length, 'aucune question a poser').toBe(0);
    expect(ennemisEnJeu(apres), 'la cible unique est vaincue').toBe(0);
  });

  it('avec plusieurs cibles, une question est posee avant tout decompte', () => {
    const enAttente = executeMissionPhase(plateau(2));
    expect(enAttente.pendingActions.length, 'une cible doit etre choisie').toBe(1);
    expect(enAttente.missionScoringComplete, 'le decompte n_est surtout pas declare fini')
      .not.toBe(true);
  });

  it('repondre a la question ne declare plus le decompte termine sans avoir rien compte', () => {
    const enAttente = executeMissionPhase(plateau(2));
    const question = enAttente.pendingActions[0];

    const apres = GameEngine.applyAction(enAttente, question.player, {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: ['ennemi0'],
    } as never);

    expect(ennemisEnJeu(apres), 'la cible choisie est bien vaincue').toBe(1);
    expect(
      decompteFige(apres),
      'le decompte ne doit pas etre scelle a zero point sans question en cours',
    ).toBe(false);
  });

  it('le marqueur des Shinigami traites repart vide a chaque entree en phase de mission', () => {
    const state = plateau(1);
    state.missionPhaseShinigamiIds = ['shini'];
    const apres = GameEngine.transitionToMissionPhase(state);
    expect(ennemisEnJeu(apres), 'il frappe de nouveau a la manche suivante').toBe(0);
  });
});
