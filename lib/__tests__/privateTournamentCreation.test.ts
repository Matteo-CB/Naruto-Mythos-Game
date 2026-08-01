import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const count = vi.fn();
const create = vi.fn();
const userFindUnique = vi.fn();
const runCommandRaw = vi.fn();
const authMock = vi.fn();

vi.mock('@/lib/auth/authOptions', () => ({ auth: () => authMock() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournament: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      count: (...a: unknown[]) => count(...a),
      create: (...a: unknown[]) => create(...a),
      findMany: async () => [],
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $runCommandRaw: (...a: unknown[]) => runCommandRaw(...a),
  },
}));
vi.mock('@/lib/discord/tournamentCreatedWebhook', () => ({ sendTournamentCreated: async () => {} }));
vi.mock('@/lib/tournament/tournamentEngine', () => ({ generateJoinCode: () => 'CODE1234' }));
vi.mock('@/lib/tournament/leagueUtils', () => ({ validateLeagueKeys: () => true }));

import { POST, MAX_OPEN_TOURNAMENTS_PER_PLAYER } from '@/app/api/tournaments/route';

function request(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const baseBody = { name: 'My tournament', gameMode: 'classic', maxPlayers: 8, format: 'swiss' };

beforeEach(() => {
  findUnique.mockReset();
  count.mockReset().mockResolvedValue(0);
  create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 't1', ...data }));
  userFindUnique.mockReset().mockResolvedValue({ username: 'Player', role: 'player' });
  runCommandRaw.mockReset().mockResolvedValue({});
  authMock.mockReset().mockResolvedValue({ user: { id: 'u1', email: 'player@example.com', name: 'Player' } });
});

describe('any signed-in player can create a tournament, but only a private one', () => {
  it('lets a normal player create one', async () => {
    const res = await POST(request(baseBody));
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalled();
  });

  it('forces the tournament to be private even when the client asks for public', async () => {
    await POST(request({ ...baseBody, isPublic: true }));
    expect(create.mock.calls[0][0].data.isPublic).toBe(false);
  });

  it('always gives the private tournament a join code to share', async () => {
    await POST(request(baseBody));
    expect(create.mock.calls[0][0].data.joinCode).toBe('CODE1234');
  });

  it('refuses once the player already has too many tournaments open', async () => {
    count.mockResolvedValue(MAX_OPEN_TOURNAMENTS_PER_PLAYER);
    const res = await POST(request(baseBody));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.errorKey).toBe('tournament.error.tooManyOpenTournaments');
    expect(create).not.toHaveBeenCalled();
  });

  it('only counts the player own tournaments that are still open', async () => {
    await POST(request(baseBody));
    expect(count.mock.calls[0][0].where).toMatchObject({
      creatorId: 'u1',
      status: { in: ['registration', 'starting', 'in_progress'] },
    });
  });

  it('refuses an anonymous visitor', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(request(baseBody));
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('privileged creators keep the public option', () => {
  it('an admin can still create a public tournament', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin1', email: 'matteo.biyikli3224@gmail.com', name: 'Kutxyt' } });
    await POST(request({ ...baseBody, isPublic: true }));
    expect(create.mock.calls[0][0].data.isPublic).toBe(true);
  });

  it('an admin can still deliberately create a private one', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin1', email: 'matteo.biyikli3224@gmail.com', name: 'Kutxyt' } });
    await POST(request({ ...baseBody, isPublic: false }));
    expect(create.mock.calls[0][0].data.isPublic).toBe(false);
  });

  it('a tournament organizer can create a public tournament', async () => {
    userFindUnique.mockResolvedValue({ username: 'Org', role: 'tournament_organizer' });
    await POST(request({ ...baseBody, isPublic: true }));
    expect(create.mock.calls[0][0].data.isPublic).toBe(true);
  });

  it('a privileged creator is not limited by the open-tournament cap', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin1', email: 'matteo.biyikli3224@gmail.com', name: 'Kutxyt' } });
    count.mockResolvedValue(MAX_OPEN_TOURNAMENTS_PER_PLAYER + 10);
    const res = await POST(request(baseBody));
    expect(res.status).toBe(201);
  });
});

describe('a tournament created by a normal player never awards tournament prizes', () => {
  it('marks the tournament as not awarding prizes', async () => {
    await POST(request(baseBody));
    expect(create.mock.calls[0][0].data.awardsPrizes).toBe(false);
  });

  it('refuses to attach a tournament winner card to it', async () => {
    await POST(request({ ...baseBody, prizeCardId: 'KS-108-MV' }));
    expect(runCommandRaw).not.toHaveBeenCalled();
  });

  it('still creates the tournament when a winner card was requested, just without the prize', async () => {
    const res = await POST(request({ ...baseBody, prizeCardId: 'KS-108-MV' }));
    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.awardsPrizes).toBe(false);
  });

  it('lets an admin tournament award prizes and keep its winner card', async () => {
    authMock.mockResolvedValue({ user: { id: 'admin1', email: 'matteo.biyikli3224@gmail.com', name: 'Kutxyt' } });
    await POST(request({ ...baseBody, prizeCardId: 'KS-108-MV' }));
    expect(create.mock.calls[0][0].data.awardsPrizes).toBe(true);
    expect(runCommandRaw).toHaveBeenCalled();
  });

  it('lets a tournament organizer award prizes too', async () => {
    userFindUnique.mockResolvedValue({ username: 'Org', role: 'tournament_organizer' });
    await POST(request(baseBody));
    expect(create.mock.calls[0][0].data.awardsPrizes).toBe(true);
  });
});
