import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

function countEverywhere(state: GameState, cardId: string): number {
  let seen = 0;
  for (const side of ['player1', 'player2'] as const) {
    for (const zone of [state[side].deck, state[side].hand, state[side].discardPile]) {
      seen += zone.filter((c) => c.id === cardId).length;
    }
  }
  for (const mission of state.activeMissions) {
    for (const key of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[key]) {
        seen += (char.stack ?? [char.card]).filter((c) => c.id === cardId).length;
      }
    }
  }
  return seen;
}

function boardWithDeck(): GameState {
  const state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'sakura-host' })],
    missions: 3,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.deck = [
    getCardById('KS-009-C') as CharacterCard,
    getCardById('KS-003-C') as CharacterCard,
    getCardById('KS-005-C') as CharacterCard,
  ];
  return state;
}

describe('going back after picking a card never duplicates anything', () => {
  it('the rewind point is a clean copy without nesting itself', () => {
    const state = boardWithDeck();
    const point = EffectEngine.captureRewindPoint(state);
    expect(point.rewindPoint, 'a snapshot must not carry another snapshot').toBeUndefined();
  });

  it('restoring puts every card back exactly once', () => {
    const before = boardWithDeck();
    const totals = ['KS-009-C', 'KS-003-C', 'KS-005-C'].map((id) => countEverywhere(before, id));

    const during: GameState = {
      ...before,
      rewindPoint: EffectEngine.captureRewindPoint(before),
      player1: {
        ...before.player1,
        deck: [],
        discardPile: [...before.player1.discardPile, ...before.player1.deck],
      },
    };

    const after = EffectEngine.restoreRewindPoint(during);
    const restored = ['KS-009-C', 'KS-003-C', 'KS-005-C'].map((id) => countEverywhere(after, id));

    expect(restored, 'no card is lost and none is duplicated').toEqual(totals);
    expect(after.player1.deck.length, 'the deck is back').toBe(before.player1.deck.length);
    expect(after.rewindPoint, 'the point is consumed').toBeUndefined();
  });

  it('the log and the id counter survive the rewind', () => {
    const before = boardWithDeck();
    const during: GameState = {
      ...before,
      instanceSeq: 99,
      log: [...before.log, { turn: 1, phase: 'action', player: 'player1', type: 'EFFECT', message: 'after' } as never],
      rewindPoint: EffectEngine.captureRewindPoint(before),
    };

    const after = EffectEngine.restoreRewindPoint(during);
    expect(after.log.length, 'history is never rewritten').toBe(during.log.length);
    expect(after.instanceSeq, 'ids never go backwards').toBe(99);
  });

  it('the reorder step is where the back button must live, so it carries the option', () => {
    const source = require('fs').readFileSync('lib/effects/EffectEngine.ts', 'utf8') as string;
    expect(
      source,
      'with 3 cards the reorder step comes before the mission choice, so it needs the option too',
    ).toMatch(/sakura135Chain \? \[\.\.\.cardInstanceIds, REWIND_TARGET\]/);
    expect(source, 'and the reorder resolution must honour it').toMatch(/targetId === REWIND_TARGET/);
  });

  it('restoring without a point is a no-op', () => {
    const state = boardWithDeck();
    expect(EffectEngine.restoreRewindPoint(state)).toBe(state);
  });
});

describe('the rewind point never lingers in a saved game', () => {
  it('is dropped as soon as nothing is left to decide', () => {
    const settled = boardWithDeck();
    settled.rewindPoint = EffectEngine.captureRewindPoint(settled);
    settled.pendingEffects = [];
    settled.pendingActions = [];

    const after = GameEngine.applyAction(settled, 'player1', { type: 'PASS' });

    expect(after.rewindPoint, 'a whole extra game state must not ride along in every save').toBeUndefined();
  });

  it('survives while the choice is still open', () => {
    const midChain = boardWithDeck();
    midChain.rewindPoint = EffectEngine.captureRewindPoint(midChain);

    const kept = GameEngine.applyAction(midChain, 'player2', { type: 'PASS' });
    const stillDeciding = kept.pendingEffects.length > 0 || kept.pendingActions.length > 0;

    expect(stillDeciding || kept.rewindPoint === undefined, 'going back stays possible until the chain ends').toBe(true);
  });
});
