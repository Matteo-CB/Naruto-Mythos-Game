import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import {
  handleChessClockIdleLimit,
  handleChessClockExpiry,
  type RoomData,
} from '@/lib/socket/server';
import {
  createChessClock,
  arm,
  consumeIdleWarning,
} from '@/lib/timing/chessClock';
import type { GameState, PendingAction, PendingEffect, PlayerID, GameAction } from '@/lib/engine/types';

type EmitRecord = { room: string; event: string; payload: any };

function makeIoMock(): { io: any; emits: EmitRecord[] } {
  const emits: EmitRecord[] = [];
  const io: any = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        emits.push({ room, event, payload });
      },
    }),
  };
  return { io, emits };
}

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
  };
}

function makePendingAction(player: PlayerID, overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: 'pa-1',
    type: 'SELECT_TARGET',
    player,
    description: 'Test pending action',
    options: ['opt-1', 'opt-2'],
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: 'pe-1',
    ...overrides,
  };
}

function makePendingEffect(selectingPlayer: PlayerID, overrides: Partial<PendingEffect> = {}): PendingEffect {
  return {
    id: 'pe-1',
    sourceCardId: 'KS-001-C',
    sourceInstanceId: 'inst-1',
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: 'Test',
    targetSelectionType: 'character',
    sourcePlayer: 'player1',
    requiresTargetSelection: false,
    validTargets: [],
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
    selectingPlayer,
    ...overrides,
  };
}

function makeRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    code: 'TEST01',
    hostSocket: 'host-sock',
    guestSocket: 'guest-sock',
    chessClock: arm(createChessClock(), 'player1', 0),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    gameState: makeState(),
    finalized: false,
    spectators: new Map(),
    ...overrides,
  } as RoomData;
}

