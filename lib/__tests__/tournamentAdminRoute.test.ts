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
}));

vi.mock('@/lib/tournament/swissEngine', () => ({
  computeStandings: vi.fn(() => []),
}));

vi.mock('@/lib/tournament/absenceManager', () => ({
  clearAbsenceTimer: vi.fn(),
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
  tournamentMatch: { update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
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
