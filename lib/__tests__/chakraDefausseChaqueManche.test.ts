import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { executeEndPhase } from '@/lib/engine/phases/EndPhase';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

function finDeManche(chakra1: number, chakra2: number): GameState {
  const state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'a' })],
    p2: [simChar('KS-001-C', { owner: 'player2', instanceId: 'b' })],
    missions: 2,
    chakra1,
    edgeHolder: 'player1',
  });
  state.phase = 'end';
  state.player2.chakra = chakra2;
  return state;
}

describe('le chakra non depense est defausse a chaque fin de manche', () => {
  it('la fin de manche vide les deux reserves', () => {
    const apres = executeEndPhase(finDeManche(7, 4));
    expect(apres.player1.chakra).toBe(0);
    expect(apres.player2.chakra).toBe(0);
  });

  it('le verrou de defausse est leve avant la manche suivante', () => {
    const apres = GameEngine.transitionToEndPhase(finDeManche(7, 4));
    expect(
      apres.endPhaseChakraReset,
      'sans cette remise a zero, le chakra ne serait defausse qu une seule fois de toute la partie',
    ).toBeFalsy();
  });

  it('une seconde fin de manche defausse de nouveau', () => {
    const premiere = GameEngine.transitionToEndPhase(finDeManche(7, 4));

    const seconde: GameState = { ...premiere, phase: 'end' };
    seconde.player1 = { ...seconde.player1, chakra: 6 };
    seconde.player2 = { ...seconde.player2, chakra: 9 };

    const apres = executeEndPhase(seconde);
    expect(apres.player1.chakra, 'rien ne se reporte d une manche a l autre').toBe(0);
    expect(apres.player2.chakra).toBe(0);
  });
});
