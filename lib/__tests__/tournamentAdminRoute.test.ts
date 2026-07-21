import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    tournamentParticipant: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    tournamentMatch: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    tournamentAdminLog: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn(), update: vi.fn() },
    userBan: { create: vi.fn(), deleteMany: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/auth/authOptions', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/socket/server', () => ({
  getSocketIO: vi.fn(() => null),
  rooms: new Map(),
}));

vi.mock('@/lib/discord/tournamentRoles', () => ({
  removeTournamentRole: vi.fn(),
  assignTournamentWinnerRole: vi.fn(),
}));

vi.mock('@/lib/socket/tournamentHandlers', () => ({
  advanceMatchWinner: vi.fn(),
  advanceMatchWinnerDoubleElim: vi.fn(),
  handleSwissMatchEnd: vi.fn(),
  cleanupTournamentMapsExternal: vi.fn(),
  cleanupTournamentMapsByIds: vi.fn(),
  fireAbsenceTimerCallback: vi.fn(),
  clearTournamentMatchTimers: vi.fn(),
}));

vi.mock('@/lib/tournament/swissEngine', () => ({
  computeStandings: vi.fn(() => []),
}));

vi.mock('@/lib/tournament/absenceManager', () => ({
  clearAbsenceTimer: vi.fn(),
  startAbsenceTimer: vi.fn(() => new Date(Date.now() + 120_000)),
}));

vi.mock('@/lib/tournament/matchEventLog', () => ({
  logMatchEvent: vi.fn(),
}));

vi.mock('@/lib/tournament/matchRoomCleanup', () => ({
  finalizeAndScheduleRoomDeletion: vi.fn(),
}));

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { POST as adminPOST } from '../../app/api/tournaments/[id]/admin/route';

