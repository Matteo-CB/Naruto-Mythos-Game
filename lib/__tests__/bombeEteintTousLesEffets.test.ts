import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const BOMBE = 'SS-083-UC';
const TAYUYA = 'KS-125-R';
const ITACHI_AURA = 'KS-128-R';
const JOUE = 'KS-011-C';

function plateau(idEnnemi: string): GameState {
  const state = buildSimState({
    p1: [simChar(JOUE, { owner: 'player1', instanceId: 'allie' })],
    p2: [simChar(idEnnemi, { owner: 'player2', instanceId: 'ennemi' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function avecBombe(state: GameState): GameState {
  return attachCardToCharacter(state, 'player1', getCardById(BOMBE) as CardData, 'ennemi');
}

describe('la Bombe Aveuglante rend la carte totalement vanille', () => {
  it('la surtaxe de TAYUYA 125 disparait', () => {
    const carte = getCardById(JOUE) as CharacterCard;
    const sans = plateau(TAYUYA);
    expect(
      calculateEffectiveCost(sans, 'player1', carte, 0, false),
      'sans bombe, Tayuya fait payer 1 de plus',
    ).toBe(carte.chakra + 1);

    expect(
      calculateEffectiveCost(avecBombe(sans), 'player1', carte, 0, false),
      'avec la bombe, plus aucune surtaxe',
    ).toBe(carte.chakra);
  });

  it('les autres effets continus etaient deja eteints, la puissance le confirme', () => {
    const sans = plateau(ITACHI_AURA);
    const avecLaBombe = avecBombe(sans);
    const allie = avecLaBombe.activeMissions[0].player1Characters[0];
    const attendu = (getCardById(JOUE) as CharacterCard).power ?? 0;
    expect(
      getEffectivePower(avecLaBombe, allie, 'player1'),
      'aucune aura ennemie ne s applique a travers la bombe',
    ).toBe(attendu);
  });
});
