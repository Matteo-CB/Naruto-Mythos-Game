import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { ennemisJouesMoinsCher } from '@/lib/effects/handlers/SS/zabuza136';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

function repondre(state: GameState): GameState {
  let courant = state;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 12) {
    const question = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, question.player, {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: [question.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

function narutoRevelParIruka(): GameState {
  const state = buildSimState({
    p2: [
      simChar('SS-024-C', { owner: 'player2', instanceId: 'iruka' }),
      simChar('SS-005-C', { owner: 'player2', instanceId: 'naruto', hidden: true }),
    ],
    missions: 2, chakra1: 30, edgeHolder: 'player2',
  });
  state.phase = 'action';
  state.activePlayer = 'player2';
  state.player2.chakra = 30;
  state.player2.hand = [getCardById('SS-140-R') as CharacterCard];

  return repondre(GameEngine.applyAction(state, 'player2', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'iruka',
  } as never));
}

describe('Zabuza 136 voit les personnages arrives par un effet de carte', () => {
  it('une revelation a prix reduit par un effet est suivie et marquee', () => {
    const apres = narutoRevelParIruka();
    const naruto = apres.activeMissions[0].player2Characters.find((c) => c.instanceId === 'naruto')!;

    expect(naruto.isHidden, 'le Naruto a bien ete revele').toBe(false);
    expect(
      apres.turnPlayedIds ?? [],
      'le suivi central l enregistre comme joue ce tour, sans cablage par carte',
    ).toContain('naruto');
    expect(
      naruto.playedBelowPrintedCost,
      'et il est marque comme paye sous son cout imprime',
    ).toBe(true);
  });

  it('au tour suivant, Zabuza peut le designer', () => {
    const apres = narutoRevelParIruka();
    const tourSuivant: GameState = {
      ...apres,
      lastTurnPlayedIds: { player1: [], player2: apres.turnPlayedIds ?? [] },
    };

    expect(
      ennemisJouesMoinsCher(tourSuivant, 'player1', 0).map((c) => c.instanceId),
      'Zabuza cible bien le personnage arrive par un effet',
    ).toContain('naruto');
  });

  it('un personnage pose normalement au prix fort n est pas une cible', () => {
    const state = buildSimState({
      p2: [simChar('KS-011-C', { owner: 'player2', instanceId: 'normal' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    state.phase = 'action';
    const tourSuivant: GameState = {
      ...state,
      lastTurnPlayedIds: { player1: [], player2: ['normal'] },
    };
    expect(
      ennemisJouesMoinsCher(tourSuivant, 'player1', 0),
      'sans reduction, aucune cible',
    ).toEqual([]);
  });
});
