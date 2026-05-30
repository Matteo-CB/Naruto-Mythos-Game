import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import {
  extractPlayerResults,
  groupPlayersForSearch,
  aggregatePlayerStats,
  type PlayerResultRow,
} from '@/lib/topdeck/players';

const baseInput = {
  tid: 't1',
  name: 'Cup 1',
  game: 'Magic: The Gathering',
  format: 'EDH',
  startDate: new Date(1000),
};

describe('extractPlayerResults', () => {
  it('maps standings to rows, prefers id as key, dedupes per tournament', () => {
    const rows = extractPlayerResults({
      ...baseInput,
      standings: [
        { name: 'Alice', id: 'a', standing: 1, points: 9, winRate: 0.8 },
        { name: 'Bob', id: 'b', standing: 2, points: 6, winRate: 0.6 },
        { name: 'Alice dup', id: 'a', standing: 99 },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ playerKey: 'a', playerName: 'Alice', playerId: 'a', standing: 1, points: 9, winRate: 0.8, tid: 't1', game: 'Magic: The Gathering' });
  });

  it('falls back to name as key when id is missing, and nulls bad fields', () => {
    const rows = extractPlayerResults({ ...baseInput, standings: [{ name: 'Carl', standing: null, points: 'x' }] });
    expect(rows[0]).toMatchObject({ playerKey: 'Carl', playerId: null, standing: null, points: null });
  });

  it('returns [] for non-array or empty standings', () => {
    expect(extractPlayerResults({ ...baseInput, standings: null })).toEqual([]);
    expect(extractPlayerResults({ ...baseInput, standings: [{ standing: 1 }] })).toEqual([]);
  });
});

function row(partial: Partial<PlayerResultRow>): PlayerResultRow {
  return {
    playerKey: 'a', playerName: 'Alice', playerId: 'a', tid: 't', tournamentName: 'T',
    game: 'MTG', format: 'EDH', startDate: new Date(1000), standing: null, points: null, winRate: null,
    ...partial,
  };
}

describe('groupPlayersForSearch', () => {
  it('groups by playerKey, counts tournaments, keeps the most recent name, sorts by count', () => {
    const groups = groupPlayersForSearch([
      row({ playerKey: 'a', playerName: 'Alice', startDate: new Date(1000), tid: 't1' }),
      row({ playerKey: 'a', playerName: 'Alice New', startDate: new Date(5000), tid: 't2' }),
      row({ playerKey: 'b', playerName: 'Bob', tid: 't3' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ playerKey: 'a', playerName: 'Alice New', playerId: 'a', tournamentsPlayed: 2 });
    expect(groups[1].playerKey).toBe('b');
  });
});

describe('aggregatePlayerStats', () => {
  it('computes best finish, wins, top8s, avg win rate over non-null, deduped games', () => {
    const stats = aggregatePlayerStats([
      row({ standing: 1, winRate: 0.8, game: 'MTG' }),
      row({ standing: 5, winRate: 0.6, game: 'MTG' }),
      row({ standing: 12, winRate: null, game: 'Pokemon' }),
    ])!;
    expect(stats.tournamentsPlayed).toBe(3);
    expect(stats.bestFinish).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.top8s).toBe(2);
    expect(stats.avgWinRate).toBeCloseTo(0.7);
    expect(stats.games.sort()).toEqual(['MTG', 'Pokemon']);
  });

  it('handles all-null placements and returns null for empty input', () => {
    const stats = aggregatePlayerStats([row({ standing: null, winRate: null })])!;
    expect(stats.bestFinish).toBeNull();
    expect(stats.wins).toBe(0);
    expect(stats.avgWinRate).toBeNull();
    expect(aggregatePlayerStats([])).toBeNull();
  });
});
