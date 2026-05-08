import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    tournamentParticipant: {
      findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(),
      delete: vi.fn(), deleteMany: vi.fn(),
      create: vi.fn(), count: vi.fn(),
    },
    tournamentMatch: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      update: vi.fn(), deleteMany: vi.fn(),
    },
    tournamentAdminLog: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
    userBan: { findFirst: vi.fn() },
    bannedCard: { findMany: vi.fn() },
    deck: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma: m };
});

vi.mock('@/lib/auth/authOptions', () => ({ auth: vi.fn() }));
vi.mock('@/lib/socket/server', () => ({ getSocketIO: vi.fn(() => null), rooms: new Map() }));
vi.mock('@/lib/socket/tournamentHandlers', () => ({
  advanceMatchWinner: vi.fn(), advanceMatchWinnerDoubleElim: vi.fn(),
  handleSwissMatchEnd: vi.fn(),
  cleanupTournamentMapsByIds: vi.fn(), cleanupTournamentMapsExternal: vi.fn(),
}));
vi.mock('@/lib/tournament/absenceManager', () => ({ clearAbsenceTimer: vi.fn() }));
vi.mock('@/lib/tournament/matchEventLog', () => ({ logMatchEvent: vi.fn() }));
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({ finalizeAndScheduleRoomDeletion: vi.fn() }));
vi.mock('@/lib/tournament/leagueUtils', () => ({
  getPlayerLeague: vi.fn(() => 'starter'),
  validateLeagueKeys: vi.fn(() => true),
}));
vi.mock('@/lib/tournament/deckValidation', () => ({
  validateDeckForTournament: vi.fn(() => ({ valid: true, errors: [] })),
}));
vi.mock('@/lib/tournament/startLogic', () => ({
  executeTournamentStart: vi.fn(() => ({ ok: true })),
}));
vi.mock('@/lib/tournament/tournamentEngine', () => ({
  generateJoinCode: vi.fn(() => 'CODE123'),
}));

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { POST as leavePOST } from '../../app/api/tournaments/[id]/leave/route';
import { POST as selectDeckPOST } from '../../app/api/tournaments/[id]/select-deck/route';
import { POST as pairingsPOST } from '../../app/api/tournaments/[id]/pairings/route';
import { POST as forfeitPOST } from '../../app/api/tournaments/[id]/matches/[matchId]/forfeit/route';
import { POST as joinByCodePOST } from '../../app/api/tournaments/join-by-code/route';
import { GET as singleGET, DELETE as singleDELETE } from '../../app/api/tournaments/[id]/route';
import { POST as startPOST } from '../../app/api/tournaments/[id]/start/route';
import { GET as listGET, POST as createPOST } from '../../app/api/tournaments/route';

