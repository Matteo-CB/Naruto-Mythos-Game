import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  armMulliganIdleTimer,
  handleMulliganIdleTimeout,
  type RoomData,
} from '@/lib/socket/server';
import { createChessClock, CHESS_CLOCK_MULLIGAN_IDLE_MS } from '@/lib/timing/chessClock';
import type { GameState } from '@/lib/engine/types';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    game: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));

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

function makePlayerState(hasMulliganed = false): any {
  return { hasMulliganed };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'gid-test',
    turn: 1,
    phase: 'mulligan',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: makePlayerState(false) as never,
    player2: makePlayerState(false) as never,
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
    code: 'MULL01',
    hostSocket: 'host-sock',
    guestSocket: 'guest-sock',
    chessClock: createChessClock(),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    mulliganTimer: null,
    mulliganDeadline: null,
    spectators: new Map(),
    gameState: makeState(),
    finalized: false,
    ...overrides,
  } as RoomData;
}

describe('armMulliganIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits game:mulligan-deadline to both players when arming', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    armMulliganIdleTimer(room, room.code, io);
    const hostEmit = emits.find((e) => e.event === 'game:mulligan-deadline' && e.room === 'host-sock');
    const guestEmit = emits.find((e) => e.event === 'game:mulligan-deadline' && e.room === 'guest-sock');
    expect(hostEmit).toBeDefined();
    expect(guestEmit).toBeDefined();
    expect(hostEmit!.payload.durationMs).toBe(CHESS_CLOCK_MULLIGAN_IDLE_MS);
  });

  it('arms the chessClockMulliganTimer setTimeout', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    armMulliganIdleTimer(room, room.code, io);
    expect(room.chessClockMulliganTimer).not.toBeNull();
  });

  it('clears any pre-existing timer (idempotent re-arm)', () => {
    const { io } = makeIoMock();
    const room = makeRoom();
    armMulliganIdleTimer(room, room.code, io);
    const first = room.chessClockMulliganTimer;
    armMulliganIdleTimer(room, room.code, io);
    expect(room.chessClockMulliganTimer).not.toBe(first);
    expect(room.chessClockMulliganTimer).not.toBeNull();
  });

  it('no-op if both players have already mulliganed', () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({
      gameState: makeState({
        player1: makePlayerState(true) as never,
        player2: makePlayerState(true) as never,
      }),
    });
    armMulliganIdleTimer(room, room.code, io);
    expect(room.chessClockMulliganTimer).toBeNull();
    expect(emits.filter((e) => e.event === 'game:mulligan-deadline')).toHaveLength(0);
  });

  it('no-op if phase is not mulligan', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ gameState: makeState({ phase: 'action' }) });
    armMulliganIdleTimer(room, room.code, io);
    expect(room.chessClockMulliganTimer).toBeNull();
  });

  it('no-op if room is finalized', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ finalized: true });
    armMulliganIdleTimer(room, room.code, io);
    expect(room.chessClockMulliganTimer).toBeNull();
  });

  it('no-op if gameState is null', () => {
    const { io } = makeIoMock();
    const room = makeRoom({ gameState: null });
    armMulliganIdleTimer(room, room.code, io);
    expect(room.chessClockMulliganTimer).toBeNull();
  });
});

