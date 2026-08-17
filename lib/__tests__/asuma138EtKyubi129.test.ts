import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const ASUMA = 'SS-138-R';
const KYUBI = 'KS-129-R';
const NARUTO_2C = 'KS-009-C';

function plateauAsuma(idEnnemi: string): GameState {
  const state = buildSimState({
    p1: [simChar(ASUMA, { owner: 'player1', instanceId: 'asuma' })],
    p2: [simChar(idEnnemi, { owner: 'player2', instanceId: 'ennemi' })],
    missions: 2,
    chakra1: 20,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function ciblesUpgrade(state: GameState): string[] {
  const handler = getEffectHandler(ASUMA, 'UPGRADE')!;
  const resultat = handler({
    state,
    sourcePlayer: 'player1',
    sourceCard: state.activeMissions[0].player1Characters[0],
    sourceMissionIndex: 0,
    isUpgrade: true,
  } as never);
  const brut = JSON.parse((resultat.description as string) ?? '{}');
  return brut.targets ?? resultat.validTargets ?? [];
}

describe('Asuma 138 en amelioration', () => {
  it('trouve un ennemi de puissance egale dans sa mission', () => {
    const state = plateauAsuma(ASUMA);
    expect(ciblesUpgrade(state), 'meme carte, donc meme puissance').toEqual(['ennemi']);
  });

  it('ne propose personne quand aucune puissance ne correspond', () => {
    const state = plateauAsuma('KS-009-C');
    expect(ciblesUpgrade(state)).toEqual([]);
  });

  it('compare la puissance courante, jetons compris', () => {
    const state = plateauAsuma(ASUMA);
    state.activeMissions[0].player1Characters[0].powerTokens = 2;
    expect(ciblesUpgrade(state), 'Asuma monte a 6, l ennemi reste a 4').toEqual([]);

    state.activeMissions[0].player2Characters[0].powerTokens = 2;
    expect(ciblesUpgrade(state), 'les deux a 6, la cible redevient valable').toEqual(['ennemi']);
  });
});

describe('Kyubi 129 pose en amelioration par-dessus Naruto', () => {
  it('l amelioration souple est bien reconnue', () => {
    const kyubi = getCardById(KYUBI) as unknown as CharacterCard;
    const naruto = getCardById(NARUTO_2C) as unknown as CharacterCard;
    expect(checkFlexibleUpgrade(kyubi, naruto), 'Kyubi peut se poser sur un Naruto').toBe(true);
  });

  it('elle ne coute que la difference de chakra, pas le prix entier', () => {
    const state = buildSimState({
      p1: [simChar(NARUTO_2C, { owner: 'player1', instanceId: 'naruto' })],
      missions: 2,
      chakra1: 20,
      edgeHolder: 'player1',
    });
    state.phase = 'action';

    const kyubi = getCardById(KYUBI) as unknown as CharacterCard;
    const naruto = getCardById(NARUTO_2C) as unknown as CharacterCard;
    const complet = calculateEffectiveCost(state, 'player1', kyubi, 0, false);
    const difference = complet - (naruto.chakra ?? 0);

    expect(complet, 'le cout plein de Kyubi').toBe(7);
    expect(difference, 'pose sur un Naruto a 2, la difference est de 5').toBe(5);
  });
});
