import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMulliganIdleTimeout, type RoomData } from '@/lib/socket/server';
import { createChessClock } from '@/lib/timing/chessClock';
import type { GameState } from '@/lib/engine/types';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    game: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    tournament: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'tour-swiss') return { format: 'swiss' };
        if (where.id === 'tour-elim') return { format: 'elimination' };
        return null;
      }),
    },
    tournamentMatch: {
      update: vi.fn(async () => ({ id: 'm' })),
      findUnique: vi.fn(async () => null),
    },
    tournamentParticipant: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

vi.mock('@/lib/socket/tournamentHandlers', () => ({
  handleSwissDoubleAbsence: vi.fn(async () => {}),
  reopenTournamentMatch: vi.fn(async () => {}),
  handleMatchForfeit: vi.fn(async () => {}),
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

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'g-tour',
    turn: 1,
    phase: 'mulligan',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: { hasMulliganed: false } as never,
    player2: { hasMulliganed: false } as never,
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
    code: 'TOUR01',
    hostSocket: 'host-sock',
    guestSocket: 'guest-sock',
    chessClock: createChessClock(),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    spectators: new Map(),
    gameState: makeState(),
    finalized: false,
    ...overrides,
  } as RoomData;
}

describe('Phase 12 — tournament mulligan-idle delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Swiss tournament mulligan-idle delegates to handleSwissDoubleAbsence when neither player answered', async () => {
    const { io } = makeIoMock();
    const tournamentHandlers = await import('@/lib/socket/tournamentHandlers');
    const room = makeRoom({
      tournamentId: 'tour-swiss',
      tournamentMatchId: 'match-001',
      hostId: 'u-host',
      guestId: 'u-guest',
    });
    await handleMulliganIdleTimeout(room, room.code, io);
    expect(tournamentHandlers.handleSwissDoubleAbsence).toHaveBeenCalledWith(
      io,
      'tour-swiss',
      'match-001',
    );
  });

  it('Swiss tournament mulligan-idle forfeits only the player who did not answer', async () => {
    const { io } = makeIoMock();
    const tournamentHandlers = await import('@/lib/socket/tournamentHandlers');
    const room = makeRoom({
      tournamentId: 'tour-swiss',
      tournamentMatchId: 'match-004',
      hostId: 'u-host',
      guestId: 'u-guest',
      gameState: makeState({
        player1: { hasMulliganed: true } as never,
        player2: { hasMulliganed: false } as never,
      }),
    });
    await handleMulliganIdleTimeout(room, room.code, io);
    expect(tournamentHandlers.handleSwissDoubleAbsence).not.toHaveBeenCalled();
    expect(tournamentHandlers.handleMatchForfeit).toHaveBeenCalledWith(
      io,
      'tour-swiss',
      'match-004',
      'u-guest',
    );
  });

  it('Elimination tournament mulligan-idle reopens the match instead of killing the bracket', async () => {
    const { io } = makeIoMock();
    const tournamentHandlers = await import('@/lib/socket/tournamentHandlers');
    const room = makeRoom({
      tournamentId: 'tour-elim',
      tournamentMatchId: 'match-002',
      hostId: 'u-host',
      guestId: 'u-guest',
    });
    await handleMulliganIdleTimeout(room, room.code, io);
    expect(tournamentHandlers.handleSwissDoubleAbsence).not.toHaveBeenCalled();
    expect(tournamentHandlers.reopenTournamentMatch).toHaveBeenCalledWith(
      io,
      'tour-elim',
      'match-002',
      'u-host',
      'u-guest',
    );
  });

  it('non-tournament mulligan-idle does not touch tournament tables', async () => {
    const { io } = makeIoMock();
    const { prisma } = await import('@/lib/db/prisma');
    const tournamentHandlers = await import('@/lib/socket/tournamentHandlers');
    const room = makeRoom({ tournamentId: undefined, tournamentMatchId: undefined });
    await handleMulliganIdleTimeout(room, room.code, io);
    expect(tournamentHandlers.handleSwissDoubleAbsence).not.toHaveBeenCalled();
    expect(prisma.tournamentMatch.update).not.toHaveBeenCalled();
  });

  it('tournament mulligan-idle still emits game:cancelled to the room', async () => {
    const { io, emits } = makeIoMock();
    const room = makeRoom({
      tournamentId: 'tour-swiss',
      tournamentMatchId: 'match-003',
    });
    await handleMulliganIdleTimeout(room, room.code, io);
    const cancelEmits = emits.filter((e) => e.event === 'game:cancelled');
    expect(cancelEmits.length).toBeGreaterThan(0);
    expect(cancelEmits[0].payload.reason).toBe('mulligan-idle');
  });
});
