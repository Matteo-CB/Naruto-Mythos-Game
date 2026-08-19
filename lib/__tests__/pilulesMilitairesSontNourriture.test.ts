import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter, attachCardToMission } from '@/lib/effects/attachments';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const PILULES = 'SS-102-UC';
const ICHIRAKU = 'SS-104-C';
const SANSHO = 'SS-067-C';
const PETIT = 'KS-011-C';

function plateau(): GameState {
  const s = buildSimState({
    p1: [simChar(PETIT, { owner: 'player1', instanceId: 'hote' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  return s;
}

describe('les PILULES MILITAIRES 102 sont de la nourriture', () => {
  it('la carte porte bien le mot-cle Nourriture et plus Arme', () => {
    const carte = getCardById(PILULES) as CardData;
    expect(carte.keywords, 'un seul mot-cle, Nourriture').toEqual(['Food']);
  });

  it('ICHIRAKU RAMEN 104 accorde son bonus au porteur', () => {
    let s = attachCardToMission(plateau(), 'player1', getCardById(ICHIRAKU) as CardData, 0);
    const avant = getEffectivePower(s, s.activeMissions[0].player1Characters[0], 'player1');
    s = attachCardToCharacter(s, 'player1', getCardById(PILULES) as CardData, 'hote');
    const apres = getEffectivePower(s, s.activeMissions[0].player1Characters[0], 'player1');
    expect(apres - avant, 'la puissance de l equipement plus le bonus nourriture').toBeGreaterThan(1);
  });

  it('GRAND-MERE SANSHO 067 rend les pilules moins cheres', () => {
    const carte = getCardById(PILULES) as CharacterCard;
    const sans = plateau();
    const avec = buildSimState({
      p1: [
        simChar(PETIT, { owner: 'player1', instanceId: 'hote' }),
        simChar(SANSHO, { owner: 'player1', instanceId: 'sansho' }),
      ],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    avec.phase = 'action';
    const prixSans = calculateEffectiveCost(sans, 'player1', carte, 0, false);
    const prixAvec = calculateEffectiveCost(avec, 'player1', carte, 0, false);
    expect(prixAvec, 'la remise nourriture s applique').toBeLessThan(prixSans);
  });
});
