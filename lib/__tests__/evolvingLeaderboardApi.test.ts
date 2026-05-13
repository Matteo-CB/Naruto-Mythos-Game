import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('@/lib/tournament/leagueUtils', () => ({
  LEAGUE_TIERS: [],
}));

import { prisma } from '@/lib/db/prisma';
import { GET as GetLeaderboard } from '../../app/api/leaderboard/route';

const p = prisma as unknown as {
  user: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

function makeReq(qs = ''): Request {
  return new Request(`http://localhost/api/leaderboard${qs}`);
}

beforeEach(() => {
  p.user.findMany.mockReset();
  p.user.count.mockReset();
  p.user.count.mockResolvedValue(0);
});

describe('Phase 9 — leaderboard ?type=evolving', () => {
  it('without ?type, sorts by main elo desc', async () => {
    p.user.findMany.mockResolvedValue([]);
    await GetLeaderboard(makeReq('') as never);
    const call = p.user.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ elo: 'desc' });
  });

  it('with ?type=evolving, sorts by evolvingElo desc', async () => {
    p.user.findMany.mockResolvedValue([]);
    await GetLeaderboard(makeReq('?type=evolving') as never);
    const call = p.user.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ evolvingElo: 'desc' });
  });

  it('selects evolvingElo field in addition to elo', async () => {
    p.user.findMany.mockResolvedValue([]);
    await GetLeaderboard(makeReq('?type=evolving') as never);
    const call = p.user.findMany.mock.calls[0][0];
    expect(call.select.evolvingElo).toBe(true);
    expect(call.select.elo).toBe(true);
  });

  it('returns type in payload (default ranked)', async () => {
    p.user.findMany.mockResolvedValue([]);
    const res = await GetLeaderboard(makeReq('') as never);
    const body = await res.json();
    expect(body.type).toBe('ranked');
  });

  it('returns type="evolving" in payload when requested', async () => {
    p.user.findMany.mockResolvedValue([]);
    const res = await GetLeaderboard(makeReq('?type=evolving') as never);
    const body = await res.json();
    expect(body.type).toBe('evolving');
  });

  it('ignores league filter when type=evolving (Evolving has no leagues)', async () => {
    p.user.findMany.mockResolvedValue([]);
    await GetLeaderboard(makeReq('?type=evolving&league=academyStudent') as never);
    const call = p.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({});
  });

  it('honors league filter when type is ranked (default)', async () => {
    p.user.findMany.mockResolvedValue([]);
    await GetLeaderboard(makeReq('?league=unranked') as never);
    const call = p.user.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ elo: 'desc' });
  });

  it('?type=evolving with invalid value falls back to ranked', async () => {
    p.user.findMany.mockResolvedValue([]);
    await GetLeaderboard(makeReq('?type=foo') as never);
    const call = p.user.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ elo: 'desc' });
  });

  it('returns evolvingElo in user records when type=evolving', async () => {
    p.user.findMany.mockResolvedValue([
      { id: 'u1', username: 'Alice', elo: 800, evolvingElo: 650, wins: 5, losses: 3, draws: 0, role: 'user', badgePrefs: [], consecutiveWins: 0, consecutiveLosses: 0, tournamentWins: 0 },
    ]);
    const res = await GetLeaderboard(makeReq('?type=evolving') as never);
    const body = await res.json();
    expect(body.users[0].evolvingElo).toBe(650);
    expect(body.users[0].elo).toBe(800);
  });
});
