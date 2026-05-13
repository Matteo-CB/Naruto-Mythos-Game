import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    tournamentMatch: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), createMany: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    deck: { findUnique: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/socket/server', () => ({
  rooms: new Map(),
  getSocketIO: vi.fn(() => null),
}));

vi.mock('@/lib/tournament/absenceManager', () => {
  const timers = new Map<string, () => Promise<void>>();
  return {
    startAbsenceTimer: vi.fn((matchId: string, cb: () => Promise<void>) => {
      timers.set(matchId, cb);
      return new Date(Date.now() + 120_000);
    }),
    clearAbsenceTimer: vi.fn((matchId: string) => { timers.delete(matchId); }),
    scheduleAbsenceTimerWithDeadline: vi.fn((matchId: string, _d: Date, cb: () => Promise<void>) => {
      timers.set(matchId, cb);
    }),
    ABSENCE_TIMEOUT_MS: 120_000,
    __timers: timers,
  };
});

vi.mock('@/lib/discord/tournamentRoles', () => ({
  assignTournamentWinnerRole: vi.fn(),
}));

vi.mock('@/lib/discord/tournamentWebhook', () => ({
  sendTournamentResults: vi.fn(),
}));

vi.mock('@/lib/data/cardIndex', () => ({
  getCharacterById: vi.fn(),
  getMissionById: vi.fn(),
}));

vi.mock('@/lib/tournament/matchRoomCleanup', () => ({
  finalizeAndScheduleRoomDeletion: vi.fn(),
}));

vi.mock('@/lib/tournament/matchEventLog', () => ({
  logMatchEvent: vi.fn(),
}));

import { prisma } from '@/lib/db/prisma';
import {
  handleSwissDoubleAbsence,
  startInitialRoundAbsenceTimers,
  rehydrateAbsenceTimers,
  sweepOrphanTournamentMatches,
  fireAbsenceTimerCallback,
  getConnectedUserIdsInTournament,
} from '../socket/tournamentHandlers';

const p = prisma as never as {
  tournament: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tournamentParticipant: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tournamentMatch: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
};

interface FakeIo {
  emissions: Array<{ room: string; event: string; data: unknown }>;
  to(room: string): { emit: (event: string, data: unknown) => void };
}

function fakeIo(): FakeIo {
  const emissions: FakeIo['emissions'] = [];
  return {
    emissions,
    to(room: string) {
      return { emit: (event: string, data: unknown) => emissions.push({ room, event, data }) };
    },
  };
}

type FakeIoWithSockets = FakeIo & {
  sockets: { sockets: Map<string, { data: { userId?: string }; rooms: Set<string> }> };
};

function fakeIoWithConnectedUsers(tournamentId: string, connectedUserIds: string[]): FakeIoWithSockets {
  const base = fakeIo();
  const sockets = new Map<string, { data: { userId?: string }; rooms: Set<string> }>();
  connectedUserIds.forEach((uid, idx) => {
    sockets.set(`sock-${idx}`, {
      data: { userId: uid },
      rooms: new Set([`tournament:${tournamentId}`]),
    });
  });
  return Object.assign(base, { sockets: { sockets } });
}

beforeEach(() => {
  vi.clearAllMocks();
  p.tournament.findUnique.mockReset();
  p.tournament.update.mockReset();
  p.tournamentParticipant.updateMany.mockReset();
  p.tournamentMatch.findUnique.mockReset();
  p.tournamentMatch.findMany.mockReset();
  p.tournamentMatch.update.mockReset();
  p.tournamentMatch.updateMany.mockReset();
});