describe('handleChessClockIdleLimit', () => {
  let applySpy: ReturnType<typeof vi.spyOn>;
  let winnerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    applySpy = vi.spyOn(GameEngine, 'applyAction').mockImplementation((state: any) => state);
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue(null);
  });

  afterEach(() => {
    applySpy.mockRestore();
    winnerSpy.mockRestore();
  });

  it('2nd idle (warning already used) -> FORFEIT (instant defeat)', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    room.chessClock = consumeIdleWarning(room.chessClock);
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    const call = applySpy.mock.calls[0];
    expect(call[1]).toBe('player1');
    expect((call[2] as GameAction).type).toBe('FORFEIT');
  });

  it('mandatory pendingAction (mandatory source effect) -> FORFEIT', () => {
    const { io } = makeIoMock();
    const pe = makePendingEffect('player1', { isOptional: false, isMandatory: true, rootOptional: false });
    const pa = makePendingAction('player1', { sourceEffectId: pe.id });
    const room = makeRoom({
      gameState: makeState({ pendingActions: [pa], pendingEffects: [pe] }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('FORFEIT');
    expect(room.chessClock.player1.idleWarningUsed).toBe(false);
  });

  it('optional pendingAction (isOptional source effect) -> DECLINE_OPTIONAL_EFFECT + warning consumed', () => {
    const { io } = makeIoMock();
    const pe = makePendingEffect('player1', { isOptional: true, isMandatory: false });
    const pa = makePendingAction('player1', { sourceEffectId: pe.id });
    const room = makeRoom({
      gameState: makeState({ pendingActions: [pa], pendingEffects: [pe] }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect(action.type).toBe('DECLINE_OPTIONAL_EFFECT');
    expect((action as Extract<GameAction, { type: 'DECLINE_OPTIONAL_EFFECT' }>).pendingEffectId).toBe(pe.id);
    expect(room.chessClock.player1.idleWarningUsed).toBe(true);
  });

  it('rootOptional pendingAction -> DECLINE_OPTIONAL_EFFECT + warning consumed', () => {
    const { io } = makeIoMock();
    const pe = makePendingEffect('player1', { isOptional: false, isMandatory: true, rootOptional: true });
    const pa = makePendingAction('player1', { sourceEffectId: pe.id });
    const room = makeRoom({
      gameState: makeState({ pendingActions: [pa], pendingEffects: [pe] }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('DECLINE_OPTIONAL_EFFECT');
    expect(room.chessClock.player1.idleWarningUsed).toBe(true);
  });

  it('optional pendingEffect (no action) -> DECLINE_OPTIONAL_EFFECT + warning consumed', () => {
    const { io } = makeIoMock();
    const pe = makePendingEffect('player1', { isOptional: true, isMandatory: false });
    const room = makeRoom({
      gameState: makeState({ pendingEffects: [pe] }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('DECLINE_OPTIONAL_EFFECT');
    expect(room.chessClock.player1.idleWarningUsed).toBe(true);
  });

  it('mandatory pendingEffect (no action) -> FORFEIT', () => {
    const { io } = makeIoMock();
    const pe = makePendingEffect('player1', { isOptional: false, isMandatory: true });
    const room = makeRoom({
      gameState: makeState({ pendingEffects: [pe] }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('FORFEIT');
    expect(room.chessClock.player1.idleWarningUsed).toBe(false);
  });

  it('action phase (no pending input) -> PASS + warning consumed', () => {
    const { io } = makeIoMock();
    const room = makeRoom({
      gameState: makeState({ phase: 'action', activePlayer: 'player1' }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('PASS');
    expect(room.chessClock.player1.idleWarningUsed).toBe(true);
  });

  it('action phase but pendingForcedResolver set -> falls through to unhandled FORFEIT', () => {
    const { io } = makeIoMock();
    const room = makeRoom({
      gameState: makeState({
        phase: 'action',
        activePlayer: 'player1',
        pendingForcedResolver: 'player1',
      }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('FORFEIT');
  });

  it('mission phase with no pending input for player -> FORFEIT (unhandled)', () => {
    const { io } = makeIoMock();
    const room = makeRoom({
      gameState: makeState({ phase: 'mission' }),
    });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('FORFEIT');
  });

  it('no-op if gameState is null', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ gameState: null });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('no-op if room is finalized', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ finalized: true });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('applyAction throwing during auto-decline falls back to FORFEIT', () => {
    const { io } = makeIoMock();
    let callCount = 0;
    applySpy.mockImplementation((state: any, _player, action: any) => {
      callCount++;
      if (callCount === 1 && action.type === 'DECLINE_OPTIONAL_EFFECT') {
        throw new Error('boom');
      }
      return state;
    });
    const pe = makePendingEffect('player1', { isOptional: true, isMandatory: false });
    const room = makeRoom({ gameState: makeState({ pendingEffects: [pe] }) });
    handleChessClockIdleLimit(room, 'player1', io);
    expect(applySpy).toHaveBeenCalledTimes(2);
    expect((applySpy.mock.calls[1][2] as GameAction).type).toBe('FORFEIT');
  });

  it('idle for player2 when player2 has the pending action -> their warning is consumed (not player1s)', () => {
    const { io } = makeIoMock();
    const pe = makePendingEffect('player2', { isOptional: true, isMandatory: false });
    const pa = makePendingAction('player2', { sourceEffectId: pe.id });
    const room = makeRoom({
      chessClock: arm(createChessClock(), 'player2', 0),
      gameState: makeState({ pendingActions: [pa], pendingEffects: [pe], activePlayer: 'player2' }),
    });
    handleChessClockIdleLimit(room, 'player2', io);
    expect(room.chessClock.player2.idleWarningUsed).toBe(true);
    expect(room.chessClock.player1.idleWarningUsed).toBe(false);
  });
});

describe('handleChessClockExpiry (extended union for Phase 4)', () => {
  let applySpy: ReturnType<typeof vi.spyOn>;
  let getWinnerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    applySpy = vi.spyOn(GameEngine, 'applyAction').mockImplementation((state: any) => state);
    getWinnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue('player2');
  });

  afterEach(() => {
    applySpy.mockRestore();
    getWinnerSpy.mockRestore();
  });

  it('accepts idle-unhandled reason', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    expect(() => handleChessClockExpiry(room, 'player1', io, 'idle-unhandled')).not.toThrow();
    expect(applySpy).toHaveBeenCalled();
    expect((applySpy.mock.calls[0][2] as GameAction).type).toBe('FORFEIT');
  });
});
