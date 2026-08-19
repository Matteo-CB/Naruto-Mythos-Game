import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
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
    const hote = state.activeMissions[0].player1Characters[0];
    hote.attachments = [{
      instanceId: 'fumigene', card: getCardById(FUMIGENE) as CardData, owner: 'player1',
    }];
  }
  return state;
}

function chakraPayePourReveler(avecFumigene: boolean): number {
  const depart = plateau(avecFumigene);
  const avant = depart.player1.chakra;
  const apres = GameEngine.applyAction(depart, 'player1', {
    type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'hote',
  } as never);
  const revele = apres.activeMissions[0].player1Characters.find((c) => c.instanceId === 'hote');
  expect(revele?.isHidden, 'la revelation a bien eu lieu').toBe(false);
  return avant - apres.player1.chakra;
}

describe('la BOMBE FUMIGENE 086 fait vraiment payer 1 de moins a la revelation', () => {
  it('sans elle, la revelation coute le prix imprime', () => {
    const carte = getCardById(HOTE) as CharacterCard;
    expect(chakraPayePourReveler(false)).toBe(carte.chakra);
  });

  it('avec elle sur la carte cachee, la revelation coute 1 de moins', () => {
    const carte = getCardById(HOTE) as CharacterCard;
    expect(chakraPayePourReveler(true), 'la remise est reellement debitee').toBe(carte.chakra - 1);
  });

  it('elle peut bien etre posee sur un personnage cache', () => {
    const s = plateau(true);
    const hote = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'hote')!;
    expect(hote.isHidden, 'l hote reste cache').toBe(true);
    expect(
      (hote.attachments ?? []).some((a) => a.card.id === FUMIGENE),
      'l equipement tient sur une carte face cachee',
    ).toBe(true);
  });
});
