import { describe, it, expect } from 'vitest';
import {
  buildCountryStandings,
  computeCountryScore,
  TEAM_SIZE,
  WORLDCUP_MIN_ELO,
  MIN_PLAYER_GAMES,
  type CountryUser,
  type RankedResultRow,
} from '@/lib/worldcup/fairScore';
import { extractFactionCounts } from '@/lib/cards/gameStatsCompute';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard } from '@/lib/engine/types';

function pushGames(
  results: RankedResultRow[],
  userId: string,
  wins: number,
  losses: number,
  opponentElo = 1500,
  forfeitLosses = 0,
): void {
  for (let i = 0; i < wins; i++) results.push({ userId, result: 'win', opponentElo, isForfeit: false });
  for (let i = 0; i < losses - forfeitLosses; i++) results.push({ userId, result: 'loss', opponentElo, isForfeit: false });
  for (let i = 0; i < forfeitLosses; i++) results.push({ userId, result: 'loss', opponentElo, isForfeit: true });
}

function makeTeam(
  users: Map<string, CountryUser>,
  results: RankedResultRow[],
  cc: string,
  count: number,
  winsPer: number,
  lossesPer: number,
  baseElo = 1500,
  opponentElo = 1500,
): void {
  for (let i = 0; i < count; i++) {
    const id = `${cc}${i}`;
    users.set(id, { username: `${cc}_${i}`, elo: baseElo + i, countryCode: cc });
    pushGames(results, id, winsPer, lossesPer, opponentElo);
  }
}

describe('computeCountryScore', () => {
  it('a stronger opposition raises the score at equal win rate', () => {
    const weak = computeCountryScore({ games: 60, wins: 36, avgElo: 1500, avgOpponentEloOnWins: 1300, forfeitLosses: 0 });
    const strong = computeCountryScore({ games: 60, wins: 36, avgElo: 1500, avgOpponentEloOnWins: 2400, forfeitLosses: 0 });
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it('a higher team ELO raises the score at equal win rate', () => {
    const low = computeCountryScore({ games: 60, wins: 36, avgElo: 1400, avgOpponentEloOnWins: 1500, forfeitLosses: 0 });
    const high = computeCountryScore({ games: 60, wins: 36, avgElo: 2600, avgOpponentEloOnWins: 1500, forfeitLosses: 0 });
    expect(high.score).toBeGreaterThan(low.score);
  });

  it('forfeits lower the score', () => {
    const clean = computeCountryScore({ games: 100, wins: 60, avgElo: 1600, avgOpponentEloOnWins: 1600, forfeitLosses: 0 });
    const forfeiting = computeCountryScore({ games: 100, wins: 60, avgElo: 1600, avgOpponentEloOnWins: 1600, forfeitLosses: 20 });
    expect(forfeiting.score).toBeLessThan(clean.score);
  });

  it('win rate is the dominant component', () => {
    const winning = computeCountryScore({ games: 60, wins: 54, avgElo: 1400, avgOpponentEloOnWins: 1400, forfeitLosses: 0 });
    const losing = computeCountryScore({ games: 60, wins: 12, avgElo: 2800, avgOpponentEloOnWins: 2400, forfeitLosses: 0 });
    expect(winning.score).toBeGreaterThan(losing.score);
  });
});

describe('buildCountrystandings (team of 6, combined score)', () => {
  it('a country without a full team of eligible players is not ranked', () => {
    const users = new Map<string, CountryUser>();
    const results: RankedResultRow[] = [];
    makeTeam(users, results, 'de', TEAM_SIZE, MIN_PLAYER_GAMES, 0);
    makeTeam(users, results, 'be', TEAM_SIZE - 1, MIN_PLAYER_GAMES, 0);
    const standings = buildCountryStandings(results, users);
    expect(standings.find((s) => s.countryCode === 'de')!.ranked).toBe(true);
    expect(standings.find((s) => s.countryCode === 'be')!.ranked).toBe(false);
  });

  it('a player under the minimum games does not count in the team', () => {
    const users = new Map<string, CountryUser>();
    const results: RankedResultRow[] = [];
    makeTeam(users, results, 'fr', TEAM_SIZE, MIN_PLAYER_GAMES, 0);
    users.set('lazy', { username: 'Lazy', elo: 5000, countryCode: 'fr' });
    pushGames(results, 'lazy', MIN_PLAYER_GAMES - 1, 0);
    const standings = buildCountryStandings(results, users);
    const fr = standings.find((s) => s.countryCode === 'fr')!;
    expect(fr.players).toBe(TEAM_SIZE);
    expect(fr.topPlayers.every((p) => p.username !== 'Lazy')).toBe(true);
  });

  it('only the TEAM_SIZE highest-ELO eligible players form the team', () => {
    const users = new Map<string, CountryUser>();
    const results: RankedResultRow[] = [];
    makeTeam(users, results, 'jp', TEAM_SIZE + 3, MIN_PLAYER_GAMES, 2, 1500);
    const standings = buildCountryStandings(results, users);
    const jp = standings.find((s) => s.countryCode === 'jp')!;
    expect(jp.players).toBe(TEAM_SIZE + 3);
    expect(jp.teamSize).toBe(TEAM_SIZE);
    expect(jp.topPlayers).toHaveLength(TEAM_SIZE);
    expect(jp.topPlayers[0].elo).toBe(1500 + (TEAM_SIZE + 3) - 1);
  });

  it('players below Legendary Sannin ELO never count', () => {
    const users = new Map<string, CountryUser>();
    const results: RankedResultRow[] = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      users.set(`low${i}`, { username: `Low${i}`, elo: WORLDCUP_MIN_ELO - 1, countryCode: 'ca' });
      pushGames(results, `low${i}`, MIN_PLAYER_GAMES, 0);
    }
    const standings = buildCountryStandings(results, users);
    expect(standings.find((s) => s.countryCode === 'ca')).toBeUndefined();
  });

  it('ranks a higher combined score first', () => {
    const users = new Map<string, CountryUser>();
    const results: RankedResultRow[] = [];
    makeTeam(users, results, 'aa', TEAM_SIZE, 9, 1, 1600, 1600);
    makeTeam(users, results, 'bb', TEAM_SIZE, 5, 5, 1600, 1600);
    const standings = buildCountryStandings(results, users);
    expect(standings[0].countryCode).toBe('aa');
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
