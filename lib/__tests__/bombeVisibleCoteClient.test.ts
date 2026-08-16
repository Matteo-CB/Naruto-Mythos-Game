import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { packVisibleState, unpackVisibleState } from '@/lib/socket/statePack';
import type { CardData, GameState, VisibleGameState } from '@/lib/engine/types';

const BOMBE = 'SS-083-UC';

function equipementsVus(vue: VisibleGameState, instanceId: string): number {
  for (const mission of vue.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const trouve = mission[side].find((c) => c.instanceId === instanceId);
      if (trouve) return (trouve.attachments ?? []).length;
    }
  }
  return -1;
}

describe('la Bombe Aveuglante posee sur un ennemi arrive bien jusqu au client', () => {
  it('elle est presente dans la vue du joueur qui l a posee', () => {
    let state: GameState = buildSimState({
      p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'moi' })],
      p2: [simChar('KS-125-R', { owner: 'player2', instanceId: 'cible' })],
      missions: 2,
      chakra1: 40,
      edgeHolder: 'player1',
    });
    state.phase = 'action';
    state = attachCardToCharacter(state, 'player1', getCardById(BOMBE) as CardData, 'cible');

    const vue = GameEngine.getVisibleState(state, 'player1');
    expect(equipementsVus(vue, 'cible'), 'le porteur ennemi est vu avec son equipement').toBe(1);

    const apresReseau = unpackVisibleState(packVisibleState(vue));
    expect(equipementsVus(apresReseau, 'cible'), 'il survit a l aller-retour reseau').toBe(1);
  });

  it('l adversaire la voit aussi sur son propre personnage', () => {
    let state: GameState = buildSimState({
      p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'moi' })],
      p2: [simChar('KS-125-R', { owner: 'player2', instanceId: 'cible' })],
      missions: 2,
      chakra1: 40,
      edgeHolder: 'player1',
    });
    state.phase = 'action';
    state = attachCardToCharacter(state, 'player1', getCardById(BOMBE) as CardData, 'cible');

    const vue = GameEngine.getVisibleState(state, 'player2');
    expect(equipementsVus(vue, 'cible')).toBe(1);
  });
});
