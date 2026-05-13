import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import {
  handleChessClockExpiry,
  chessClockExpiryReasonToWinReason,
  type RoomData,
  type ChessClockExpiryReason,
} from '@/lib/socket/server';
import { createChessClock, arm } from '@/lib/timing/chessClock';
import type { GameState, GameAction } from '@/lib/engine/types';

type EmitRecord = { room: string; event: string; payload: any };

function makeIoMock(): { io: any; emits: EmitRecord[] } {
  const emits: EmitRecord[] = [];
  const io: any = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => emits.push({ room, event, payload }),
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

function makeRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    code: 'TEST01',
    hostSocket: 'host-sock',
    guestSocket: 'guest-sock',
    chessClock: arm(createChessClock(), 'player1', 0),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: 'action:player1:1',
    gameState: makeState(),
    finalized: false,
    spectators: new Map(),
    ...overrides,
  } as RoomData;
}

describe('chessClockExpiryReasonToWinReason', () => {
  it('maps bank-empty -> clock', () => {
    expect(chessClockExpiryReasonToWinReason('bank-empty')).toBe('clock');
  });
  it('maps idle-second -> idle', () => {
    expect(chessClockExpiryReasonToWinReason('idle-second')).toBe('idle');
  });
  it('maps idle-mandatory -> idle', () => {
    expect(chessClockExpiryReasonToWinReason('idle-mandatory')).toBe('idle');
  });
  it('maps idle-unhandled -> idle', () => {
    expect(chessClockExpiryReasonToWinReason('idle-unhandled')).toBe('idle');
  });
});

describe('handleChessClockExpiry (Phase 5)', () => {
  let applySpy: ReturnType<typeof vi.spyOn>;
  let winnerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    applySpy = vi.spyOn(GameEngine, 'applyAction').mockImplementation((state: any) => ({
      ...state,
      forfeitedBy: 'player1',
      phase: 'gameOver',
    }));
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue('player2');
  });

  afterEach(() => {
    applySpy.mockRestore();
    winnerSpy.mockRestore();
  });

  it("bank-empty -> applyAction(FORFEIT, reason='clock')", () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    handleChessClockExpiry(room, 'player1', io, 'bank-empty');
    expect(applySpy).toHaveBeenCalled();
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect(action.type).toBe('FORFEIT');
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('clock');
  });

  it("idle-second -> applyAction(FORFEIT, reason='idle')", () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    handleChessClockExpiry(room, 'player1', io, 'idle-second');
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('idle');
  });

  it("idle-mandatory -> applyAction(FORFEIT, reason='idle')", () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    handleChessClockExpiry(room, 'player1', io, 'idle-mandatory');
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('idle');
  });

  it("idle-unhandled -> applyAction(FORFEIT, reason='idle')", () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    handleChessClockExpiry(room, 'player1', io, 'idle-unhandled');
    const action = applySpy.mock.calls[0][2] as GameAction;
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('idle');
  });

  it('disarms the chess clock after FORFEIT', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    expect(room.chessClock.active).toBe('player1');
    handleChessClockExpiry(room, 'player1', io, 'bank-empty');
    expect(room.chessClock.active).toBeNull();
    expect(room.chessClockLastInputKey).toBeNull();
  });

  it('no-op when room is already finalized', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ finalized: true });
    handleChessClockExpiry(room, 'player1', io, 'bank-empty');
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('no-op when gameState is null', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ gameState: null });
    handleChessClockExpiry(room, 'player1', io, 'bank-empty');
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('applyAction throwing leaves room in safe state (no broadcast)', () => {
    const { io, emits } = makeIoMock();
    applySpy.mockImplementation(() => { throw new Error('engine boom'); });
    const room = makeRoom();
    handleChessClockExpiry(room, 'player1', io, 'bank-empty');
    expect(applySpy).toHaveBeenCalled();
    expect(emits.filter((e) => e.event === 'game:state-update')).toHaveLength(0);
    expect(room.chessClock.active).toBe('player1');
  });

  it('every reason produces a FORFEIT with valid reason field', () => {
    const reasons: ChessClockExpiryReason[] = ['bank-empty', 'idle-mandatory', 'idle-second', 'idle-unhandled'];
    for (const r of reasons) {
      applySpy.mockClear();
      const { io } = makeIoMock();
      const room = makeRoom();
      handleChessClockExpiry(room, 'player1', io, r);
      const action = applySpy.mock.calls[0][2] as Extract<GameAction, { type: 'FORFEIT' }>;
      expect(action.type).toBe('FORFEIT');
      expect(['clock', 'idle']).toContain(action.reason);
    }
  });
});
