import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToMission } from '@/lib/effects/attachments';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { friendlySoundFourCount } from '@/lib/effects/handlers/SS/jirobo033';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const LABO = 'SS-105-UC';
const JIROBO_057 = 'KS-057-C';
const JIROBO_033 = 'SS-033-UC';

function plateau(avecLabo: boolean, idPerso: string): GameState {
  let state = buildSimState({
    p1: [simChar(idPerso, { owner: 'player1', instanceId: 'jirobo' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  if (avecLabo) state = attachCardToMission(state, 'player1', getCardById(LABO) as CardData, 0);
  return state;
}

describe('le LABORATOIRE DE L ILE DU DEMON compte comme un allie Son 4', () => {
  it('il fournit un allie Son 4 supplementaire dans sa mission', () => {
    const sans = plateau(false, JIROBO_033);
    const avec = plateau(true, JIROBO_033);
    expect(friendlySoundFourCount(sans, 'player1', 0, 'jirobo'), 'sans lui, aucun allie').toBe(0);
    expect(friendlySoundFourCount(avec, 'player1', 0, 'jirobo'), 'avec lui, un allie').toBe(1);
  });

  it('il fait baisser le cout des Son 4 comme un vrai allie', () => {
    const carte = getCardById('SS-032-C') as CharacterCard;
    const sans = plateau(false, JIROBO_033);
    const avec = plateau(true, JIROBO_033);
    expect(calculateEffectiveCost(sans, 'player1', carte, 0, false)).toBe(carte.chakra);
    expect(calculateEffectiveCost(avec, 'player1', carte, 0, false), 'un chakra de moins').toBe(carte.chakra - 1);
  });

  it('sa mission compte pour les effets qui comptent les missions avec un Son 4', () => {
    const sans = plateau(false, JIROBO_057);
    const avec = plateau(true, JIROBO_057);
    const puissance = (s: GameState) => getEffectivePower(s, s.activeMissions[0].player1Characters[0], 'player1');
    expect(puissance(avec) >= puissance(sans), 'la mission equipee est bien comptee').toBe(true);
  });
});
