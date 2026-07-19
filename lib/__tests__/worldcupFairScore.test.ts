import { describe, it, expect } from 'vitest';
import {
  buildCountryStandings,
  TEAM_SIZE,
  MIN_RANKED_PLAYERS,
  WORLDCUP_MIN_ELO,
  type CountryUser,
} from '@/lib/worldcup/fairScore';
import { extractFactionCounts } from '@/lib/cards/gameStatsCompute';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard } from '@/lib/engine/types';

function makeCountry(
  users: Map<string, CountryUser>,
  results: Array<{ userId: string; result: string }>,
  cc: string,
  playerCount: number,
  winsPer: number,
  lossesPer: number,
  baseElo = 1300,
): void {
  for (let i = 0; i < playerCount; i++) {
    const id = `${cc}${i}`;
    users.set(id, { username: `${cc}_${i}`, elo: baseElo + i, countryCode: cc });
    for (let w = 0; w < winsPer; w++) results.push({ userId: id, result: 'win' });
    for (let l = 0; l < lossesPer; l++) results.push({ userId: id, result: 'loss' });
  }
}

describe('buildCountryStandings (top-6 team model)', () => {
  it('a country with fewer than a full team is not ranked and sorts below ranked countries', () => {
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

  it('needs a full team of eligible players to be ranked', () => {
    const users = new Map<string, CountryUser>();
    const results: Array<{ userId: string; result: string }> = [];
    makeCountry(users, results, 'de', MIN_RANKED_PLAYERS, 3, 3);
    makeCountry(users, results, 'be', MIN_RANKED_PLAYERS - 1, 3, 3);
    const standings = buildCountryStandings(results, users);
    expect(standings.find((s) => s.countryCode === 'de')!.ranked).toBe(true);
    expect(standings.find((s) => s.countryCode === 'be')!.ranked).toBe(false);
  });

  it('only the TEAM_SIZE best players (by ELO) count toward the country stats', () => {
    const users = new Map<string, CountryUser>();
    const results: Array<{ userId: string; result: string }> = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const id = `top${i}`;
      users.set(id, { username: `Top${i}`, elo: 2000 + i, countryCode: 'fr' });
      results.push({ userId: id, result: 'win' });
      results.push({ userId: id, result: 'win' });
    }
    const weakId = 'weak';
    users.set(weakId, { username: 'Weak', elo: 1300, countryCode: 'fr' });
    for (let l = 0; l < 20; l++) results.push({ userId: weakId, result: 'loss' });

    const standings = buildCountryStandings(results, users);
    const fr = standings.find((s) => s.countryCode === 'fr')!;
    expect(fr.players).toBe(TEAM_SIZE + 1);
    expect(fr.teamSize).toBe(TEAM_SIZE);
    expect(fr.games).toBe(TEAM_SIZE * 2);
    expect(fr.wins).toBe(TEAM_SIZE * 2);
    expect(fr.winRate).toBe(1);
    expect(fr.topPlayers.every((p) => p.username !== 'Weak')).toBe(true);
    expect(fr.topPlayers).toHaveLength(TEAM_SIZE);
  });

  it('ranks countries by their top team win rate', () => {
    const users = new Map<string, CountryUser>();
    const results: Array<{ userId: string; result: string }> = [];
    makeCountry(users, results, 'aa', TEAM_SIZE, 9, 1, 1500);
    makeCountry(users, results, 'bb', TEAM_SIZE, 5, 5, 1500);
    const standings = buildCountryStandings(results, users);
    expect(standings[0].countryCode).toBe('aa');
    expect(standings[0].winRate).toBeCloseTo(0.9);
    expect(standings[1].countryCode).toBe('bb');
    expect(standings[1].winRate).toBeCloseTo(0.5);
  });

  it('players below the Legendary Sannin ELO never count for their country', () => {
    const users = new Map<string, CountryUser>();
    const results: Array<{ userId: string; result: string }> = [];
    makeCountry(users, results, 'br', TEAM_SIZE, 10, 2);
    for (let i = 0; i < TEAM_SIZE; i++) {
      users.set(`low${i}`, { username: `Low${i}`, elo: WORLDCUP_MIN_ELO - 1, countryCode: 'ca' });
      results.push({ userId: `low${i}`, result: 'win' });
    }
    users.set('mix', { username: 'Mix', elo: WORLDCUP_MIN_ELO - 50, countryCode: 'br' });
    results.push({ userId: 'mix', result: 'win' });
    const standings = buildCountryStandings(results, users);
    expect(standings.find((s) => s.countryCode === 'ca')).toBeUndefined();
    const br = standings.find((s) => s.countryCode === 'br')!;
    expect(br.players).toBe(TEAM_SIZE);
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