describe('handleSwissDoubleAbsence', () => {
  it('marks both players as eliminated and forfeits the match with no winner', async () => {
    const io = fakeIo();
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', status: 'ready',
      player1Id: 'p1', player2Id: 'p2', round: 1, matchIndex: 0,
      bracket: null, roomCode: null,
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 2 });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', currentRound: 1, totalRounds: 3, status: 'in_progress',
      participants: [
        { userId: 'p1', username: 'P1', eliminated: false, eliminatedRound: null, hasBye: false, seed: 1 },
        { userId: 'p2', username: 'P2', eliminated: false, eliminatedRound: null, hasBye: false, seed: 2 },
        { userId: 'p3', username: 'P3', eliminated: false, eliminatedRound: null, hasBye: false, seed: 3 },
        { userId: 'p4', username: 'P4', eliminated: false, eliminatedRound: null, hasBye: false, seed: 4 },
      ],
      matches: [],
    });
    p.tournamentMatch.findMany.mockResolvedValue([
      { id: 'm1', status: 'forfeit', round: 1 },
      { id: 'm2', status: 'completed', round: 1 },
    ]);

    await handleSwissDoubleAbsence(io as never, 't1', 'm1');

    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'm1' },
      data: expect.objectContaining({ status: 'forfeit', winnerId: null }),
    }));
    expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tournamentId: 't1', userId: { in: ['p1', 'p2'] } },
      data: expect.objectContaining({ eliminated: true }),
    }));
    expect(io.emissions.some(e => e.event === 'tournament:player-forfeited')).toBe(true);
  });

  it('is idempotent (no-op if match already completed)', async () => {
    const io = fakeIo();
    p.tournamentMatch.findUnique.mockResolvedValue({ id: 'm1', status: 'completed', player1Id: 'p1', player2Id: 'p2' });
    await handleSwissDoubleAbsence(io as never, 't1', 'm1');
    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
    expect(p.tournamentParticipant.updateMany).not.toHaveBeenCalled();
  });

  it('handles missing match gracefully', async () => {
    const io = fakeIo();
    p.tournamentMatch.findUnique.mockResolvedValue(null);
    await handleSwissDoubleAbsence(io as never, 't1', 'm1');
    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
  });
});

describe('startInitialRoundAbsenceTimers', () => {
  it('starts a timer for every ready non-bye match of round 1', async () => {
    const io = fakeIo();
    p.tournament.findUnique.mockResolvedValue({ id: 't1', format: 'swiss', currentRound: 1 });
    p.tournamentMatch.findMany.mockResolvedValue([
      { id: 'm1', status: 'ready', isBye: false, player1Id: 'p1', player2Id: 'p2', round: 1 },
      { id: 'm2', status: 'ready', isBye: false, player1Id: 'p3', player2Id: 'p4', round: 1 },
    ]);
    p.tournamentMatch.update.mockResolvedValue({});

    await startInitialRoundAbsenceTimers(io as never, 't1');

    expect(p.tournamentMatch.update).toHaveBeenCalledTimes(2);
    expect(io.emissions.filter(e => e.event === 'tournament:absence-timer')).toHaveLength(2);
  });

  it('skips matches that already have an absence deadline', async () => {
    const io = fakeIo();
    p.tournament.findUnique.mockResolvedValue({ id: 't1', format: 'swiss', currentRound: 1 });
    p.tournamentMatch.findMany.mockResolvedValue([]);

    await startInitialRoundAbsenceTimers(io as never, 't1');

    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
  });

  it('uses winners-bracket-only filter for double elim', async () => {
    const io = fakeIo();
    p.tournament.findUnique.mockResolvedValue({ id: 't1', format: 'double_elimination', currentRound: 1 });
    p.tournamentMatch.findMany.mockResolvedValue([]);

    await startInitialRoundAbsenceTimers(io as never, 't1');

    expect(p.tournamentMatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ bracket: 'winners' }),
    }));
  });

  it('handles missing tournament gracefully', async () => {
    const io = fakeIo();
    p.tournament.findUnique.mockResolvedValue(null);
    await startInitialRoundAbsenceTimers(io as never, 't1');
    expect(p.tournamentMatch.findMany).not.toHaveBeenCalled();
  });
});

describe('rehydrateAbsenceTimers', () => {
  it('reschedules timers for matches with absenceDeadline in the future', async () => {
    const io = fakeIo();
    const future = new Date(Date.now() + 60_000);
    p.tournamentMatch.findMany.mockResolvedValue([
      {
        id: 'm1', tournamentId: 't1', absenceDeadline: future,
        absentPlayerId: 'p1', player1Id: 'p1', player2Id: 'p2', round: 1, status: 'ready',
      },
    ]);

    await rehydrateAbsenceTimers(io as never);

    const am = await import('@/lib/tournament/absenceManager');
    expect(am.scheduleAbsenceTimerWithDeadline).toHaveBeenCalled();
  });

  it('handles matches with null absentPlayerId (round-1 double-absence pattern)', async () => {
    const io = fakeIo();
    const future = new Date(Date.now() + 60_000);
    p.tournamentMatch.findMany.mockResolvedValue([
      {
        id: 'm1', tournamentId: 't1', absenceDeadline: future,
        absentPlayerId: null, player1Id: 'p1', player2Id: 'p2', round: 1, status: 'ready',
      },
    ]);

    await rehydrateAbsenceTimers(io as never);

    const am = await import('@/lib/tournament/absenceManager');
    expect(am.scheduleAbsenceTimerWithDeadline).toHaveBeenCalled();
  });

  it('returns no-op when no matches have deadline', async () => {
    const io = fakeIo();
    p.tournamentMatch.findMany.mockResolvedValue([]);
    await rehydrateAbsenceTimers(io as never);
  });
});

