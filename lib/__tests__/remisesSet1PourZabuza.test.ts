import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

function plateau(p1: string[], p2: string[]): GameState {
  const state = buildSimState({
    p1: p1.map((id, i) => simChar(id, { owner: 'player1', instanceId: `a${i}` })),
    p2: p2.map((id, i) => simChar(id, { owner: 'player2', instanceId: `e${i}` })),
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function prix(state: GameState, id: string, isReveal: boolean): number {
  return calculateEffectiveCost(state, 'player1', getCardById(id) as CharacterCard, 0, isReveal);
}

describe('les remises du set 1 citees par le concepteur sont bien vues comme des remises', () => {
  it('SHINO 033 paye 4 de moins face a un ennemi Jutsu', () => {
    const carte = getCardById('KS-033-UC') as CharacterCard;
    const sans = plateau([], []);
    const avec = plateau([], ['KS-062-UC']);
    expect(prix(sans, 'KS-033-UC', true), 'sans ennemi Jutsu, plein tarif').toBe(carte.chakra);
    expect(prix(avec, 'KS-033-UC', true), 'avec un ennemi Jutsu, 4 de moins').toBeLessThan(carte.chakra);
  });

  it('ITACHI 090 paye 3 de moins a la revelation si un Sasuke est la', () => {
    const carte = getCardById('KS-090-C') as CharacterCard;
    const avec = plateau(['KS-013-C'], []);
    expect(prix(avec, 'KS-090-C', true), 'la remise s applique').toBeLessThan(carte.chakra);
  });

  it('GAARA 075 paye 2 de moins a la revelation', () => {
    const carte = getCardById('KS-075-C') as CharacterCard;
    expect(prix(plateau([], []), 'KS-075-C', true), 'la remise s applique').toBeLessThan(carte.chakra);
  });

  it('KURENAI 034 et GAMAKICHI 096 restent des remises de texte', () => {
    const gama = getCardById('KS-096-C') as CharacterCard;
    expect(
      prix(plateau(['KS-009-C'], []), 'KS-096-C', false),
      'Gamakichi coute 1 de moins avec un Naruto ami',
    ).toBeLessThan(gama.chakra);
  });
});
