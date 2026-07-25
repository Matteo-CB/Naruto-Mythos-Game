import { describe, it, expect } from 'vitest';
import {
  hasOutstandingInputFor,
  hasUnanswerablePendingEffects,
  missionAdvanceIsDue,
  repairStuckState,
  whoseInputIsAwaited,
} from '@/lib/socket/server';
import { createChessClock } from '@/lib/timing/chessClock';
import type { RoomData } from '@/lib/socket/server';
import type { GameState, PendingEffect, PlayerID } from '@/lib/engine/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: {} as never,
    player2: {} as never,
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    ...overrides,
  } as GameState;
}

function orphanEffect(sourcePlayer: PlayerID = 'player1', resolved = false): PendingEffect {
  return {
    id: 'orphan-1',
    sourceCardId: 'KS-001-C',
    sourceInstanceId: 'inst-1',
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: '',
    targetSelectionType: 'character',
    sourcePlayer,
    requiresTargetSelection: true,
    validTargets: [],
    isOptional: false,
    isMandatory: true,
    resolved,
    isUpgrade: false,
  };
}

function makeRoom(state: GameState | null, overrides: Partial<RoomData> = {}): RoomData {
  return {
    code: 'TEST01',
    chessClock: createChessClock(),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    gameState: state,
    finalized: false,
    ...overrides,
  } as RoomData;
}

describe('hasOutstandingInputFor', () => {
  it('sees a pending action addressed to the player', () => {
    const state = makeState({
      pendingActions: [{ id: 'pa', type: 'SELECT_TARGET', player: 'player2', description: '' }] as never,
    });
    expect(hasOutstandingInputFor(state, 'player2')).toBe(true);
    expect(hasOutstandingInputFor(state, 'player1')).toBe(false);
  });

  it('sees an unresolved effect the player owns or selects', () => {
    const state = makeState({ pendingEffects: [orphanEffect('player2')] });
    expect(hasOutstandingInputFor(state, 'player2')).toBe(true);
    expect(hasOutstandingInputFor(state, 'player1')).toBe(false);
  });

  it('ignores an already resolved effect', () => {
    const state = makeState({ pendingEffects: [orphanEffect('player2', true)] });
    expect(hasOutstandingInputFor(state, 'player2')).toBe(false);
  });
});

describe('hasUnanswerablePendingEffects', () => {
  it('is false when a pending action exists to answer the effect', () => {
    const state = makeState({
      pendingEffects: [orphanEffect()],
      pendingActions: [{ id: 'pa', type: 'SELECT_TARGET', player: 'player1', description: '' }] as never,
    });
    expect(hasUnanswerablePendingEffects(state)).toBe(false);
  });

  it('is true when an unresolved effect has no pending action at all', () => {
    expect(hasUnanswerablePendingEffects(makeState({ pendingEffects: [orphanEffect()] }))).toBe(true);
  });

  it('is false for a clean state or a null state', () => {
    expect(hasUnanswerablePendingEffects(makeState())).toBe(false);
    expect(hasUnanswerablePendingEffects(null)).toBe(false);
  });
});

describe('repairStuckState', () => {
  it('drops the unanswerable effects and reports that it repaired something', () => {
    const room = makeRoom(makeState({ phase: 'end', pendingEffects: [orphanEffect()] }));
    expect(repairStuckState(room)).toBe(true);
    expect(room.gameState!.pendingEffects).toEqual([]);
  });

  it('also clears a leaked forced resolver so the clock is not held hostage', () => {
    const room = makeRoom(makeState({ phase: 'end', pendingEffects: [orphanEffect()], pendingForcedResolver: 'player2' }));
    repairStuckState(room);
    expect(room.gameState!.pendingForcedResolver).toBeUndefined();
  });

  it('never touches a healthy state', () => {
    const room = makeRoom(makeState({
      pendingEffects: [orphanEffect()],
      pendingActions: [{ id: 'pa', type: 'SELECT_TARGET', player: 'player1', description: '' }] as never,
    }));
    expect(repairStuckState(room)).toBe(false);
    expect(room.gameState!.pendingEffects.length).toBe(1);
  });

  it('is a no-op on a finalized room or a room with no state', () => {
    expect(repairStuckState(makeRoom(null))).toBe(false);
    expect(repairStuckState(makeRoom(makeState({ pendingEffects: [orphanEffect()] }), { finalized: true }))).toBe(false);
  });

  it('makes the end phase advanceable again: no awaited input once repaired', () => {
    const room = makeRoom(makeState({ phase: 'end', pendingEffects: [orphanEffect('player2')] }));
    expect(whoseInputIsAwaited(room.gameState)).toBe('player2');
    repairStuckState(room);
    expect(whoseInputIsAwaited(room.gameState)).toBe(null);
  });
});

describe('missionAdvanceIsDue', () => {
  it('is due when mission scoring is complete with nothing pending', () => {
    expect(missionAdvanceIsDue(makeState({ phase: 'mission', missionScoringComplete: true }))).toBe(true);
  });

  it('is not due while a pending action is open', () => {
    const state = makeState({
      phase: 'mission',
      missionScoringComplete: true,
      pendingActions: [{ id: 'pa', type: 'SELECT_TARGET', player: 'player1', description: '' }] as never,
    });
    expect(missionAdvanceIsDue(state)).toBe(false);
  });

  it('is not due outside the mission phase or before scoring completes', () => {
    expect(missionAdvanceIsDue(makeState({ phase: 'action', missionScoringComplete: true }))).toBe(false);
    expect(missionAdvanceIsDue(makeState({ phase: 'mission' }))).toBe(false);
    expect(missionAdvanceIsDue(null)).toBe(false);
  });
});
