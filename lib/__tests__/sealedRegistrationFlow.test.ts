import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    tournamentParticipant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    sealedPoolClaim: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tournamentMatch: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    bannedCard: { findMany: vi.fn() },
    deck: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    userBan: { findFirst: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/auth/authOptions', () => ({ auth: vi.fn() }));

vi.mock('@/lib/socket/server', () => ({ getSocketIO: vi.fn(() => null) }));

vi.mock('@/lib/moderation/sanctions', () => ({ isSuspended: vi.fn(async () => false) }));

vi.mock('@/lib/sealed/boosterGenerator', () => ({ generateSealedPool: vi.fn() }));

vi.mock('@/lib/tournament/matchEventLog', () => ({ logMatchEvent: vi.fn() }));

vi.mock('@/lib/discord/tournamentCreatedWebhook', () => ({ sendTournamentCreated: vi.fn(async () => undefined) }));

vi.mock('@/lib/data/cardIndex', () => ({
  getCardById: vi.fn((id: string) => (id.startsWith('GHOST') ? undefined : { id })),
  getCharacterById: vi.fn((id: string) => (id.startsWith('GHOST') ? undefined : { id, card_type: 'character' })),
  getMissionById: vi.fn((id: string) => (id.startsWith('GHOST') ? undefined : { id, card_type: 'mission' })),
}));

vi.mock('@/lib/data/cardLoader', () => ({
  getPlayableMissions: vi.fn(() => [{ id: 'MSS-01' }, { id: 'MSS-02' }, { id: 'MSS-03' }, { id: 'MSS-04' }]),
  getPlayableCharacters: vi.fn(() => []),
}));

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { generateSealedPool } from '@/lib/sealed/boosterGenerator';
import { SEALED_BUILD_RESERVATION_MS, SEALED_MAX_JOIN_ATTEMPTS } from '@/lib/tournament/sealedRegistration';
import { POST as joinPOST } from '../../app/api/tournaments/[id]/join/route';
import { POST as sealedDeckPOST } from '../../app/api/tournaments/[id]/sealed-deck/route';
import { POST as createTournamentPOST } from '../../app/api/tournaments/route';
import { executeTournamentStart } from '../tournament/startLogic';

type Fn = ReturnType<typeof vi.fn>;

const p = prisma as unknown as {
  tournament: { findUnique: Fn; update: Fn; updateMany: Fn; create: Fn };
  tournamentParticipant: {
    findUnique: Fn; findFirst: Fn; findMany: Fn; create: Fn; update: Fn;
    updateMany: Fn; delete: Fn; deleteMany: Fn; count: Fn;
  };
  sealedPoolClaim: { findUnique: Fn; create: Fn; update: Fn; updateMany: Fn };
  tournamentMatch: { findFirst: Fn; create: Fn; deleteMany: Fn; update: Fn };
  bannedCard: { findMany: Fn };
  deck: { findUnique: Fn };
  user: { findUnique: Fn; update: Fn };
  userBan: { findFirst: Fn };
};

const authMock = auth as unknown as Fn;
const poolGen = generateSealedPool as unknown as Fn;

const USER_ID = 'u1';
const T_ID = 't1';

const params = (id: string) => Promise.resolve({ id });

function makeRequest(url: string, body: object): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const joinRequest = (body: object = {}) => makeRequest(`http://localhost/api/tournaments/${T_ID}/join`, body);
const deckRequest = (body: object) => makeRequest(`http://localhost/api/tournaments/${T_ID}/sealed-deck`, body);

interface TournamentOverrides {
  gameMode?: string;
  status?: string;
  maxPlayers?: number;
  participants?: number;
  sealedBoosterCount?: number | null;
  sealedSetChoice?: string | null;
}

function mockJoinTournament(over: TournamentOverrides = {}) {
  const base = {
    id: T_ID,
    status: over.status ?? 'registration',
    maxPlayers: over.maxPlayers ?? 8,
    isPublic: true,
    joinCode: null,
    requiresDiscord: false,
    type: 'simulator',
    allowedLeagues: [],
    partner: null,
    gameMode: over.gameMode ?? 'sealed',
    sealedBoosterCount: over.sealedBoosterCount === undefined ? 5 : over.sealedBoosterCount,
    sealedSetChoice: over.sealedSetChoice === undefined ? 'random' : over.sealedSetChoice,
    _count: { participants: over.participants ?? 2 },
  };
  p.tournament.findUnique.mockImplementation(async (args: { select?: object }) => {
    if (args?.select) return { status: base.status };
    return base;
  });
}

function poolOf(entries: Array<[string, number]>) {
  const allCards: Array<{ id: string }> = [];
  for (const [id, n] of entries) for (let i = 0; i < n; i++) allCards.push({ id });
  return { boosters: [{ boosterIndex: 0, cards: allCards }], allCards };
}

const STANDARD_POOL = poolOf([['KS-001-C', 20], ['KS-002-C', 20], ['MSS-01', 1], ['MSS-02', 1], ['MSS-03', 1]]);
const LEGAL_CARDS = [...Array(20).fill('KS-001-C'), ...Array(10).fill('KS-002-C')];
const LEGAL_MISSIONS = ['MSS-01', 'MSS-02', 'MSS-03'];

function createArg(fn: Fn): { data: Record<string, unknown> } {
  return fn.mock.calls[0]![0] as { data: Record<string, unknown> };
}

function updateCalls(): Array<{ where: { id: string }; data: Record<string, unknown> }> {
  return p.tournamentParticipant.update.mock.calls.map((c: unknown[]) => c[0] as { where: { id: string }; data: Record<string, unknown> });
}

beforeEach(() => {
  authMock.mockReset();
  poolGen.mockReset();
  for (const model of Object.values(p)) {
    for (const fn of Object.values(model as Record<string, unknown>)) {
      if (typeof fn === 'function' && 'mockReset' in fn) (fn as Fn).mockReset();
    }
  }
  authMock.mockResolvedValue({ user: { id: USER_ID } });
  poolGen.mockReturnValue({ boosters: [], allCards: [] });
  p.tournamentParticipant.findUnique.mockResolvedValue(null);
  p.tournamentParticipant.findFirst.mockResolvedValue(null);
  p.tournamentParticipant.create.mockResolvedValue({ id: 'newPart' });
  p.tournamentParticipant.update.mockResolvedValue({});
  p.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
  p.tournamentParticipant.delete.mockResolvedValue({});
  p.tournamentParticipant.deleteMany.mockResolvedValue({ count: 0 });
  p.tournamentParticipant.count.mockResolvedValue(3);
  p.sealedPoolClaim.findUnique.mockResolvedValue(null);
  p.sealedPoolClaim.create.mockResolvedValue({ id: 'claim1' });
  p.sealedPoolClaim.update.mockResolvedValue({});
  p.sealedPoolClaim.updateMany.mockResolvedValue({ count: 1 });
  p.tournamentMatch.findFirst.mockResolvedValue(null);
  p.tournamentMatch.deleteMany.mockResolvedValue({ count: 0 });
  p.tournamentMatch.create.mockResolvedValue({});
  p.tournament.update.mockResolvedValue({});
  p.tournament.updateMany.mockResolvedValue({ count: 1 });
  p.bannedCard.findMany.mockResolvedValue([]);
  p.userBan.findFirst.mockResolvedValue(null);
  p.user.findUnique.mockResolvedValue({
    username: 'P1', discordId: 'd1', elo: 1000, gameBanned: false, gameBanUntil: null,
  });
});

describe('sealed tournament creation: only a booster count that can build a legal deck is accepted', () => {
  function createRequest(body: object): Request {
    return makeRequest('http://localhost/api/tournaments', {
      name: 'Sealed Cup', maxPlayers: 8, isPublic: true, format: 'swiss', ...body,
    });
  }

  async function createTournament(body: object): Promise<{ status: number; body: Record<string, unknown> }> {
    authMock.mockResolvedValue({ user: { id: USER_ID, name: 'Kutxyt', email: 'kutxyt@example.com' } });
    p.user.findUnique.mockResolvedValue({ role: 'admin' });
    p.tournament.create.mockResolvedValue({ id: 'created', name: 'Sealed Cup' });
    const res = await createTournamentPOST(createRequest(body) as never);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it('accepts the three documented counts and stores them untouched', async () => {
    for (const count of [4, 5, 6]) {
      p.tournament.create.mockClear();
      const res = await createTournament({ gameMode: 'sealed', sealedBoosterCount: count });
      expect(res.status).toBe(201);
      expect(createArg(p.tournament.create).data.sealedBoosterCount).toBe(count);
    }
  });

  it('refuses every count below 4, because 9 characters per booster cannot reach 30', async () => {
    for (const count of [1, 2, 3]) {
      p.tournament.create.mockClear();
      const res = await createTournament({ gameMode: 'sealed', sealedBoosterCount: count });
      expect(res.status).toBe(400);
      expect(res.body.errorKey).toBe('tournament.error.invalidBoosterCount');
      expect(p.tournament.create).not.toHaveBeenCalled();
    }
  });

  it('refuses every count above 6 and every non integer count', async () => {
    for (const count of [7, 12, 99, 4.5, -5, 0, '5']) {
      p.tournament.create.mockClear();
      const res = await createTournament({ gameMode: 'sealed', sealedBoosterCount: count });
      expect(res.status).toBe(400);
      expect(res.body.errorKey).toBe('tournament.error.invalidBoosterCount');
      expect(p.tournament.create).not.toHaveBeenCalled();
    }
  });

  it('defaults an omitted or null count to 5 boosters', async () => {
    for (const body of [{ gameMode: 'sealed' }, { gameMode: 'sealed', sealedBoosterCount: null }]) {
      p.tournament.create.mockClear();
      const res = await createTournament(body);
      expect(res.status).toBe(201);
      expect(createArg(p.tournament.create).data.sealedBoosterCount).toBe(5);
    }
  });

  it('never applies the sealed booster rule to a non-sealed tournament', async () => {
    const res = await createTournament({ gameMode: 'classic', sealedBoosterCount: 99 });
    expect(res.status).toBe(201);
    expect(createArg(p.tournament.create).data.sealedBoosterCount).toBeNull();
  });
});

describe('sealed join: the pool is opened at registration and the seat starts unconfirmed', () => {
  it('opens exactly one pool, stores it as a claim, and attaches it to the participant', async () => {
    const generated = poolOf([['KS-050-C', 50]]);
    poolGen.mockReturnValue(generated);
    mockJoinTournament();

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });

    expect(res.status).toBe(201);
    expect(poolGen).toHaveBeenCalledTimes(1);
    expect(poolGen).toHaveBeenCalledWith(5, 'random');
    expect(p.sealedPoolClaim.create).toHaveBeenCalledTimes(1);
    const claimData = createArg(p.sealedPoolClaim.create).data;
    expect(claimData.tournamentId).toBe(T_ID);
    expect(claimData.userId).toBe(USER_ID);
    expect(claimData.pool).toBe(generated);
    expect(createArg(p.tournamentParticipant.create).data.sealedPool).toBe(generated);
  });

  it('registers the seat with deckValid false so nothing is confirmed at join time', async () => {
    mockJoinTournament();
    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const data = createArg(p.tournamentParticipant.create).data;

    expect(res.status).toBe(201);
    expect(data.deckValid ?? false).toBe(false);
    expect(data.sealedDeck).toBeUndefined();
    const body = await res.json();
    expect(body.requiresSealedBuild).toBe(true);
  });

  it('reserves the seat for twenty minutes and hands the deadline back to the client', async () => {
    mockJoinTournament();
    const before = Date.now();
    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const body = await res.json();
    const deadline = Date.parse(body.sealedBuildDeadline);

    expect(Number.isNaN(deadline)).toBe(false);
    expect(deadline - before).toBeGreaterThanOrEqual(SEALED_BUILD_RESERVATION_MS - 50);
    expect(deadline - before).toBeLessThan(SEALED_BUILD_RESERVATION_MS + 5000);
  });

  it('forwards the configured booster count and set choice untouched', async () => {
    mockJoinTournament({ sealedBoosterCount: 4, sealedSetChoice: 'KS' });
    await joinPOST(joinRequest() as never, { params: params(T_ID) });
    expect(poolGen).toHaveBeenLastCalledWith(4, 'KS');

    poolGen.mockClear();
    mockJoinTournament({ sealedBoosterCount: 6, sealedSetChoice: 'SS' });
    await joinPOST(joinRequest() as never, { params: params(T_ID) });
    expect(poolGen).toHaveBeenLastCalledWith(6, 'SS');

    poolGen.mockClear();
    mockJoinTournament({ sealedBoosterCount: null, sealedSetChoice: null });
    await joinPOST(joinRequest() as never, { params: params(T_ID) });
    expect(poolGen).toHaveBeenLastCalledWith(5, 'random');
  });

  it('counts the very first registration as one of the two allowed attempts', async () => {
    mockJoinTournament();
    await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const claimData = createArg(p.sealedPoolClaim.create).data;
    expect((claimData.joinCount as number | undefined) ?? 1).toBe(1);
    expect(SEALED_MAX_JOIN_ATTEMPTS).toBe(2);
  });

  it('stores nothing when the pool cannot be generated', async () => {
    mockJoinTournament();
    poolGen.mockImplementation(() => { throw new Error('No sealed-ready sets are available'); });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errorKey).toBe('tournament.error.serverError');
    expect(p.sealedPoolClaim.create).not.toHaveBeenCalled();
    expect(p.tournamentParticipant.create).not.toHaveBeenCalled();
  });

  it('never touches the sealed machinery for a non-sealed tournament', async () => {
    mockJoinTournament({ gameMode: 'classic' });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(poolGen).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.findUnique).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.create).not.toHaveBeenCalled();
    expect(p.tournamentParticipant.deleteMany).not.toHaveBeenCalled();
    expect(createArg(p.tournamentParticipant.create).data.sealedPool).toBeUndefined();
    expect(body.requiresSealedBuild).toBe(false);
    expect(body.sealedBuildDeadline).toBeUndefined();
  });
});

