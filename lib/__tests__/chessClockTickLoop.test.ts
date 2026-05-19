import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildChessClockBroadcast,
  onChessClockTick,
  startChessClockTickLoop,
  stopChessClockTickLoop,
  type RoomData,
} from '@/lib/socket/server';
import {
  createChessClock,
  arm,
  CHESS_CLOCK_IDLE_LIMIT_MS,
  CHESS_CLOCK_IDLE_TOAST_MS,
  CHESS_CLOCK_INITIAL_MS,
} from '@/lib/timing/chessClock';
import type { GameState } from '@/lib/engine/types';

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

function makeRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    code: 'TEST01',
    hostSocket: 'host-sock',
    guestSocket: 'guest-sock',
    chessClock: createChessClock(),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    gameState: makeState(),
    finalized: false,
    spectators: new Map(),
    ...overrides,
  } as RoomData;
}

function withFixedNow<T>(fixedMs: number, fn: () => T): T {
  const original = Date.now;
  Date.now = () => fixedMs;
  try {
    return fn();
  } finally {
    Date.now = original;
  }
}

describe('buildChessClockBroadcast', () => {
  it('exposes serializable fields for both players', () => {
    const state = createChessClock();
    const payload = buildChessClockBroadcast(state, 1_000);
    expect(payload.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(payload.player1.idleWarningUsed).toBe(false);
    expect(payload.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(payload.player2.idleWarningUsed).toBe(false);
    expect(payload.active).toBe(null);
    expect(payload.activeStartedAt).toBe(null);
    expect(payload.idleStartedAt).toBe(null);
    expect(payload.serverNow).toBe(1_000);
    expect(payload.idleLimitMs).toBe(CHESS_CLOCK_IDLE_LIMIT_MS);
    expect(payload.idleToastAtMs).toBe(CHESS_CLOCK_IDLE_TOAST_MS);
  });

  it('reflects armed state and live remaining time', () => {
    let state = createChessClock();
    state = arm(state, 'player1', 0);
    const payload = buildChessClockBroadcast(state, 5_000);
    expect(payload.active).toBe('player1');
    expect(payload.activeStartedAt).toBe(5_000);
    expect(payload.idleStartedAt).toBe(0);
    expect(payload.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS - 5_000);
    expect(payload.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
  });

  it('payload is JSON-serializable (no Map/Set/function leaks)', () => {
    const state = arm(createChessClock(), 'player2', 0);
    const payload = buildChessClockBroadcast(state, 2_500);
    expect(() => JSON.stringify(payload)).not.toThrow();
    const round = JSON.parse(JSON.stringify(payload));
    expect(round.active).toBe('player2');
  });
});

describe('startChessClockTickLoop / stopChessClockTickLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('startChessClockTickLoop is idempotent: second call does not create a second interval', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    startChessClockTickLoop(room, io);
    const firstTimer = room.chessClockTickTimer;
    expect(firstTimer).not.toBeNull();
    startChessClockTickLoop(room, io);
    expect(room.chessClockTickTimer).toBe(firstTimer);
    stopChessClockTickLoop(room);
  });

  it('stopChessClockTickLoop clears the timer to null', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    startChessClockTickLoop(room, io);
    expect(room.chessClockTickTimer).not.toBeNull();
    stopChessClockTickLoop(room);
    expect(room.chessClockTickTimer).toBeNull();
  });

  it('stopChessClockTickLoop is a no-op if not running', () => {
    const room = makeRoom();
    expect(() => stopChessClockTickLoop(room)).not.toThrow();
    expect(room.chessClockTickTimer).toBeNull();
  });

  it('startChessClockTickLoop refuses to arm if room is finalized', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ finalized: true });
    startChessClockTickLoop(room, io);
    expect(room.chessClockTickTimer).toBeNull();
  });

  it('startChessClockTickLoop refuses to arm if gameState is null', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ gameState: null });
    startChessClockTickLoop(room, io);
    expect(room.chessClockTickTimer).toBeNull();
  });

  it('ticks fire onChessClockTick roughly every 1s', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    room.chessClock = arm(room.chessClock, 'player1', Date.now());
    startChessClockTickLoop(room, io);
    vi.advanceTimersByTime(3_500);
    const ticks = emits.filter((e) => e.event === 'game:clock-update');
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    stopChessClockTickLoop(room);
  });

  it('finalized room cancels its own interval on next tick', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    startChessClockTickLoop(room, io);
    expect(room.chessClockTickTimer).not.toBeNull();
    room.finalized = true;
    vi.advanceTimersByTime(1_100);
    expect(room.chessClockTickTimer).toBeNull();
  });
});

