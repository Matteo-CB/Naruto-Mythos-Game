import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn() },
    tournamentParticipant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    userBan: { findFirst: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/auth/authOptions', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/socket/server', () => ({
  getSocketIO: vi.fn(() => null),
}));

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { POST as joinPOST } from '../../app/api/tournaments/[id]/join/route';

const p = prisma as unknown as {
  tournament: { findUnique: ReturnType<typeof vi.fn> };
  tournamentParticipant: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
  userBan: { findFirst: ReturnType<typeof vi.fn> };
};
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function makeRequest(body: object, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/tournaments/t1/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  for (const model of Object.values(p)) {
    if (typeof model === 'object' && model !== null) {
      for (const fn of Object.values(model as Record<string, unknown>)) {
        if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
  p.tournamentParticipant.findUnique.mockResolvedValue(null);
  p.tournamentParticipant.findFirst.mockResolvedValue(null);
  p.tournamentParticipant.count.mockResolvedValue(1);
  p.tournamentParticipant.create.mockResolvedValue({ id: 'newPart' });
  p.tournamentParticipant.delete.mockResolvedValue({});
  p.userBan.findFirst.mockResolvedValue(null);
});

const params = (id: string) => Promise.resolve({ id });

describe('POST /api/tournaments/[id]/join', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(401);
  });

  it('returns 404 when tournament not found', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue(null);
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(404);
  });

  it('returns 400 when tournament is not in registration', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'in_progress', maxPlayers: 8, isPublic: true,
      requiresDiscord: false, type: 'simulator', allowedLeagues: [],
      _count: { participants: 4 },
    });
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(400);
  });

  it('returns 400 when tournament is full', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', maxPlayers: 8, isPublic: true,
      requiresDiscord: false, type: 'simulator', allowedLeagues: [],
      _count: { participants: 8 },
    });
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/full/i);
  });

  it('returns 403 when private tournament has wrong joinCode', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', maxPlayers: 8, isPublic: false,
      joinCode: 'CORRECT', requiresDiscord: false, type: 'simulator', allowedLeagues: [],
      _count: { participants: 4 },
    });
    const res = await joinPOST(makeRequest({ joinCode: 'WRONG' }) as never, { params: params('t1') });
    expect(res.status).toBe(403);
  });

  it('returns 403 when requiresDiscord and user has no discordId', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', maxPlayers: 8, isPublic: true,
      requiresDiscord: true, type: 'simulator', allowedLeagues: [],
      _count: { participants: 4 },
    });
    p.user.findUnique.mockResolvedValue({ username: 'P1', discordId: null, elo: 1000, gameBanned: false, gameBanUntil: null });
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/discord/i);
  });

  it('returns 403 when user is gameBanned and ban not expired', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', maxPlayers: 8, isPublic: true,
      requiresDiscord: false, type: 'simulator', allowedLeagues: [],
      _count: { participants: 4 },
    });
    const future = new Date(Date.now() + 86_400_000);
    p.user.findUnique.mockResolvedValue({
      username: 'P1', discordId: 'd1', elo: 1000, gameBanned: true, gameBanUntil: future,
    });
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(403);
  });

  it('returns 403 when user has tournament-type UserBan', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', maxPlayers: 8, isPublic: true,
      requiresDiscord: false, type: 'simulator', allowedLeagues: [],
      _count: { participants: 4 },
    });
    p.user.findUnique.mockResolvedValue({ username: 'P1', discordId: 'd1', elo: 1000, gameBanned: false, gameBanUntil: null });
    p.userBan.findFirst.mockResolvedValue({ id: 'ban1', type: 'tournament', permanent: true });
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/banned from tournaments/i);
  });

  it('returns 400 when already joined', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', maxPlayers: 8, isPublic: true,
      requiresDiscord: false, type: 'simulator', allowedLeagues: [],
      _count: { participants: 4 },
    });
    p.user.findUnique.mockResolvedValue({ username: 'P1', discordId: 'd1', elo: 1000, gameBanned: false, gameBanUntil: null });
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'existing' });
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already joined/i);
  });

  it('compensating-action: rolls back when count exceeds maxPlayers post-create', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', maxPlayers: 4, isPublic: true,
      requiresDiscord: false, type: 'simulator', allowedLeagues: [],
      _count: { participants: 3 },
    });
    p.user.findUnique.mockResolvedValue({ username: 'P1', discordId: 'd1', elo: 1000, gameBanned: false, gameBanUntil: null });
    p.tournamentParticipant.create.mockResolvedValue({ id: 'newPart' });
    p.tournamentParticipant.count.mockResolvedValue(5);
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.delete).toHaveBeenCalledWith({ where: { id: 'newPart' } });
  });

  it('happy path: creates participant + emits refresh event when capacity is fine', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', maxPlayers: 8, isPublic: true,
      requiresDiscord: false, type: 'simulator', allowedLeagues: [],
      _count: { participants: 4 },
    });
    p.user.findUnique.mockResolvedValue({ username: 'P1', discordId: 'd1', elo: 1000, gameBanned: false, gameBanUntil: null });
    p.tournamentParticipant.count.mockResolvedValue(5);
    p.tournament.findUnique.mockImplementation(async (args: { select?: object }) => {
      if (args.select) return { status: 'registration' };
      return {
        id: 't1', status: 'registration', maxPlayers: 8, isPublic: true,
        requiresDiscord: false, type: 'simulator', allowedLeagues: [],
        _count: { participants: 4 },
      };
    });
    const res = await joinPOST(makeRequest({}) as never, { params: params('t1') });
    expect(res.status).toBe(201);
    expect(p.tournamentParticipant.create).toHaveBeenCalled();
    expect(p.tournamentParticipant.delete).not.toHaveBeenCalled();
  });
});
