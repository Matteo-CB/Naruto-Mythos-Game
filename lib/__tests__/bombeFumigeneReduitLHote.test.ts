import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const FUMIGENE = 'SS-086-C';
const HOTE = 'KS-011-C';

function plateau(avecFumigene: boolean): GameState {
  let state = buildSimState({
    p1: [simChar(HOTE, { owner: 'player1', instanceId: 'hote', hidden: true })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  if (avecFumigene) {
    state = attachCardToCharacter(state, 'player1', getCardById(FUMIGENE) as CardData, 'hote');
  }
  return state;
}

function prixDeRevelation(state: GameState): number {
  const hote = state.activeMissions[0].player1Characters.find((c) => c.instanceId === 'hote')!;
  const sommet = hote.stack[hote.stack.length - 1];
  return calculateEffectiveCost(state, 'player1', sommet, 0, true, hote);
}

describe('la Bombe Fumigene reduit le cout de son hote, pas le sien', () => {
  it('sans elle, l hote se revele a son cout imprime', () => {
    const carte = getCardById(HOTE) as CharacterCard;
    expect(prixDeRevelation(plateau(false))).toBe(carte.chakra);
  });

  it('avec elle sur l hote, la revelation coute 1 de moins', () => {
    const carte = getCardById(HOTE) as CharacterCard;
    expect(prixDeRevelation(plateau(true)), 'la remise vient de l equipement porte').toBe(carte.chakra - 1);
  });

  it('la Bombe Fumigene ne se reduit plus elle-meme', () => {
    const etat = plateau(false);
    const fumigene = getCardById(FUMIGENE) as CharacterCard;
    expect(
      calculateEffectiveCost(etat, 'player1', fumigene, 0, true),
      'sans hote porteur, aucune remise sur elle-meme',
    ).toBe(fumigene.chakra);
  });
});
