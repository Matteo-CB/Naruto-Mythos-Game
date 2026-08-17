import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { putTopCardAsHidden } from '@/lib/effects/handlers/SS/attachmentReinforcements';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const RENFORTS = 'SS-109-UC';
const RENFORTS_NOM = 'RENFORTS PLANIFIES';
const CARTE_DU_DECK = 'KS-009-C';
const AUTRE = 'KS-011-C';

function plateauAvecRenfort(): GameState {
  const state = buildSimState({
    p1: [simChar(AUTRE, { owner: 'player1', instanceId: 'allie' })],
    missions: 2,
    chakra1: 20,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.deck = [
    getCardById(CARTE_DU_DECK) as CharacterCard,
    getCardById(AUTRE) as CharacterCard,
  ];
  return putTopCardAsHidden(state, 'player1', 0, RENFORTS_NOM, RENFORTS);
}

function renfortEnJeu(state: GameState) {
  return state.activeMissions[0].player1Characters.find((c) => c.instanceId !== 'allie')!;
}

describe('un renfort planifie se comporte comme un personnage normal', () => {
  it('il quitte le deck et porte bien sa carte dans sa pile', () => {
    const state = plateauAvecRenfort();
    const renfort = renfortEnJeu(state);
    expect(renfort.isHidden, 'il arrive face cachee').toBe(true);
    expect(renfort.stack.map((c) => c.id), 'sa pile contient sa carte').toEqual([CARTE_DU_DECK]);
    expect(state.player1.deck.map((c) => c.id), 'la carte a bien quitte le deck').toEqual([AUTRE]);
  });

  it('vaincu, il part a la defausse et ne revient pas sur le deck', () => {
    const state = plateauAvecRenfort();
    const renfort = renfortEnJeu(state);
    const apres = EffectEngine.defeatCharacter(state, renfort.instanceId, 'player2');

    expect(
      apres.player1.discardPile.map((c) => c.id),
      'la carte vaincue rejoint la defausse',
    ).toEqual([CARTE_DU_DECK]);
    expect(
      apres.player1.deck.map((c) => c.id),
      'et surtout, elle ne remonte pas sur le deck',
    ).toEqual([AUTRE]);
    expect(
      apres.activeMissions[0].player1Characters.map((c) => c.instanceId),
      'il ne reste plus en jeu',
    ).toEqual(['allie']);
  });
});