const p = prisma as unknown as {
  tournament: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tournamentParticipant: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  tournamentMatch: { update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  tournamentAdminLog: { create: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function makeRequest(body: object): Request {
  return new Request('http://localhost/api/tournaments/t1/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => Promise.resolve({ id });

beforeEach(() => {
  authMock.mockReset();
  for (const model of Object.values(p)) {
    if (typeof model === 'object' && model !== null) {
      for (const fn of Object.values(model as Record<string, unknown>)) {
        if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
  p.tournamentAdminLog.create.mockResolvedValue({});
});

describe('POST /api/tournaments/[id]/admin', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await adminPOST(makeRequest({ action: 'disqualify', userId: 'u1' }) as never, { params: params('t1') });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-creator non-admin', async () => {
    authMock.mockResolvedValue({ user: { id: 'random', email: 'x@y.z', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'someone-else', status: 'in_progress', matches: [],
    });
    const res = await adminPOST(makeRequest({ action: 'disqualify', userId: 'u1' }) as never, { params: params('t1') });
    expect(res.status).toBe(403);
  });

  it('rejects match-mutating actions on cancelled tournament', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'cancelled', matches: [],
    });
    const res = await adminPOST(makeRequest({ action: 'disqualify', userId: 'u1' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });

  it('disqualify returns 404 when participant does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'in_progress', matches: [], format: 'swiss', currentRound: 2, gameMode: 'classic',
    });
    p.tournamentParticipant.findFirst.mockResolvedValue(null);
    const res = await adminPOST(makeRequest({ action: 'disqualify', userId: 'ghost' }) as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });

  it('reinstate rejects if tournament not in registration', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'in_progress', matches: [], format: 'swiss',
    });
    const res = await adminPOST(makeRequest({ action: 'reinstate', userId: 'u1' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/registration/i);
  });

  it('reinstate rejects if participant is not eliminated', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'registration', matches: [], format: 'swiss',
    });
    p.tournamentParticipant.findFirst.mockResolvedValue({ id: 'p1', eliminated: false });
    const res = await adminPOST(makeRequest({ action: 'reinstate', userId: 'u1' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not eliminated/i);
  });

  it('reinstate succeeds and clears eliminated flag', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'registration', matches: [], format: 'swiss',
    });
    p.tournamentParticipant.findFirst.mockResolvedValue({ id: 'p1', eliminated: true });
    p.user.findUnique.mockResolvedValue({ username: 'Alice' });
    const res = await adminPOST(makeRequest({ action: 'reinstate', userId: 'u1' }) as never, { params: params('t1') });
    expect(res.status).toBe(200);
    expect(p.tournamentParticipant.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { eliminated: false, eliminatedRound: null },
    });
  });

  it('removeParticipant rejects if not in registration', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'in_progress', matches: [], format: 'swiss',
    });
    const res = await adminPOST(makeRequest({ action: 'removeParticipant', userId: 'u1' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });

  it('updateNote enforces 500-char cap', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'registration', matches: [], format: 'swiss',
    });
    const longNote = 'x'.repeat(501);
    const res = await adminPOST(makeRequest({ action: 'updateNote', note: longNote }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });

  it('unknown action returns 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'registration', matches: [], format: 'swiss',
    });
    const res = await adminPOST(makeRequest({ action: 'foobarBogus' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
});

describe('POST /admin resetMatch (Fix #4 forfeit recovery)', () => {
  beforeEach(() => {
    authMock.mockReset();
    for (const model of Object.values(p)) {
      if (typeof model === 'object' && model !== null) {
        for (const fn of Object.values(model as Record<string, unknown>)) {
          if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
    p.tournamentAdminLog.create.mockResolvedValue({});
  });

  it('un-eliminates participants whose eliminatedRound matches the forfeited match round', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    const forfeitMatch = {
      id: 'm1', tournamentId: 't1', bracket: 'main', round: 3, matchIndex: 1,
      player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
      status: 'forfeit', winnerId: null, winnerUsername: null, isBye: false,
      roomCode: null, gameId: null,
    };
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'in_progress', format: 'swiss',
      currentRound: 3, totalRounds: 3, gameMode: 'classic',
      matches: [forfeitMatch], participants: [],
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });

    const res = await adminPOST(
      makeRequest({ action: 'resetMatch', matchId: 'm1' }) as never,
      { params: params('t1') },
    );

    expect(res.status).toBe(200);
    expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith({
      where: { tournamentId: 't1', userId: 'p1', eliminatedRound: 3 },
      data: { eliminated: false, eliminatedRound: null },
    });
    expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith({
      where: { tournamentId: 't1', userId: 'p2', eliminatedRound: 3 },
      data: { eliminated: false, eliminatedRound: null },
    });
  });

  it('reverts tournament.status when a forfeit reset on a Swiss completed tournament', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    const forfeitMatch = {
      id: 'm1', tournamentId: 't1', bracket: 'main', round: 3, matchIndex: 1,
      player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
      status: 'forfeit', winnerId: null, winnerUsername: null, isBye: false,
      roomCode: null, gameId: null,
    };
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'completed', format: 'swiss',
      currentRound: 3, totalRounds: 3, winnerId: 'yclooney', winnerUsername: 'yclooney',
      gameMode: 'classic',
      matches: [forfeitMatch], participants: [],
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
    p.tournament.update.mockResolvedValue({});
    p.user.update.mockResolvedValue({});

    const res = await adminPOST(
      makeRequest({ action: 'resetMatch', matchId: 'm1' }) as never,
      { params: params('t1') },
    );

    expect(res.status).toBe(200);
    expect(p.tournament.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({
        status: 'in_progress',
        winnerId: null,
        winnerUsername: null,
        completedAt: null,
      }),
    });
    expect(p.user.update).toHaveBeenCalledWith({
      where: { id: 'yclooney' },
      data: { tournamentWins: { decrement: 1 } },
    });

    const body = await res.json();
    expect(body.tournamentStatusReverted).toBe(true);
    expect(body.wasForfeit).toBe(true);
  });

  it('does NOT revert tournament.status when match was completed normally (not forfeit)', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    const normalMatch = {
      id: 'm1', tournamentId: 't1', bracket: 'main', round: 3, matchIndex: 0,
      player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
      status: 'completed', winnerId: 'p1', winnerUsername: 'P1', isBye: false,
      roomCode: null, gameId: 'g1',
    };
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'in_progress', format: 'swiss',
      currentRound: 3, totalRounds: 3,
      gameMode: 'classic',
      matches: [normalMatch], participants: [],
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });

    const res = await adminPOST(
      makeRequest({ action: 'resetMatch', matchId: 'm1' }) as never,
      { params: params('t1') },
    );

    expect(res.status).toBe(200);
    const updateCalls = p.tournament.update.mock.calls.filter((c: unknown[]) => {
      const args = c[0] as { data?: { status?: string } };
      return args?.data?.status !== undefined;
    });
    expect(updateCalls).toHaveLength(0);
    const body = await res.json();
    expect(body.tournamentStatusReverted).toBe(false);
  });

  it('does NOT revert tournament.status for elimination format even on forfeit', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    const forfeitMatch = {
      id: 'm1', tournamentId: 't1', bracket: 'main', round: 2, matchIndex: 0,
      player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
      status: 'forfeit', winnerId: 'p1', winnerUsername: 'P1', isBye: false,
      roomCode: null, gameId: null,
    };
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'creator', status: 'completed', format: 'elimination',
      currentRound: 2, totalRounds: 2, winnerId: 'p1', winnerUsername: 'P1',
      gameMode: 'classic',
      matches: [forfeitMatch], participants: [],
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });

    const res = await adminPOST(
      makeRequest({ action: 'resetMatch', matchId: 'm1' }) as never,
      { params: params('t1') },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tournamentStatusReverted).toBe(false);
  });
});