describe('handleMulliganIdleTimeout', () => {
  it('emits game:cancelled with reason mulligan-idle to both players', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    await handleMulliganIdleTimeout(room, room.code, io);
    const hostEmit = emits.find((e) => e.event === 'game:cancelled' && e.room === 'host-sock');
    const guestEmit = emits.find((e) => e.event === 'game:cancelled' && e.room === 'guest-sock');
    expect(hostEmit).toBeDefined();
    expect(guestEmit).toBeDefined();
    expect(hostEmit!.payload.reason).toBe('mulligan-idle');
    expect(hostEmit!.payload.roomCode).toBe(room.code);
  });

  it('emits to spectator namespace when spectators present', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    room.spectators.set('s1', { socketId: 's1', userId: 'u1', username: 'Spec' });
    await handleMulliganIdleTimeout(room, room.code, io);
    const specEmit = emits.find((e) => e.event === 'game:cancelled' && e.room === `spec:${room.code}`);
    expect(specEmit).toBeDefined();
  });

  it('does not emit game:cancelled if both players already mulliganed', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({
      gameState: makeState({
        player1: makePlayerState(true) as never,
        player2: makePlayerState(true) as never,
      }),
    });
    await handleMulliganIdleTimeout(room, room.code, io);
    expect(emits.filter((e) => e.event === 'game:cancelled')).toHaveLength(0);
  });

  it('does not emit game:cancelled if phase is not mulligan', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({ gameState: makeState({ phase: 'action' }) });
    await handleMulliganIdleTimeout(room, room.code, io);
    expect(emits.filter((e) => e.event === 'game:cancelled')).toHaveLength(0);
  });

  it('does not emit if room is already finalized', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({ finalized: true });
    await handleMulliganIdleTimeout(room, room.code, io);
    expect(emits.filter((e) => e.event === 'game:cancelled')).toHaveLength(0);
  });

  it('does not emit if gameState is null', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({ gameState: null });
    await handleMulliganIdleTimeout(room, room.code, io);
    expect(emits.filter((e) => e.event === 'game:cancelled')).toHaveLength(0);
  });

  it('marks the room finalized and clears all timers', async () => {
    const { io } = makeIoMock();
    vi.useFakeTimers();
    try {
      const room = makeRoom();
      armMulliganIdleTimer(room, room.code, io);
      expect(room.chessClockMulliganTimer).not.toBeNull();
      await handleMulliganIdleTimeout(room, room.code, io);
      expect(room.finalized).toBe(true);
      expect(room.chessClockMulliganTimer).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancellation has no winner field (no ELO impact intended)', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    await handleMulliganIdleTimeout(room, room.code, io);
    const cancelEmit = emits.find((e) => e.event === 'game:cancelled');
    expect(cancelEmit).toBeDefined();
    expect((cancelEmit!.payload as Record<string, unknown>).winner).toBeUndefined();
    expect((cancelEmit!.payload as Record<string, unknown>).eloDelta).toBeUndefined();
  });

  it('idle-timeout flow when ONE player has mulliganed but not the other still cancels', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({
      gameState: makeState({
        player1: makePlayerState(true) as never,
        player2: makePlayerState(false) as never,
      }),
    });
    await handleMulliganIdleTimeout(room, room.code, io);
    const cancelEmit = emits.find((e) => e.event === 'game:cancelled');
    expect(cancelEmit).toBeDefined();
    expect(cancelEmit!.payload.reason).toBe('mulligan-idle');
  });
});

describe('armMulliganIdleTimer firing after CHESS_CLOCK_MULLIGAN_IDLE_MS triggers handleMulliganIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('after the full timeout, game:cancelled is emitted (integration)', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom();
    armMulliganIdleTimer(room, room.code, io);
    expect(room.chessClockMulliganTimer).not.toBeNull();
    vi.advanceTimersByTime(CHESS_CLOCK_MULLIGAN_IDLE_MS + 100);
    await Promise.resolve();
    await Promise.resolve();
    const cancelEmit = emits.find((e) => e.event === 'game:cancelled');
    expect(cancelEmit).toBeDefined();
  });
});

describe('anti-spam predicate for mulligan re-arm', () => {
  it('first MULLIGAN: prev.hasMulliganed=false -> new.hasMulliganed=true -> re-arm', () => {
    const prev = { hasMulliganed: false } as never;
    const next = { hasMulliganed: true } as never;
    const playerJustMulliganed = !(prev as { hasMulliganed: boolean }).hasMulliganed && (next as { hasMulliganed: boolean }).hasMulliganed;
    expect(playerJustMulliganed).toBe(true);
  });

  it('spam MULLIGAN: prev.hasMulliganed=true -> new.hasMulliganed=true -> NO re-arm', () => {
    const prev = { hasMulliganed: true } as never;
    const next = { hasMulliganed: true } as never;
    const playerJustMulliganed = !(prev as { hasMulliganed: boolean }).hasMulliganed && (next as { hasMulliganed: boolean }).hasMulliganed;
    expect(playerJustMulliganed).toBe(false);
  });

  it('engine no-op on MULLIGAN: prev.hasMulliganed=false -> new.hasMulliganed=false -> NO re-arm', () => {
    const prev = { hasMulliganed: false } as never;
    const next = { hasMulliganed: false } as never;
    const playerJustMulliganed = !(prev as { hasMulliganed: boolean }).hasMulliganed && (next as { hasMulliganed: boolean }).hasMulliganed;
    expect(playerJustMulliganed).toBe(false);
  });
});
