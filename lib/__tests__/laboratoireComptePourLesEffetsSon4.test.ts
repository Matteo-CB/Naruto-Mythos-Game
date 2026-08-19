import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToMission } from '@/lib/effects/attachments';
import { getEffectHandler, initializeRegistry } from '@/lib/effects/EffectRegistry';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const LABO = 'SS-105-UC';

function plateau(idSource: string, avecLabo: boolean): GameState {
  let s = buildSimState({
    p1: [
      simChar(idSource, { owner: 'player1', instanceId: 'source' }),
      simChar('KS-011-C', { owner: 'player1', instanceId: 'compagnon' }),
    ],
    p2: [simChar('KS-013-C', { owner: 'player2', instanceId: 'ennemi' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.player1.deck = ['KS-011-C', 'KS-013-C', 'KS-015-C'].map((i) => getCardById(i) as CharacterCard);
  if (avecLabo) s = attachCardToMission(s, 'player1', getCardById(LABO) as CardData, 0);
  return s;
}

function refuse(idSource: string, avecLabo: boolean): boolean {
  initializeRegistry();
  const s = plateau(idSource, avecLabo);
  const handler = getEffectHandler(idSource, 'MAIN')!;
  const r = handler({
    state: s, sourcePlayer: 'player1', sourceCard: s.activeMissions[0].player1Characters[0],
    sourceMissionIndex: 0, isUpgrade: false,
  } as never);
  return r.state.log.some((l) => l.messageKey === 'game.log.effect.noTarget');
}

describe('le LABORATOIRE 105 compte pour toutes les cartes qui comptent des Son 4', () => {
  it('SAKON 061 ne refuse plus quand seul le laboratoire est present', () => {
    expect(refuse('KS-061-C', false), 'sans laboratoire, aucun Son 4 allie').toBe(true);
    expect(refuse('KS-061-C', true), 'le laboratoire fournit le Son 4 manquant').toBe(false);
  });

  it('KIDOMARU 059 en profite aussi', () => {
    expect(refuse('KS-059-C', false)).toBe(true);
    expect(refuse('KS-059-C', true)).toBe(false);
  });

  it('DOKI 066 en profite aussi', () => {
    expect(refuse('KS-066-UC', false)).toBe(true);
    expect(refuse('KS-066-UC', true)).toBe(false);
  });

  it('la remise de cout du SAKON 036 fonctionnait deja et continue', () => {
    const carte = getCardById('SS-036-C') as CharacterCard;
    expect(calculateEffectiveCost(plateau('KS-011-C', false), 'player1', carte, 0, false)).toBe(carte.chakra);
    expect(calculateEffectiveCost(plateau('KS-011-C', true), 'player1', carte, 0, false)).toBe(carte.chakra - 1);
  });
});