describe('setMatchWinner — Swiss loser must NOT be eliminated', () => {
  const swissMatchInRound1 = {
    id: 'm-swiss-r1',
    bracket: null,
    round: 1,
    matchIndex: 0,
    player1Id: 'p1',
    player1Username: 'P1',
    player2Id: 'p2',
    player2Username: 'P2',
    winnerId: null,
    winnerUsername: null,
    status: 'ready',
  };

  it('does NOT eliminate the Swiss loser when admin force-sets a winner', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1',
      creatorId: 'creator',
      status: 'in_progress',
      format: 'swiss',
      totalRounds: 4,
      currentRound: 1,
      matches: [swissMatchInRound1],
      participants: [],
      winnerId: null,
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
    p.user.findUnique.mockResolvedValue({ tournamentWins: 0 });

    const res = await adminPOST(
      makeRequest({ action: 'setMatchWinner', matchId: 'm-swiss-r1', winnerId: 'p1' }) as never,
      { params: params('t1') },
    );

    expect(res.status).toBe(200);
    const eliminationCalls = p.tournamentParticipant.updateMany.mock.calls.filter((c: unknown[]) => {
      const arg = c[0] as { data?: { eliminated?: boolean } };
      return arg?.data?.eliminated === true;
    });
    expect(eliminationCalls).toEqual([]);
  });

  it('does NOT eliminate the double_elimination loser when admin force-sets winner (loserDrop handles it)', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1',
      creatorId: 'creator',
      status: 'in_progress',
      format: 'double_elimination',
      totalRounds: 4,
      currentRound: 1,
      matches: [{
        id: 'm-de-r1', bracket: 'winners', round: 1, matchIndex: 0,
        player1Id: 'p1', player1Username: 'P1',
        player2Id: 'p2', player2Username: 'P2',
        winnerId: null, winnerUsername: null, status: 'ready',
      }],
      participants: [],
      winnerId: null,
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
    p.user.findUnique.mockResolvedValue({ tournamentWins: 0 });

    const res = await adminPOST(
      makeRequest({ action: 'setMatchWinner', matchId: 'm-de-r1', winnerId: 'p1' }) as never,
      { params: params('t1') },
    );

    expect(res.status).toBe(200);
    const eliminationCalls = p.tournamentParticipant.updateMany.mock.calls.filter((c: unknown[]) => {
      const arg = c[0] as { data?: { eliminated?: boolean } };
      return arg?.data?.eliminated === true;
    });
    expect(eliminationCalls).toEqual([]);
  });

  it('DOES eliminate the single-elimination loser when admin force-sets winner', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1',
      creatorId: 'creator',
      status: 'in_progress',
      format: 'elimination',
      totalRounds: 4,
      currentRound: 1,
      matches: [{
        id: 'm-elim-r1', bracket: 'main', round: 1, matchIndex: 0,
        player1Id: 'p1', player1Username: 'P1',
        player2Id: 'p2', player2Username: 'P2',
        winnerId: null, winnerUsername: null, status: 'ready',
      }],
      participants: [],
      winnerId: null,
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
    p.user.findUnique.mockResolvedValue({ tournamentWins: 0 });

    const res = await adminPOST(
      makeRequest({ action: 'setMatchWinner', matchId: 'm-elim-r1', winnerId: 'p1' }) as never,
      { params: params('t1') },
    );

    expect(res.status).toBe(200);
    const eliminationCalls = p.tournamentParticipant.updateMany.mock.calls.filter((c: unknown[]) => {
      const arg = c[0] as { data?: { eliminated?: boolean }; where?: { userId?: string } };
      return arg?.data?.eliminated === true && arg.where?.userId === 'p2';
    });
    expect(eliminationCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT mark tournament winner when admin sets winner on a NON-final match', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator', name: 'Bob' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1',
      creatorId: 'creator',
      status: 'in_progress',
      format: 'elimination',
      totalRounds: 4,
      currentRound: 1,
      matches: [{
        id: 'm-r1', bracket: 'main', round: 1, matchIndex: 0,
        player1Id: 'p1', player1Username: 'P1',
        player2Id: 'p2', player2Username: 'P2',
        winnerId: null, winnerUsername: null, status: 'ready',
      }],
      participants: [],
      winnerId: null,
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
    p.user.findUnique.mockResolvedValue({ tournamentWins: 0 });
    p.tournament.update.mockResolvedValue({});

    const res = await adminPOST(
      makeRequest({ action: 'setMatchWinner', matchId: 'm-r1', winnerId: 'p1' }) as never,
      { params: params('t1') },
    );

    expect(res.status).toBe(200);
    const tournamentCompletionCalls = p.tournament.update.mock.calls.filter((c: unknown[]) => {
      const arg = c[0] as { data?: { winnerId?: string } };
      return arg?.data?.winnerId !== undefined;
    });
    expect(tournamentCompletionCalls).toEqual([]);
  });
});