describe('sealed rejoin: leaving never rerolls the boosters', () => {
  it('restores the stored pool instead of generating a new one', async () => {
    mockJoinTournament();
    const stored = poolOf([['KS-777-R', 12], ['MSS-02', 3]]);
    p.sealedPoolClaim.findUnique.mockResolvedValue({ pool: stored, joinCount: 1 });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });

    expect(res.status).toBe(201);
    expect(poolGen).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.create).not.toHaveBeenCalled();
    const attached = createArg(p.tournamentParticipant.create).data.sealedPool as typeof stored;
    expect(attached).toBe(stored);
    expect(attached.allCards.length).toBe(15);
    expect(attached.allCards.every((c) => c.id === 'KS-777-R' || c.id === 'MSS-02')).toBe(true);
  });

  it('claims the attempt with a single conditional update that cannot exceed the cap', async () => {
    mockJoinTournament();
    p.sealedPoolClaim.findUnique.mockResolvedValue({ pool: STANDARD_POOL, joinCount: 1 });

    await joinPOST(joinRequest() as never, { params: params(T_ID) });

    expect(p.sealedPoolClaim.update).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.updateMany).toHaveBeenCalledTimes(1);
    const arg = p.sealedPoolClaim.updateMany.mock.calls[0]![0] as {
      where: { tournamentId: string; userId: string; joinCount: { lt: number } };
      data: { joinCount: { increment: number } };
    };
    expect(arg.where.tournamentId).toBe(T_ID);
    expect(arg.where.userId).toBe(USER_ID);
    expect(arg.where.joinCount).toEqual({ lt: SEALED_MAX_JOIN_ATTEMPTS });
    expect(arg.data.joinCount).toEqual({ increment: 1 });
  });

  it('refuses the join when a concurrent request already consumed the last attempt', async () => {
    mockJoinTournament();
    p.sealedPoolClaim.findUnique.mockResolvedValue({ pool: STANDARD_POOL, joinCount: 1 });
    p.sealedPoolClaim.updateMany.mockResolvedValue({ count: 0 });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorKey).toBe('tournament.error.sealedRejoinLimit');
    expect(p.tournamentParticipant.create).not.toHaveBeenCalled();
    expect(poolGen).not.toHaveBeenCalled();
  });

  it('never lets two simultaneous joins push the counter past the cap', async () => {
    mockJoinTournament();
    p.sealedPoolClaim.findUnique.mockResolvedValue({ pool: STANDARD_POOL, joinCount: 1 });
    let granted = 0;
    p.sealedPoolClaim.updateMany.mockImplementation(async () => {
      granted++;
      return { count: granted === 1 ? 1 : 0 };
    });

    const [first, second] = await Promise.all([
      joinPOST(joinRequest() as never, { params: params(T_ID) }),
      joinPOST(joinRequest() as never, { params: params(T_ID) }),
    ]);
    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([201, 403]);
    expect(p.tournamentParticipant.create).toHaveBeenCalledTimes(1);
  });

  it('accepts a legacy claim row whose counter is still zero', async () => {
    mockJoinTournament();
    p.sealedPoolClaim.findUnique.mockResolvedValue({ pool: STANDARD_POOL, joinCount: 0 });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });

    expect(res.status).toBe(201);
    expect(poolGen).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.updateMany).toHaveBeenCalledTimes(1);
  });

  it('refuses the third registration with 403 and the rejoin-limit key', async () => {
    mockJoinTournament();
    p.sealedPoolClaim.findUnique.mockResolvedValue({ pool: STANDARD_POOL, joinCount: SEALED_MAX_JOIN_ATTEMPTS });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.errorKey).toBe('tournament.error.sealedRejoinLimit');
    expect(p.tournamentParticipant.create).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.update).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.updateMany).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.create).not.toHaveBeenCalled();
    expect(poolGen).not.toHaveBeenCalled();
  });

  it('keeps refusing every attempt beyond the third', async () => {
    for (const joinCount of [3, 4, 9, 50]) {
      p.tournamentParticipant.create.mockClear();
      p.sealedPoolClaim.updateMany.mockClear();
      poolGen.mockClear();
      mockJoinTournament();
      p.sealedPoolClaim.findUnique.mockResolvedValue({ pool: STANDARD_POOL, joinCount });

      const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.errorKey).toBe('tournament.error.sealedRejoinLimit');
      expect(p.tournamentParticipant.create).not.toHaveBeenCalled();
      expect(p.sealedPoolClaim.updateMany).not.toHaveBeenCalled();
      expect(poolGen).not.toHaveBeenCalled();
    }
  });

  it('does not burn an attempt when the player is already registered', async () => {
    mockJoinTournament();
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'alreadyThere' });
    p.sealedPoolClaim.findUnique.mockResolvedValue({ pool: STANDARD_POOL, joinCount: 1 });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorKey).toBe('tournament.error.alreadyJoined');
    expect(p.sealedPoolClaim.update).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.updateMany).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.create).not.toHaveBeenCalled();
    expect(poolGen).not.toHaveBeenCalled();
  });
});

