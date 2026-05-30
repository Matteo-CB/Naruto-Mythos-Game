import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeEmit = vi.fn();
vi.mock('@/lib/quests/hooks', () => ({
  emitQuestEvent: (...a: unknown[]) => fakeEmit(...a),
}));

import { emitEngineQuestEvent, emitDrawDiffEvents, emitTokenDiffEvents } from '@/lib/quests/engineEmit';
import type { GameState } from '@/lib/engine/types';

function mockState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'g1',
    gameMode: 'ranked',
    player1UserId: 'u-p1',
    player2UserId: 'u-p2',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: { hand: [], deck: [], discardPile: [], missionPoints: 0, chakra: 0, mulliganUsed: true, charactersInPlay: 0, hasPassed: false } as never,
    player2: { hand: [], deck: [], discardPile: [], missionPoints: 0, chakra: 0, mulliganUsed: true, charactersInPlay: 0, hasPassed: false } as never,
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    ...overrides,
  } as GameState;
}

describe('emitEngineQuestEvent', () => {
  beforeEach(() => fakeEmit.mockReset());

  it('skips when state has no userIds', () => {
    const state = mockState({ player1UserId: undefined, player2UserId: undefined });
    emitEngineQuestEvent(state, 'player1', 'character.defeated');
    expect(fakeEmit).not.toHaveBeenCalled();
  });

  it('resolves player1 → player1UserId', () => {
    const state = mockState();
    emitEngineQuestEvent(state, 'player1', 'character.defeated');
    expect(fakeEmit).toHaveBeenCalledWith('character.defeated', 'u-p1', expect.objectContaining({ gameMode: 'ranked' }));
  });

  it('resolves player2 → player2UserId', () => {
    const state = mockState();
    emitEngineQuestEvent(state, 'player2', 'character.hidden');
    expect(fakeEmit).toHaveBeenCalledWith('character.hidden', 'u-p2', expect.objectContaining({ gameMode: 'ranked' }));
  });

  it('infers gameMode from state', () => {
    emitEngineQuestEvent(mockState({ gameMode: 'evolving' }), 'player1', 'foo');
    expect(fakeEmit).toHaveBeenCalledWith('foo', 'u-p1', expect.objectContaining({ gameMode: 'evolving' }));
  });

  it('merges custom payload with gameMode', () => {
    emitEngineQuestEvent(mockState(), 'player1', 'foo', { sourceName: 'KISAME', delta: 5 });
    expect(fakeEmit).toHaveBeenCalledWith('foo', 'u-p1', expect.objectContaining({
      gameMode: 'ranked', sourceName: 'KISAME', delta: 5,
    }));
  });
});

describe('emitDrawDiffEvents', () => {
  beforeEach(() => fakeEmit.mockReset());

  it('emits card.drawn.via_effect for delta > 0', () => {
    const oldState = mockState({ phase: 'action' });
    oldState.player1.hand = [];
    const newState = mockState({ phase: 'action' });
    newState.player1.hand = [{ id: 'a' }, { id: 'b' }] as never;
    emitDrawDiffEvents(oldState, newState);
    expect(fakeEmit).toHaveBeenCalledWith('card.drawn.via_effect', 'u-p1', expect.objectContaining({ delta: 2 }));
  });

  it('does NOT emit when phase was start (natural draw)', () => {
    const oldState = mockState({ phase: 'start' });
    const newState = mockState({ phase: 'action' });
    newState.player1.hand = [{ id: 'a' }] as never;
    emitDrawDiffEvents(oldState, newState);
    expect(fakeEmit).not.toHaveBeenCalled();
  });

  it('handles partial / undefined states defensively', () => {
    expect(() => emitDrawDiffEvents(null as never, mockState())).not.toThrow();
    expect(() => emitDrawDiffEvents(mockState(), null as never)).not.toThrow();
  });
});

describe('emitTokenDiffEvents', () => {
  beforeEach(() => fakeEmit.mockReset());

  it('emits power_token.added when delta > 0', () => {
    const oldState = mockState();
    oldState.activeMissions = [{
      card: {} as never, rank: 'D', basePoints: 1, rankBonus: 1, wonBy: null,
      player1Characters: [{ instanceId: '1', card: { name_fr: 'X' } as never, isHidden: false, wasRevealedAtLeastOnce: true, powerTokens: 2, stack: [], controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 }],
      player2Characters: [],
    }];
    const newState = mockState();
    newState.activeMissions = [{
      ...oldState.activeMissions[0],
      player1Characters: [{ ...oldState.activeMissions[0].player1Characters[0], powerTokens: 7 }],
    }];
    emitTokenDiffEvents(oldState, newState);
    const tokenEmits = fakeEmit.mock.calls.filter((c) => c[0] === 'power_token.added');
    expect(tokenEmits.length).toBeGreaterThan(0);
    expect(tokenEmits[0][2]).toMatchObject({ delta: 5 });
  });

  it('emits character.power_tokens.threshold when char ≥ 10 tokens', () => {
    const newState = mockState();
    newState.activeMissions = [{
      card: {} as never, rank: 'D', basePoints: 1, rankBonus: 1, wonBy: null,
      player1Characters: [{ instanceId: '1', card: { name_fr: 'ROCK LEE' } as never, isHidden: false, wasRevealedAtLeastOnce: true, powerTokens: 10, stack: [], controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 }],
      player2Characters: [],
    }];
    emitTokenDiffEvents(mockState(), newState);
    const thresholdEmits = fakeEmit.mock.calls.filter((c) => c[0] === 'character.power_tokens.threshold');
    expect(thresholdEmits.length).toBeGreaterThan(0);
    expect(thresholdEmits[0][2]).toMatchObject({ name: 'ROCK LEE', threshold: 10 });
  });
});
