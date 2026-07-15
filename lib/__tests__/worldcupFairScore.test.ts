import { describe, it, expect } from 'vitest';
import { fairScore, buildCountryStandings, FAIR_PRIOR_GAMES, TOP_PLAYERS_CAP, type CountryUser } from '@/lib/worldcup/fairScore';
import { extractFactionCounts } from '@/lib/cards/gameStatsCompute';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard } from '@/lib/engine/types';

describe('fairScore', () => {
  it('returns 0.5 with no games', () => {
    expect(fairScore(0, 0)).toBe(0.5);
  });

  it('shrinks small samples toward 50%', () => {
    expect(fairScore(9, 10)).toBeCloseTo((9 + FAIR_PRIOR_GAMES * 0.5) / (10 + FAIR_PRIOR_GAMES));
    expect(fairScore(9, 10)).toBeLessThan(0.9);
    expect(fairScore(9, 10)).toBeGreaterThan(0.5);
  });

  it('a 2-0 country does not outrank a steady 60% country with volume', () => {
    expect(fairScore(2, 2)).toBeLessThan(fairScore(60, 100));
  });

  it('a truly dominant small country can still outrank a mediocre big one', () => {
    expect(fairScore(18, 20)).toBeGreaterThan(fairScore(260, 500));
  });
});

describe('buildCountryStandings', () => {
  const users = new Map<string, CountryUser>([
    ['u1', { username: 'Alice', elo: 1200, countryCode: 'fr' }],
    ['u2', { username: 'Bob', elo: 1000, countryCode: 'fr' }],
    ['u3', { username: 'Carol', elo: 1400, countryCode: 'jp' }],
    ['u4', { username: 'Dave', elo: 900, countryCode: null }],
  ]);

  const results = [
    { userId: 'u1', result: 'win' },
    { userId: 'u1', result: 'win' },
    { userId: 'u1', result: 'loss' },
    { userId: 'u2', result: 'loss' },
    { userId: 'u3', result: 'win' },
    { userId: 'u4', result: 'win' },
    { userId: 'missing', result: 'win' },
  ];

  it('aggregates per country and skips players without a flag', () => {
    const standings = buildCountryStandings(results, users);
    expect(standings).toHaveLength(2);
    const fr = standings.find((s) => s.countryCode === 'fr')!;
    expect(fr.players).toBe(2);
    expect(fr.games).toBe(4);
    expect(fr.wins).toBe(2);
    expect(fr.losses).toBe(2);
    expect(fr.winRate).toBeCloseTo(0.5);
    expect(fr.avgElo).toBe(1100);
    expect(fr.topPlayers[0].username).toBe('Alice');
    expect(fr.topPlayers[0].wins7d).toBe(2);
    expect(fr.topPlayers[0].games7d).toBe(3);
  });

  it('sorts by fair score first', () => {
    const standings = buildCountryStandings(results, users);
    const jp = standings.find((s) => s.countryCode === 'jp')!;
    const fr = standings.find((s) => s.countryCode === 'fr')!;
    expect(jp.score).toBeGreaterThan(fr.score);
    expect(standings[0].countryCode).toBe('jp');
  });

  it('caps top players per country', () => {
    const manyUsers = new Map<string, CountryUser>();
    const manyResults: Array<{ userId: string; result: string }> = [];
    for (let i = 0; i < TOP_PLAYERS_CAP + 4; i++) {
      manyUsers.set(`p${i}`, { username: `P${i}`, elo: 1000 + i, countryCode: 'de' });
      manyResults.push({ userId: `p${i}`, result: 'win' });
    }
    const standings = buildCountryStandings(manyResults, manyUsers);
    expect(standings[0].players).toBe(TOP_PLAYERS_CAP + 4);
    expect(standings[0].topPlayers).toHaveLength(TOP_PLAYERS_CAP);
    expect(standings[0].topPlayers[0].elo).toBe(1000 + TOP_PLAYERS_CAP + 3);
  });
});

describe('extractFactionCounts', () => {
  it('counts deck cards by faction group', () => {
    const a = getCardById('KS-001-C') as CharacterCard;
    const b = getCardById('KS-104-R') as CharacterCard;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    const payload = {
      initialState: {
        player1: { deck: [a, a, b], hand: [a] },
        player2: { deck: [b] },
      },
    };
    const counts = extractFactionCounts(payload, 'player1');
    expect(counts.get(a.group as string)).toBeGreaterThanOrEqual(3);
    const p2 = extractFactionCounts(payload, 'player2');
    expect(p2.get(b.group as string)).toBe(1);
  });

  it('returns empty for a missing side', () => {
    expect(extractFactionCounts({}, 'player1').size).toBe(0);
  });
});