describe('sweepOrphanTournamentMatches', () => {
  it('resets in_progress matches whose room is gone (age > 60s) to ready', async () => {
    const io = fakeIo();
    const oldStart = new Date(Date.now() - 120_000);
    p.tournamentMatch.findMany.mockResolvedValue([
      {
        id: 'm1', tournamentId: 't1', status: 'in_progress',
        roomCode: 'GONE', startedAt: oldStart, player1Id: 'p1', player2Id: 'p2',
      },
    ]);
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournament.findUnique.mockResolvedValue({ format: 'swiss' });

    await sweepOrphanTournamentMatches(io as never);

    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'm1' },
      data: expect.objectContaining({ status: 'ready', roomCode: null, startedAt: null }),
    }));
    expect(io.emissions.some(e => e.event === 'tournament:match-updated')).toBe(true);
  });

  it('does not touch fresh matches (age < 60s)', async () => {
    const io = fakeIo();
    const recentStart = new Date(Date.now() - 5_000);
    p.tournamentMatch.findMany.mockResolvedValue([
      {
        id: 'm1', tournamentId: 't1', status: 'in_progress',
        roomCode: 'OK', startedAt: recentStart, player1Id: 'p1', player2Id: 'p2',
      },
    ]);

    await sweepOrphanTournamentMatches(io as never);

    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
  });

  it('returns silently when no in-progress matches exist', async () => {
    const io = fakeIo();
    p.tournamentMatch.findMany.mockResolvedValue([]);
    await sweepOrphanTournamentMatches(io as never);
    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
  });
});

describe('getConnectedUserIdsInTournament', () => {
  it('returns userIds whose sockets are in tournament:<id>', () => {
    const io = {
      sockets: {
        sockets: new Map<string, { data: { userId?: string }; rooms: Set<string> }>([
          ['s1', { data: { userId: 'u1' }, rooms: new Set(['tournament:t1', 'other-room']) }],
          ['s2', { data: { userId: 'u2' }, rooms: new Set(['tournament:t1']) }],
          ['s3', { data: { userId: 'u3' }, rooms: new Set(['tournament:other']) }],
          ['s4', { data: {}, rooms: new Set(['tournament:t1']) }],
        ]),
      },
    };
    const result = getConnectedUserIdsInTournament(io as never, 't1');
    expect(result.has('u1')).toBe(true);
    expect(result.has('u2')).toBe(true);
    expect(result.has('u3')).toBe(false);
    expect(result.size).toBe(2);
  });

  it('returns empty set when io.sockets.sockets is missing', () => {
    const io = {} as never;
    expect(getConnectedUserIdsInTournament(io, 't1').size).toBe(0);
  });

  it('returns empty set when no sockets are in the room', () => {
    const io = {
      sockets: {
        sockets: new Map<string, { data: { userId?: string }; rooms: Set<string> }>([
          ['s1', { data: { userId: 'u1' }, rooms: new Set(['other-room']) }],
        ]),
      },
    };
    expect(getConnectedUserIdsInTournament(io as never, 't1').size).toBe(0);
  });
});

