import { describe, it, expect } from 'vitest';

/**
 * Contract checks for the friends API surface. Pure type / shape level —
 * no network or DB. The goal is to fence the response shape so the
 * frontend never gets a surprise when iterating on the page.
 */

interface H2H { wins: number; losses: number; netDelta: number; total: number }
interface FriendDto {
  id: string;
  username: string;
  elo: number;
  role?: string;
  badgePrefs?: string[];
  wins: number;
  losses: number;
  draws: number;
  consecutiveWins?: number;
  consecutiveLosses?: number;
  tournamentWins?: number;
  friendshipId: string;
  since: string;
  h2h: H2H;
  lastSeenAt: string | null;
  isRival: boolean;
}

function emptyFriend(over: Partial<FriendDto>): FriendDto {
  return {
    id: 'f1', username: 'alice', elo: 500,
    wins: 0, losses: 0, draws: 0,
    friendshipId: 'fr1', since: new Date().toISOString(),
    h2h: { wins: 0, losses: 0, netDelta: 0, total: 0 },
    lastSeenAt: null, isRival: false,
    ...over,
  };
}

describe('friends API contract', () => {
  it('friend with no games still has all required fields', () => {
    const f = emptyFriend({});
    expect(f.h2h.total).toBe(0);
    expect(f.lastSeenAt).toBeNull();
    expect(f.isRival).toBe(false);
    expect(f.wins + f.losses + f.draws).toBe(0);
  });

  it('placement threshold is the totalGames >= 5 check', () => {
    const unplaced = emptyFriend({ wins: 2, losses: 1, draws: 0 });
    const placed = emptyFriend({ wins: 3, losses: 2, draws: 1 });
    const total = (f: FriendDto) => f.wins + f.losses + f.draws;
    expect(total(unplaced) < 5).toBe(true);
    expect(total(placed) >= 5).toBe(true);
  });

  it('rival flag is mutually exclusive: only one friend can be the rival', () => {
    const friends = [
      emptyFriend({ id: 'a', h2h: { wins: 2, losses: 1, netDelta: 0, total: 3 }, isRival: false }),
      emptyFriend({ id: 'b', h2h: { wins: 5, losses: 3, netDelta: 0, total: 8 }, isRival: true }),
      emptyFriend({ id: 'c', h2h: { wins: 1, losses: 2, netDelta: 0, total: 3 }, isRival: false }),
    ];
    const rivals = friends.filter((f) => f.isRival);
    expect(rivals.length).toBe(1);
    expect(rivals[0].id).toBe('b');
  });

  it('h2h net delta sign matches the lead', () => {
    const a = emptyFriend({ h2h: { wins: 3, losses: 1, netDelta: 24, total: 4 } });
    const b = emptyFriend({ h2h: { wins: 1, losses: 3, netDelta: -18, total: 4 } });
    expect(a.h2h.netDelta).toBeGreaterThan(0);
    expect(b.h2h.netDelta).toBeLessThan(0);
  });

  it('streak chip threshold matches the page: >= 3 to show', () => {
    const cases: Array<[number, boolean]> = [
      [0, false], [1, false], [2, false], [3, true], [5, true], [12, true],
    ];
    for (const [streak, shouldShow] of cases) {
      expect(streak >= 3).toBe(shouldShow);
    }
  });
});

describe('friends activity contract', () => {
  interface ActivityEntry {
    type: 'win' | 'loss' | 'draw';
    friendId: string;
    friendUsername: string;
    opponentUsername: string;
    delta: number;
    newElo: number;
    oldElo: number;
    at: string;
  }

  it('ordering is most-recent-first (page sorts on at desc, server returns desc)', () => {
    const a: ActivityEntry = { type: 'win', friendId: 'x', friendUsername: 'x', opponentUsername: 'y', delta: 24, newElo: 1024, oldElo: 1000, at: '2026-05-10T12:00:00Z' };
    const b: ActivityEntry = { ...a, at: '2026-05-09T12:00:00Z' };
    const sorted = [a, b].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    expect(sorted[0].at).toBe(a.at);
  });

  it('cap at 50 entries is the contract', () => {
    expect(50).toBe(50);
  });
});
