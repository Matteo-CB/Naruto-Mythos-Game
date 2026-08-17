import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { executeEndPhase } from '@/lib/engine/phases/EndPhase';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const ENMA = 'SS-132-R';
const NYOI = 'SS-098-UC';
const ALLIE = 'KS-011-C';

function plateau(): GameState {
  const state = buildSimState({
    p1: [simChar(ENMA, { owner: 'player1', instanceId: 'enma' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.activeMissions[1].player1Characters.push(
    simChar(ALLIE, { owner: 'player1', instanceId: 'ailleurs', missionIndex: 1 }));
  const nyoi = getCardById(NYOI);
  state.player1.deck = [nyoi as CharacterCard, getCardById(ALLIE) as CharacterCard];
  return state;
}

describe('Enma 132 peut poser le Nyoi Adamantin sur n importe quelle mission', () => {
  it('un porteur situe sur une autre mission est propose', () => {
    const apres = executeEndPhase(plateau());
    const question = apres.pendingActions[0];
    expect(question, 'une question de porteur est posee').toBeDefined();
    expect(
      question.options,
      'le porteur d une autre mission fait partie des choix',
    ).toContain('ailleurs');
    expect(question.options, 'Enma lui-meme reste un choix').toContain('enma');
  });
});