describe('fireAbsenceTimerCallback (grace-period defense against mass-forfeit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.tournament.findUnique.mockReset();
    p.tournament.update.mockReset();
    p.tournamentParticipant.updateMany.mockReset();
    p.tournamentMatch.findUnique.mockReset();
    p.tournamentMatch.findMany.mockReset();
    p.tournamentMatch.update.mockReset();
    p.tournamentMatch.updateMany.mockReset();
  });

  it('grants 30s grace + emits please-confirm-ready when BOTH players have live sockets (Swiss)', async () => {
    const io = fakeIoWithConnectedUsers('t1', ['p1', 'p2']);
    p.tournamentMatch.update.mockResolvedValue({});

    await fireAbsenceTimerCallback(io as never, 't1', 'm1', 'p1', 'p2', null, false);

    const confirmEmit = io.emissions.find(e => e.event === 'tournament:please-confirm-ready');
    expect(confirmEmit).toBeDefined();
    expect((confirmEmit!.data as { matchId: string }).matchId).toBe('m1');

    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'm1' },
      data: expect.objectContaining({ absenceDeadline: expect.any(Date) }),
    }));

    expect(p.tournamentParticipant.updateMany).not.toHaveBeenCalled();
    expect(io.emissions.some(e => e.event === 'tournament:player-forfeited')).toBe(false);
  });

  it('grants grace when ONE player connected and matchReadyPlayers has the other', async () => {
    const io = fakeIoWithConnectedUsers('t1', ['p2']);
    p.tournamentMatch.update.mockResolvedValue({});

    await fireAbsenceTimerCallback(io as never, 't1', 'm1', 'p1', 'p2', 'p2', false);

    expect(io.emissions.some(e => e.event === 'tournament:please-confirm-ready')).toBe(true);
    expect(p.tournamentParticipant.updateMany).not.toHaveBeenCalled();
  });

  it('skips grace and fires Swiss double-absence forfeit when neither player connected', async () => {
    const io = fakeIoWithConnectedUsers('t1', []);
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', status: 'ready',
      player1Id: 'p1', player2Id: 'p2', round: 1, matchIndex: 0, bracket: null, roomCode: null,
    });
    p.tournament.findUnique.mockImplementation(async (args: { include?: { participants?: unknown } }) => {
      if (args?.include?.participants) {
        return { id: 't1', currentRound: 1, totalRounds: 3, status: 'in_progress', participants: [], matches: [] };
      }
      return { format: 'swiss' };
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 2 });
    p.tournamentMatch.findMany.mockResolvedValue([{ id: 'm1', status: 'forfeit', round: 1 }]);

    await fireAbsenceTimerCallback(io as never, 't1', 'm1', 'p1', 'p2', null, false);

    expect(io.emissions.some(e => e.event === 'tournament:please-confirm-ready')).toBe(false);
    expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { in: ['p1', 'p2'] } }),
      data: expect.objectContaining({ eliminated: true }),
    }));
  });

  it('on retry=true: skips connection check entirely, forfeits per matchReadyPlayers state', async () => {
    const io = fakeIoWithConnectedUsers('t1', ['p1', 'p2']);
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', status: 'ready',
      player1Id: 'p1', player2Id: 'p2', round: 1, matchIndex: 0, bracket: null, roomCode: null,
    });
    p.tournament.findUnique.mockImplementation(async (args: { include?: { participants?: unknown } }) => {
      if (args?.include?.participants) {
        return { id: 't1', currentRound: 1, totalRounds: 3, status: 'in_progress', participants: [], matches: [] };
      }
      return { format: 'swiss' };
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 2 });
    p.tournamentMatch.findMany.mockResolvedValue([{ id: 'm1', status: 'forfeit', round: 1 }]);

    await fireAbsenceTimerCallback(io as never, 't1', 'm1', 'p1', 'p2', null, true);

    expect(io.emissions.some(e => e.event === 'tournament:please-confirm-ready')).toBe(false);
    expect(p.tournamentParticipant.updateMany).toHaveBeenCalled();
  });

  it('with knownAbsentPlayerId set and that player NOT connected, forfeits only that player', async () => {
    const io = fakeIoWithConnectedUsers('t1', ['p1']);
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', status: 'ready',
      player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
      round: 1, matchIndex: 0, bracket: null, roomCode: null,
    });
    p.tournament.findUnique.mockResolvedValue({ format: 'elimination' });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
    p.tournamentMatch.findMany.mockResolvedValue([]);

    await fireAbsenceTimerCallback(io as never, 't1', 'm1', 'p1', 'p2', 'p2', false);

    expect(io.emissions.some(e => e.event === 'tournament:please-confirm-ready')).toBe(false);
    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'forfeit', winnerId: 'p1' }),
    }));
  });

  it('regression: the 2026-05-12 mass-forfeit scenario no longer triggers when players are on the tournament page', async () => {
    const io = fakeIoWithConnectedUsers('t1', ['Trafalgar', 'mak52554', 'legoubz', 'Mister_Mrozikk']);
    p.tournamentMatch.update.mockResolvedValue({});

    await fireAbsenceTimerCallback(io as never, 't1', 'r3-match1', 'Trafalgar', 'mak52554', null, false);
    await fireAbsenceTimerCallback(io as never, 't1', 'r3-match3', 'legoubz', 'Mister_Mrozikk', null, false);

    const confirms = io.emissions.filter(e => e.event === 'tournament:please-confirm-ready');
    expect(confirms).toHaveLength(2);
    expect(p.tournamentParticipant.updateMany).not.toHaveBeenCalled();
  });
});