describe('sealed capacity: only expired unconfirmed seats are released', () => {
  it('targets unconfirmed seats older than the reservation, and never the caller own seat', async () => {
    mockJoinTournament();
    const before = Date.now();

    await joinPOST(joinRequest() as never, { params: params(T_ID) });

    expect(p.tournamentParticipant.deleteMany).toHaveBeenCalledTimes(1);
    const where = (p.tournamentParticipant.deleteMany.mock.calls[0]![0] as {
      where: { tournamentId: string; deckValid: boolean; userId: { not: string }; joinedAt: { lt: Date } };
    }).where;
    expect(where.tournamentId).toBe(T_ID);
    expect(where.deckValid).toBe(false);
    expect(where.userId).toEqual({ not: USER_ID });
    const elapsed = before - where.joinedAt.lt.getTime();
    expect(elapsed).toBeGreaterThanOrEqual(SEALED_BUILD_RESERVATION_MS - 50);
    expect(elapsed).toBeLessThan(SEALED_BUILD_RESERVATION_MS + 5000);
  });

  it('lets a new player in when released seats free up room', async () => {
    mockJoinTournament({ maxPlayers: 8, participants: 8 });
    p.tournamentParticipant.deleteMany.mockResolvedValue({ count: 2 });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });

    expect(res.status).toBe(201);
    expect(p.tournamentParticipant.create).toHaveBeenCalledTimes(1);
  });

  it('accepts exactly one freed seat at the capacity boundary', async () => {
    mockJoinTournament({ maxPlayers: 8, participants: 8 });
    p.tournamentParticipant.deleteMany.mockResolvedValue({ count: 1 });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });

    expect(res.status).toBe(201);
  });

  it('still refuses a full tournament when nothing was released', async () => {
    mockJoinTournament({ maxPlayers: 8, participants: 8 });
    p.tournamentParticipant.deleteMany.mockResolvedValue({ count: 0 });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorKey).toBe('tournament.error.tournamentFull');
    expect(poolGen).not.toHaveBeenCalled();
    expect(p.sealedPoolClaim.create).not.toHaveBeenCalled();
    expect(p.tournamentParticipant.create).not.toHaveBeenCalled();
  });

  it('never releases seats in a non-sealed tournament, even when it is full', async () => {
    mockJoinTournament({ gameMode: 'classic', maxPlayers: 8, participants: 8 });

    const res = await joinPOST(joinRequest() as never, { params: params(T_ID) });

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.deleteMany).not.toHaveBeenCalled();
  });
});