describe('onChessClockTick', () => {
  it('no broadcast when no input is awaited (gameOver phase)', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({ gameState: makeState({ phase: 'gameOver' }) });
    onChessClockTick(room, io);
    expect(emits).toHaveLength(0);
  });

  it('auto-syncs and broadcasts when state expects input but clock is unarmed (drift recovery)', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    expect(room.chessClock.active).toBeNull();
    onChessClockTick(room, io);
    expect(room.chessClock.active).toBe('player1');
    const clockEmit = emits.find((e) => e.event === 'game:clock-update');
    expect(clockEmit).toBeDefined();
  });

  it('broadcasts game:clock-update directly to host and guest sockets when active', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    room.chessClock = arm(room.chessClock, 'player1', 1_000_000);
    withFixedNow(1_000_500, () => onChessClockTick(room, io));
    const hostEmit = emits.find((e) => e.event === 'game:clock-update' && e.room === 'host-sock');
    const guestEmit = emits.find((e) => e.event === 'game:clock-update' && e.room === 'guest-sock');
    expect(hostEmit).toBeDefined();
    expect(guestEmit).toBeDefined();
    expect(hostEmit!.payload.chessClock.active).toBe('player1');
  });

  it('also broadcasts to the spectator namespace when spectators are present (single emit, not duplicate via room.code)', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    room.chessClock = arm(room.chessClock, 'player1', 1_000_000);
    room.spectators.set('s1', { socketId: 's1', userId: 'u1', username: 'Spec' });
    withFixedNow(1_000_500, () => onChessClockTick(room, io));
    const specEmit = emits.find((e) => e.event === 'game:clock-update' && e.room === `spec:${room.code}`);
    expect(specEmit).toBeDefined();
    const roomCodeEmit = emits.find((e) => e.event === 'game:clock-update' && e.room === room.code);
    expect(roomCodeEmit).toBeUndefined();
  });

  it('skips the spectator broadcast when no spectators are present', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    room.chessClock = arm(room.chessClock, 'player1', 1_000_000);
    withFixedNow(1_000_500, () => onChessClockTick(room, io));
    const specEmit = emits.find((e) => e.room.startsWith('spec:'));
    expect(specEmit).toBeUndefined();
  });

  it('skips host emit when hostSocket is null but still broadcasts to guest', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({ hostSocket: null as never });
    room.chessClock = arm(room.chessClock, 'player1', 1_000_000);
    withFixedNow(1_000_500, () => onChessClockTick(room, io));
    const guestEmit = emits.find((e) => e.event === 'game:clock-update' && e.room === 'guest-sock');
    expect(guestEmit).toBeDefined();
    const allEmits = emits.filter((e) => e.event === 'game:clock-update');
    expect(allEmits).toHaveLength(1);
  });

  it('clears the tick interval handle when called on a finalized room with a stale timer', () => {
    const { io } = makeIoMock();
    vi.useFakeTimers();
    try {
      const room = makeRoom();
      startChessClockTickLoop(room, io);
      expect(room.chessClockTickTimer).not.toBeNull();
      room.finalized = true;
      onChessClockTick(room, io);
      expect(room.chessClockTickTimer).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the tick interval handle when called with null gameState after a stale timer', () => {
    const { io } = makeIoMock();
    vi.useFakeTimers();
    try {
      const room = makeRoom();
      startChessClockTickLoop(room, io);
      expect(room.chessClockTickTimer).not.toBeNull();
      room.gameState = null;
      onChessClockTick(room, io);
      expect(room.chessClockTickTimer).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT emit clock-update on the bank-empty path (expiry handler takes over)', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    room.chessClock = arm(room.chessClock, 'player1', 0);
    withFixedNow(CHESS_CLOCK_INITIAL_MS + 1_000, () => onChessClockTick(room, io));
    const clockEmit = emits.find((e) => e.event === 'game:clock-update');
    expect(clockEmit).toBeUndefined();
  });

  it('does NOT emit clock-update on the idle-limit path (warning consumed, no broadcast)', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    room.chessClock = arm(room.chessClock, 'player1', 0);
    withFixedNow(CHESS_CLOCK_IDLE_LIMIT_MS + 100, () => onChessClockTick(room, io));
    const clockEmit = emits.find((e) => e.event === 'game:clock-update');
    expect(clockEmit).toBeUndefined();
  });

  it('failsafe: forfeits player1 if their bank is already at 0 even when clock is disarmed (phase-transition race)', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    room.chessClock = {
      ...room.chessClock,
      player1: { remainingMs: 0, idleWarningUsed: false },
      active: null,
      activeStartedAt: null,
      idleStartedAt: null,
    };
    withFixedNow(2_000_000, () => onChessClockTick(room, io));
    expect(room.gameState?.forfeitedBy).toBe('player1');
  });

  it('failsafe: forfeits player2 if their bank is already at 0 even when clock is disarmed', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    room.chessClock = {
      ...room.chessClock,
      player2: { remainingMs: 0, idleWarningUsed: false },
      active: null,
      activeStartedAt: null,
      idleStartedAt: null,
    };
    withFixedNow(2_000_000, () => onChessClockTick(room, io));
    expect(room.gameState?.forfeitedBy).toBe('player2');
  });
});