const p = prisma as never as {
  tournament: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  tournamentParticipant: {
    findFirst: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>;
  };
  tournamentMatch: {
    findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
  userBan: { findFirst: ReturnType<typeof vi.fn> };
  deck: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const authMock = auth as never as ReturnType<typeof vi.fn>;

function req(body: object | undefined, url = 'http://localhost/'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = (id: string) => Promise.resolve({ id });
const matchParams = (id: string, matchId: string) => Promise.resolve({ id, matchId });

beforeEach(() => {
  authMock.mockReset();
  for (const model of Object.values(p)) {
    if (typeof model === 'object' && model !== null) {
      for (const fn of Object.values(model as Record<string, unknown>)) {
        if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    } else if (typeof model === 'function') {
      (model as ReturnType<typeof vi.fn>).mockReset();
    }
  }
});

describe('POST /api/tournaments/[id]/leave', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await leavePOST(req(undefined) as never, { params: params('t1') });
    expect(res.status).toBe(401);
  });
  it('returns 404 when tournament not found', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue(null);
    const res = await leavePOST(req(undefined) as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });
  it('rejects creator from leaving', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', status: 'registration', creatorId: 'creator' });
    const res = await leavePOST(req(undefined) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
  it('rejects leave after start', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', status: 'in_progress', creatorId: 'creator' });
    const res = await leavePOST(req(undefined) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
  it('compensating-action: recreates participant if status flipped during leave', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    let firstCall = true;
    p.tournament.findUnique.mockImplementation(async () => {
      if (firstCall) { firstCall = false; return { id: 't1', status: 'registration', creatorId: 'creator' }; }
      return { status: 'in_progress' };
    });
    p.tournamentParticipant.findFirst.mockResolvedValue({
      tournamentId: 't1', userId: 'u1', username: 'P1', seed: null,
      eliminated: false, eliminatedRound: null, hasBye: false,
      deckId: 'd1', deckValid: true, sealedPool: null,
    });
    p.tournamentParticipant.deleteMany.mockResolvedValue({ count: 1 });
    p.tournamentParticipant.create.mockResolvedValue({});
    const res = await leavePOST(req(undefined) as never, { params: params('t1') });
    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.create).toHaveBeenCalled();
  });
});

describe('POST /api/tournaments/[id]/select-deck', () => {
  it('returns 400 when deckId is missing', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await selectDeckPOST(req({}) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
  it('returns 404 when tournament not found', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue(null);
    const res = await selectDeckPOST(req({ deckId: 'd1' }) as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });
  it('rejects sealed mode (decks built in-game)', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', status: 'registration', gameMode: 'sealed' });
    p.tournamentParticipant.findFirst.mockResolvedValue({ id: 'p1' });
    const res = await selectDeckPOST(req({ deckId: 'd1' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
  it('rejects deck owned by another user', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', status: 'registration', gameMode: 'classic' });
    p.tournamentParticipant.findFirst.mockResolvedValue({ id: 'p1', deckId: null, deckValid: false });
    p.deck.findUnique.mockResolvedValue({ id: 'd1', userId: 'someone-else' });
    const res = await selectDeckPOST(req({ deckId: 'd1' }) as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });
  it('compensating-action rolls back if status flipped during select', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    let firstCall = true;
    p.tournament.findUnique.mockImplementation(async () => {
      if (firstCall) { firstCall = false; return { id: 't1', status: 'registration', gameMode: 'classic', useBanList: false }; }
      return { status: 'in_progress' };
    });
    p.tournamentParticipant.findFirst.mockResolvedValue({ id: 'p1', deckId: 'oldDeck', deckValid: true });
    p.deck.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1', cardIds: [], missionIds: [] });
    p.tournamentParticipant.update.mockResolvedValue({});
    const res = await selectDeckPOST(req({ deckId: 'd1' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
    const rollbackCall = p.tournamentParticipant.update.mock.calls.find((c: unknown[]) =>
      ((c[0] as { data?: { deckId?: string } }).data?.deckId === 'oldDeck'),
    );
    expect(rollbackCall).toBeTruthy();
  });
});

describe('POST /api/tournaments/[id]/pairings', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await pairingsPOST(req({ orderedPlayerIds: [] }) as never, { params: params('t1') });
    expect(res.status).toBe(401);
  });
  it('returns 404 when tournament not found', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue(null);
    const res = await pairingsPOST(req({ orderedPlayerIds: [] }) as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });
  it('rejects on non-simulator type', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'u1', type: 'casual', status: 'registration', participants: [],
    });
    const res = await pairingsPOST(req({ orderedPlayerIds: [] }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
  it('rejects invalid orderedPlayerIds (not an array)', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'u1', type: 'simulator', status: 'registration', participants: [{ userId: 'a' }],
    });
    const res = await pairingsPOST(req({ orderedPlayerIds: 'oops' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
  it('rejects ids that do not match participants', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', creatorId: 'u1', type: 'simulator', status: 'registration',
      participants: [{ userId: 'a' }, { userId: 'b' }],
    });
    const res = await pairingsPOST(req({ orderedPlayerIds: ['a', 'unknown'] }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tournaments/[id]/matches/[matchId]/forfeit', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await forfeitPOST(req({ forfeitPlayerId: 'u1' }) as never, { params: matchParams('t1', 'm1') });
    expect(res.status).toBe(401);
  });
  it('rejects already-resolved match', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', creatorId: 'creator', format: 'swiss' });
    p.tournamentMatch.findUnique.mockResolvedValue({ id: 'm1', status: 'completed' });
    const res = await forfeitPOST(req({ forfeitPlayerId: 'u1' }) as never, { params: matchParams('t1', 'm1') });
    expect(res.status).toBe(400);
  });
  it('rejects player not in this match', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', creatorId: 'creator', format: 'swiss' });
    p.tournamentMatch.findUnique.mockResolvedValue({ id: 'm1', status: 'ready', player1Id: 'a', player2Id: 'b' });
    const res = await forfeitPOST(req({ forfeitPlayerId: 'unknown' }) as never, { params: matchParams('t1', 'm1') });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tournaments/join-by-code', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await joinByCodePOST(req({ code: 'ABC' }) as never);
    expect(res.status).toBe(401);
  });
  it('returns 400 when code missing', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await joinByCodePOST(req({}) as never);
    expect(res.status).toBe(400);
  });
  it('returns 404 when code does not match', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue(null);
    const res = await joinByCodePOST(req({ code: 'NOPE' }) as never);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/tournaments/[id]', () => {
  it('returns 404 when not found', async () => {
    p.tournament.findUnique.mockResolvedValue(null);
    const res = await singleGET(new Request('http://localhost/') as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });
  it('hides private tournaments from non-participants (404)', async () => {
    authMock.mockResolvedValue({ user: { id: 'random' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', isPublic: false, creatorId: 'someone-else',
      participants: [],
      matches: [],
    });
    const res = await singleGET(new Request('http://localhost/') as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });
  it('redacts joinCode for non-creator viewers of public tournament', async () => {
    authMock.mockResolvedValue({ user: { id: 'random' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', isPublic: true, creatorId: 'someone-else', joinCode: 'SECRET',
      participants: [], matches: [],
    });
    const res = await singleGET(new Request('http://localhost/') as never, { params: params('t1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tournament.joinCode).toBeNull();
  });
  it('shows joinCode to creator', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', isPublic: true, creatorId: 'creator', joinCode: 'SECRET',
      participants: [], matches: [],
    });
    const res = await singleGET(new Request('http://localhost/') as never, { params: params('t1') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tournament.joinCode).toBe('SECRET');
  });
});

describe('DELETE /api/tournaments/[id]', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await singleDELETE(new Request('http://localhost/', { method: 'DELETE' }) as never, { params: params('t1') });
    expect(res.status).toBe(401);
  });
  it('rejects non-creator non-admin', async () => {
    authMock.mockResolvedValue({ user: { id: 'random' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', creatorId: 'someone' });
    const res = await singleDELETE(new Request('http://localhost/', { method: 'DELETE' }) as never, { params: params('t1') });
    expect(res.status).toBe(403);
  });
  it('rejects deletion of in_progress tournament', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', creatorId: 'creator', status: 'in_progress' });
    const res = await singleDELETE(new Request('http://localhost/', { method: 'DELETE' }) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });
  it('successfully deletes registration tournament with cascade', async () => {
    authMock.mockResolvedValue({ user: { id: 'creator' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', creatorId: 'creator', status: 'registration' });
    p.tournamentMatch.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    p.$transaction.mockResolvedValue([]);
    const res = await singleDELETE(new Request('http://localhost/', { method: 'DELETE' }) as never, { params: params('t1') });
    expect(res.status).toBe(200);
    expect(p.$transaction).toHaveBeenCalled();
  });
});

describe('POST /api/tournaments/[id]/start', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await startPOST(req({}) as never, { params: params('t1') });
    expect(res.status).toBe(401);
  });
  it('returns 404 when tournament not found', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue(null);
    const res = await startPOST(req({}) as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });
  it('rejects non-creator non-admin', async () => {
    authMock.mockResolvedValue({ user: { id: 'random' } });
    p.tournament.findUnique.mockResolvedValue({ id: 't1', creatorId: 'someone-else' });
    const res = await startPOST(req({}) as never, { params: params('t1') });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/tournaments (list)', () => {
  it('returns tournaments unaffected by privacy when isPublic=true', async () => {
    authMock.mockResolvedValue({ user: { id: 'random' } });
    p.tournament.findMany.mockResolvedValue([
      { id: 't1', creatorId: 'someone', isPublic: true, joinCode: 'ABC', participants: [], _count: { participants: 0, matches: 0 } },
    ]);
    const res = await listGET(new Request('http://localhost/api/tournaments?type=simulator') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tournaments).toHaveLength(1);
    expect(body.tournaments[0].joinCode).toBeNull();
  });
  it('hides isPublic=false tournaments from non-creator non-participant', async () => {
    authMock.mockResolvedValue({ user: { id: 'random' } });
    p.tournament.findMany.mockResolvedValue([
      { id: 't1', creatorId: 'someone', isPublic: false, joinCode: 'ABC', participants: [{ userId: 'x' }], _count: { participants: 1, matches: 0 } },
      { id: 't2', creatorId: 'someone', isPublic: true, joinCode: 'XYZ', participants: [], _count: { participants: 0, matches: 0 } },
    ]);
    const res = await listGET(new Request('http://localhost/api/tournaments') as never);
    const body = await res.json();
    expect(body.tournaments).toHaveLength(1);
    expect(body.tournaments[0].id).toBe('t2');
  });
  it('shows private tournament to its participant', async () => {
    authMock.mockResolvedValue({ user: { id: 'partUser' } });
    p.tournament.findMany.mockResolvedValue([
      { id: 't1', creatorId: 'someone', isPublic: false, joinCode: 'ABC', participants: [{ userId: 'partUser' }], _count: { participants: 1, matches: 0 } },
    ]);
    const res = await listGET(new Request('http://localhost/api/tournaments') as never);
    const body = await res.json();
    expect(body.tournaments).toHaveLength(1);
    expect(body.tournaments[0].joinCode).toBeNull();
  });
});

describe('POST /api/tournaments (create)', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await createPOST(req({ name: 'T', maxPlayers: 8 }) as never);
    expect(res.status).toBe(401);
  });
  it('rejects non-admin', async () => {
    authMock.mockResolvedValue({ user: { id: 'random', email: 'x@y.z', name: 'Random' } });
    const res = await createPOST(req({ name: 'T', maxPlayers: 8 }) as never);
    expect(res.status).toBe(403);
  });
  it('rejects elimination format with non-power-of-2 players', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin', email: 'matteo.biyikli3224@gmail.com', name: 'Kutxyt' } });
    const res = await createPOST(req({ name: 'T', maxPlayers: 5, format: 'elimination' }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/4, 8, 16, or 32/);
  });
  it('rejects empty name', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin', name: 'Kutxyt' } });
    const res = await createPOST(req({ name: '   ', maxPlayers: 8 }) as never);
    expect(res.status).toBe(400);
  });
  it('rejects name longer than 80 chars', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin', name: 'Kutxyt' } });
    const res = await createPOST(req({ name: 'x'.repeat(81), maxPlayers: 8 }) as never);
    expect(res.status).toBe(400);
  });
  it('rejects gameMode outside the whitelist', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin', name: 'Kutxyt' } });
    const res = await createPOST(req({ name: 'T', maxPlayers: 8, gameMode: 'foobar' }) as never);
    expect(res.status).toBe(400);
  });
  it('rejects sealed booster count out of [1,12]', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin', name: 'Kutxyt' } });
    const res = await createPOST(req({ name: 'T', maxPlayers: 8, gameMode: 'sealed', sealedBoosterCount: 99 }) as never);
    expect(res.status).toBe(400);
  });
  it('happy path creates a tournament and returns 201', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin', name: 'Kutxyt' } });
    p.user.findUnique.mockResolvedValue({ username: 'admin' });
    (p.tournament as { create?: ReturnType<typeof vi.fn> }).create = vi.fn().mockResolvedValue({ id: 'newT', name: 'T' });
    const res = await createPOST(req({ name: 'My Tournament', maxPlayers: 8, format: 'swiss' }) as never);
    expect(res.status).toBe(201);
  });
});
