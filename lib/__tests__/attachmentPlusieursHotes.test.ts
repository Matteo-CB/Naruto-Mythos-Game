import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getCharacterAttachTargets } from '@/lib/effects/attachments';
import type { CardData, GameState } from '@/lib/engine/types';

const SAMEHADA = 'SS-090-UC';
const AKATSUKI = 'KS-128-R';

function equipementsEnJeu(state: GameState): number {
  let total = 0;
  for (const mission of state.activeMissions) {
    total += (mission.attachments ?? []).length;
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of mission[side]) total += (c.attachments ?? []).length;
    }
  }
  return total;
}

function plateauDeuxHotes(): GameState {
  const state = buildSimState({
    p1: [
      simChar(AKATSUKI, { owner: 'player1', instanceId: 'hoteA' }),
      simChar(AKATSUKI, { owner: 'player1', instanceId: 'hoteB' }),
    ],
    missions: 2,
    chakra1: 40,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.hand = [getCardById(SAMEHADA) as never];
  return state;
}

describe('poser un equipement quand plusieurs hotes sont legaux', () => {
  it('les deux hotes sont bien des cibles legales', () => {
    const state = plateauDeuxHotes();
    const cibles = getCharacterAttachTargets(state, 'player1', 0, getCardById(SAMEHADA) as CardData);
    expect(cibles.map((c) => c.instanceId).sort()).toEqual(['hoteA', 'hoteB']);
  });

  it('la carte quitte la main et une question est posee au joueur', () => {
    const state = plateauDeuxHotes();
    const apres = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as never);

    expect(apres.player1.hand.length, 'la carte a quitte la main').toBe(0);
    expect(apres.pendingActions.length, 'une question est posee').toBeGreaterThan(0);
    expect(apres.pendingActions[0].options, 'les deux hotes sont proposes').toHaveLength(2);
  });

  it('choisir un hote pose reellement l_equipement', () => {
    const state = plateauDeuxHotes();
    const enAttente = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as never);

    const question = enAttente.pendingActions[0];
    const apres = GameEngine.applyAction(enAttente, question.player, {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: ['hoteA'],
    } as never);

    expect(apres.pendingActions.length, 'plus aucune question en suspens').toBe(0);
    expect(equipementsEnJeu(apres), 'l_equipement est en jeu').toBe(1);
    expect(
      apres.player1.discardPile.map((c) => c.id),
      'il n_est pas parti a la defausse',
    ).not.toContain(SAMEHADA);
  });
});