describe('sealed deck submission: one legal deck confirms the seat for good', () => {
  function mockSealedDeckContext(over: {
    gameMode?: string;
    status?: string;
    participant?: unknown;
  } = {}) {
    p.tournament.findUnique.mockResolvedValue({
      gameMode: over.gameMode ?? 'sealed',
      status: over.status ?? 'registration',
    });
    p.tournamentParticipant.findUnique.mockResolvedValue(
      over.participant === undefined
        ? { id: 'part1', sealedPool: STANDARD_POOL, deckValid: false }
        : over.participant,
    );
  }

  it('confirms a legal deck built entirely from the pool', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(p.tournamentParticipant.update).toHaveBeenCalledTimes(1);
    const arg = p.tournamentParticipant.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { deckValid: boolean; sealedDeck: { cardIds: string[]; missionIds: string[] } };
    };
    expect(arg.where.id).toBe('part1');
    expect(arg.data.deckValid).toBe(true);
    expect(arg.data.sealedDeck.cardIds).toEqual(LEGAL_CARDS);
    expect(arg.data.sealedDeck.missionIds).toEqual(LEGAL_MISSIONS);
  });

  it('accepts a deck that uses every copy that was actually opened', async () => {
    mockSealedDeckContext({
      participant: {
        id: 'part1',
        sealedPool: poolOf([['KS-030-C', 30], ['MSS-01', 1], ['MSS-02', 1], ['MSS-03', 1]]),
        deckValid: false,
      },
    });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: Array(30).fill('KS-030-C'), missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(200);
    expect(p.tournamentParticipant.update).toHaveBeenCalledTimes(1);
  });

  it('refuses a second submission with 409 and leaves the locked deck untouched', async () => {
    mockSealedDeckContext({ participant: { id: 'part1', sealedPool: STANDARD_POOL, deckValid: true } });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.errorKey).toBe('tournament.error.sealedDeckLocked');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses a card that was never opened, and names it', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: [...Array(29).fill('KS-001-C'), 'KS-140-S'], missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses using a pooled card more times than it was opened', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: Array(30).fill('KS-002-C').concat(Array(11).fill('KS-002-C')), missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('has no two-copies-per-version limit, so twenty copies of one common are legal', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(200);
    expect(LEGAL_CARDS.filter((c) => c === 'KS-001-C').length).toBe(20);
  });

  it('refuses a deck below thirty characters with the too-small key, and never confirms the seat', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: Array(29).fill('KS-001-C'), missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorKey).toBe('tournament.error.sealedDeckTooSmall');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses an empty submission with the too-small key, never a generic invalid-deck key', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(deckRequest({ cardIds: [], missionIds: [] }) as never, { params: params(T_ID) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorKey).toBe('tournament.error.sealedDeckTooSmall');
    expect(body.errorKey).not.toBe('game.error.invalidDeck');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses any mission count other than exactly three with the mission-count key', async () => {
    for (const missionIds of [[], ['MSS-01'], ['MSS-01', 'MSS-02'], ['MSS-01', 'MSS-02', 'MSS-03', 'MSS-04']]) {
      p.tournamentParticipant.update.mockClear();
      mockSealedDeckContext();

      const res = await sealedDeckPOST(
        deckRequest({ cardIds: LEGAL_CARDS, missionIds }) as never,
        { params: params(T_ID) },
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.errorKey).toBe('tournament.error.sealedMissionCount');
      expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
    }
  });

  it('refuses a mission that was never opened, and names it', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: ['MSS-01', 'MSS-02', 'MSS-04'] }) as never,
      { params: params(T_ID) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(body.offendingCardId).toBe('MSS-04');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses the same opened mission used three times when only one copy was opened', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: ['MSS-01', 'MSS-01', 'MSS-01'] }) as never,
      { params: params(T_ID) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(body.offendingCardId).toBe('MSS-01');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('accepts three copies of one mission when the boosters really opened three', async () => {
    mockSealedDeckContext({
      participant: {
        id: 'part1',
        sealedPool: poolOf([['KS-001-C', 30], ['MSS-01', 3]]),
        deckValid: false,
      },
    });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: Array(30).fill('KS-001-C'), missionIds: ['MSS-01', 'MSS-01', 'MSS-01'] }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(200);
    expect(p.tournamentParticipant.update).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown character id even when the stored pool contains it', async () => {
    mockSealedDeckContext({
      participant: {
        id: 'part1',
        sealedPool: poolOf([['GHOST-CHAR', 30], ['MSS-01', 1], ['MSS-02', 1], ['MSS-03', 1]]),
        deckValid: false,
      },
    });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: Array(30).fill('GHOST-CHAR'), missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown mission id even when the stored pool claims to hold it', async () => {
    mockSealedDeckContext({
      participant: {
        id: 'part1',
        sealedPool: poolOf([['KS-001-C', 30], ['MSS-01', 1], ['MSS-02', 1], ['GHOST-MISSION', 1]]),
        deckValid: false,
      },
    });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: Array(30).fill('KS-001-C'), missionIds: ['MSS-01', 'MSS-02', 'GHOST-MISSION'] }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses when no pool is on file for that seat', async () => {
    mockSealedDeckContext({ participant: { id: 'part1', sealedPool: null, deckValid: false } });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses a malformed stored pool that is not a card list', async () => {
    mockSealedDeckContext({ participant: { id: 'part1', sealedPool: { boosters: [], allCards: 'nope' }, deckValid: false } });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('ignores non-string entries so a padded payload cannot fake the deck size', async () => {
    mockSealedDeckContext();
    const padded = [...Array(25).fill('KS-001-C'), 1, 2, 3, 4, 5];

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: padded, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses a body whose fields are not arrays at all', async () => {
    mockSealedDeckContext();

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: 'KS-001-C', missionIds: null }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses a sealed deck submitted to a non-sealed tournament', async () => {
    mockSealedDeckContext({ gameMode: 'classic' });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('refuses a submission once registration is closed', async () => {
    mockSealedDeckContext({ status: 'in_progress' });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the caller is not registered in that tournament', async () => {
    mockSealedDeckContext({ participant: null });

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(404);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('returns 401 without a session and never reads the tournament', async () => {
    authMock.mockResolvedValue(null);

    const res = await sealedDeckPOST(
      deckRequest({ cardIds: LEGAL_CARDS, missionIds: LEGAL_MISSIONS }) as never,
      { params: params(T_ID) },
    );

    expect(res.status).toBe(401);
    expect(p.tournament.findUnique).not.toHaveBeenCalled();
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });
});

describe('sealed tournament start: unconfirmed seats are eliminated and no deck is auto-built', () => {
  interface StartParticipant {
    id: string;
    userId: string;
    username: string;
    deckValid: boolean;
    sealedPool: unknown;
    sealedDeck: unknown;
    eliminated?: boolean;
  }

  function confirmedDeck() {
    return { cardIds: Array(30).fill('KS-001-C'), missionIds: LEGAL_MISSIONS };
  }

  function mockStart(participants: StartParticipant[], format = 'swiss') {
    p.tournament.findUnique.mockResolvedValue({
      id: T_ID,
      status: 'registration',
      format,
      gameMode: 'sealed',
      useBanList: false,
      bannedCardIds: [],
      partner: null,
      sealedBoosterCount: 5,
      sealedSetChoice: 'KS',
      participants: participants.map((x) => ({ seed: null, eliminated: false, ...x })),
    });
  }

  it('keeps only the participants whose sealed deck was confirmed', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
    ]);

    const result = await executeTournamentStart(T_ID);

    expect(result.ok).toBe(true);
    const eliminated = updateCalls().filter((c) => c.data.eliminated === true);
    expect(eliminated.length).toBe(1);
    expect(eliminated[0]!.where.id).toBe('p3');
  });

  it('eliminates an unconfirmed seat at round zero and forces deckValid false', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
    ]);

    await executeTournamentStart(T_ID);

    const elim = updateCalls().find((c) => c.where.id === 'p3' && c.data.eliminated === true)!;
    expect(elim).toBeTruthy();
    expect(elim.data.eliminatedRound).toBe(0);
    expect(elim.data.deckValid).toBe(false);
  });

  it('never writes a sealed deck at start, whatever the participant state', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: false, sealedPool: null, sealedDeck: null },
      { id: 'p4', userId: 'u4', username: 'D', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
    ]);

    await executeTournamentStart(T_ID);

    const wroteADeck = updateCalls().filter((c) => c.data.sealedDeck !== undefined);
    expect(wroteADeck.length).toBe(0);
  });

  it('never opens a pool at start, not even for a seat that has none, and eliminates it', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: false, sealedPool: null, sealedDeck: null },
    ]);

    await executeTournamentStart(T_ID);

    expect(poolGen).not.toHaveBeenCalled();
    expect(updateCalls().some((c) => c.data.sealedPool !== undefined)).toBe(false);
    const elim = updateCalls().find((c) => c.where.id === 'p3' && c.data.eliminated === true);
    expect(elim).toBeTruthy();
  });

  it('treats a confirmed flag with an incomplete stored deck as unconfirmed', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: { cardIds: Array(29).fill('KS-001-C'), missionIds: LEGAL_MISSIONS } },
      { id: 'p4', userId: 'u4', username: 'D', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: { cardIds: Array(30).fill('KS-001-C'), missionIds: ['MSS-01', 'MSS-02'] } },
    ]);

    const result = await executeTournamentStart(T_ID);

    expect(result.ok).toBe(true);
    const eliminatedIds = updateCalls().filter((c) => c.data.eliminated === true).map((c) => c.where.id);
    expect(eliminatedIds.sort()).toEqual(['p3', 'p4']);
  });

  it('treats a complete stored deck without the confirmation flag as unconfirmed', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
    ]);

    await executeTournamentStart(T_ID);

    const eliminatedIds = updateCalls().filter((c) => c.data.eliminated === true).map((c) => c.where.id);
    expect(eliminatedIds).toEqual(['p3']);
  });

  it('never flips a confirmed seat back to unconfirmed', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
    ]);

    await executeTournamentStart(T_ID);

    const demoted = updateCalls().filter((c) => c.data.deckValid === false).map((c) => c.where.id);
    expect(demoted).toEqual(['p3']);
    expect(demoted).not.toContain('p1');
    expect(demoted).not.toContain('p2');
  });

  it('runs the event as a plain Swiss over the confirmed decks only', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p4', userId: 'u4', username: 'D', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
      { id: 'p5', userId: 'u5', username: 'E', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
    ]);

    const result = await executeTournamentStart(T_ID);

    expect(result.ok).toBe(true);
    const seated = new Set<string>();
    for (const call of p.tournamentMatch.create.mock.calls) {
      const data = (call[0] as { data: { player1Id: string | null; player2Id: string | null } }).data;
      if (data.player1Id) seated.add(data.player1Id);
      if (data.player2Id) seated.add(data.player2Id);
    }
    expect(seated.size).toBe(3);
    expect([...seated].sort()).toEqual(['u1', 'u2', 'u3']);
    expect(seated.has('u4')).toBe(false);
    expect(seated.has('u5')).toBe(false);
    const statusUpdate = p.tournament.update.mock.calls.find((c: unknown[]) =>
      (c[0] as { data?: { status?: string } }).data?.status === 'in_progress');
    expect(statusUpdate).toBeTruthy();
  });

  it('refuses to start when fewer than two sealed decks were confirmed', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
      { id: 'p3', userId: 'u3', username: 'C', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
    ]);

    const result = await executeTournamentStart(T_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/at least 2/i);
    }
    expect(p.tournamentMatch.create).not.toHaveBeenCalled();
  });

  it('refuses to start when nobody confirmed a sealed deck', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: false, sealedPool: STANDARD_POOL, sealedDeck: null },
    ]);

    const result = await executeTournamentStart(T_ID);

    expect(result.ok).toBe(false);
    const eliminatedIds = updateCalls().filter((c) => c.data.eliminated === true).map((c) => c.where.id);
    expect(eliminatedIds.sort()).toEqual(['p1', 'p2']);
    expect(p.tournamentMatch.create).not.toHaveBeenCalled();
  });

  it('does not run the personal-deck validation path on a sealed event', async () => {
    mockStart([
      { id: 'p1', userId: 'u1', username: 'A', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
      { id: 'p2', userId: 'u2', username: 'B', deckValid: true, sealedPool: STANDARD_POOL, sealedDeck: confirmedDeck() },
    ]);

    await executeTournamentStart(T_ID);

    expect(p.deck.findUnique).not.toHaveBeenCalled();
  });
});
