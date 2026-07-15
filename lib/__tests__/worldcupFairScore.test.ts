import { describe, it, expect } from 'vitest';
import {
  playerFairScore,
  countryFairScore,
  buildCountryStandings,
  PLAYER_PRIOR_GAMES,
  MIN_RANKED_PLAYERS,
  TOP_PLAYERS_CAP,
  WORLDCUP_MIN_ELO,
  type CountryUser,
} from '@/lib/worldcup/fairScore';
import { extractFactionCounts } from '@/lib/cards/gameStatsCompute';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard } from '@/lib/engine/types';

describe('playerFairScore', () => {
  it('shrinks small samples toward 50%', () => {
    expect(playerFairScore(9, 10)).toBeCloseTo((9 + PLAYER_PRIOR_GAMES * 0.5) / (10 + PLAYER_PRIOR_GAMES));
    expect(playerFairScore(9, 10)).toBeLessThan(0.9);
    expect(playerFairScore(9, 10)).toBeGreaterThan(0.5);
  });
});

describe('countryFairScore', () => {
  it('pulls a country with few players strongly toward 50%', () => {
    expect(countryFairScore([0.9])).toBeLessThan(0.6);
    expect(countryFairScore([0.9])).toBeGreaterThan(0.5);
  });

  it('the phantom-player dilution fades as real players accumulate', () => {
    expect(countryFairScore(Array(2).fill(0.7))).toBeLessThan(countryFairScore(Array(6).fill(0.7)));
    expect(countryFairScore(Array(6).fill(0.7))).toBeLessThan(countryFairScore(Array(20).fill(0.7)));
  });
});

function makeCountry(
  users: Map<string, CountryUser>,
  results: Array<{ userId: string; result: string }>,
  cc: string,
  playerCount: number,
  winsPer: number,
  lossesPer: number,
): void {
  for (let i = 0; i < playerCount; i++) {
    const id = `${cc}${i}`;
    users.set(id, { username: `${cc}_${i}`, elo: 1300 + i, countryCode: cc });
    for (let w = 0; w < winsPer; w++) results.push({ userId: id, result: 'win' });
    for (let l = 0; l < lossesPer; l++) results.push({ userId: id, result: 'loss' });
  }
}

describe('buildCountryStandings', () => {
  it('a one-player country is not ranked and sorts below ranked countries', () => {
    const users = new Map<string, CountryUser>();
    const results: Array<{ userId: string; result: string }> = [];
    makeCountry(users, results, 'ps', 1, 30, 5);
    makeCountry(users, results, 'it', 12, 15, 10);
    const standings = buildCountryStandings(results, users);
    const ps = standings.find((s) => s.countryCode === 'ps')!;
    const it = standings.find((s) => s.countryCode === 'it')!;
    expect(ps.ranked).toBe(false);
    expect(it.ranked).toBe(true);
    expect(standings[0].countryCode).toBe('it');
    expect(standings[standings.length - 1].countryCode).toBe('ps');
  });

  it('requires MIN_RANKED_PLAYERS active players to be ranked', () => {
    const users = new Map<string, CountryUser>();
    const results: Array<{ userId: string; result: string }> = [];
    makeCountry(users, results, 'de', MIN_RANKED_PLAYERS, 3, 3);
    makeCountry(users, results, 'be', MIN_RANKED_PLAYERS - 1, 3, 3);
    const standings = buildCountryStandings(results, users);
    expect(standings.find((s) => s.countryCode === 'de')!.ranked).toBe(true);
    expect(standings.find((s) => s.countryCode === 'be')!.ranked).toBe(false);
  });

  it('aggregates games, wins, losses and averages per country', () => {
    const users = new Map<string, CountryUser>([
      ['u1', { username: 'Alice', elo: 1400, countryCode: 'fr' }],
      ['u2', { username: 'Bob', elo: 1250, countryCode: 'fr' }],
      ['u3', { username: 'Dave', elo: 1900, countryCode: null }],
    ]);
    const results = [
      { userId: 'u1', result: 'win' },
      { userId: 'u1', result: 'win' },
      { userId: 'u1', result: 'loss' },
      { userId: 'u2', result: 'loss' },
      { userId: 'u3', result: 'win' },
      { userId: 'missing', result: 'win' },
    ];
    const standings = buildCountryStandings(results, users);
    expect(standings).toHaveLength(1);
    const fr = standings[0];
    expect(fr.players).toBe(2);
    expect(fr.games).toBe(4);
    expect(fr.wins).toBe(2);
    expect(fr.losses).toBe(2);
    expect(fr.winRate).toBeCloseTo(0.5);
    expect(fr.avgElo).toBe(1325);
    expect(fr.topPlayers[0].username).toBe('Alice');
    expect(fr.topPlayers[0].wins7d).toBe(2);
    expect(fr.topPlayers[0].games7d).toBe(3);
  });

  it('caps top players per country', () => {
    const users = new Map<string, CountryUser>();
    const results: Array<{ userId: string; result: string }> = [];
    makeCountry(users, results, 'jp', TOP_PLAYERS_CAP + 4, 1, 0);
    const standings = buildCountryStandings(results, users);
    expect(standings[0].players).toBe(TOP_PLAYERS_CAP + 4);
    expect(standings[0].topPlayers).toHaveLength(TOP_PLAYERS_CAP);
    expect(standings[0].topPlayers[0].elo).toBe(1300 + TOP_PLAYERS_CAP + 3);
  });
});

describe('legendary sannin gate', () => {
  it('players below the Legendary Sannin ELO never count for their country', () => {
    const users = new Map<string, CountryUser>();
    const results: Array<{ userId: string; result: string }> = [];
    makeCountry(users, results, 'br', MIN_RANKED_PLAYERS + 2, 10, 2);
    for (let i = 0; i < MIN_RANKED_PLAYERS + 2; i++) {
      users.set(`low${i}`, { username: `Low${i}`, elo: WORLDCUP_MIN_ELO - 1, countryCode: 'ca' });
      results.push({ userId: `low${i}`, result: 'win' });
    }
    users.set('mix', { username: 'Mix', elo: WORLDCUP_MIN_ELO - 50, countryCode: 'br' });
    results.push({ userId: 'mix', result: 'win' });
    const standings = buildCountryStandings(results, users);
    expect(standings.find((s) => s.countryCode === 'ca')).toBeUndefined();
    const br = standings.find((s) => s.countryCode === 'br')!;
    expect(br.players).toBe(MIN_RANKED_PLAYERS + 2);
    expect(br.topPlayers.every((p) => p.username !== 'Mix')).toBe(true);
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
