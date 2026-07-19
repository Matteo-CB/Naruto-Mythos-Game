import { describe, it, expect } from 'vitest';
import {
  seasonBoundsForDate,
  previousSeasonBounds,
  isSeasonFinished,
  englishMonthLabel,
  championRoleName,
  nationalTeamRoleName,
} from '@/lib/worldcup/season';
import { planPodium } from '@/lib/worldcup/finalize';
import type { CountryStanding } from '@/lib/worldcup/fairScore';

describe('season bounds (quarterly)', () => {
  it('maps a date to its calendar quarter', () => {
    const s = seasonBoundsForDate(new Date('2026-08-15T12:00:00Z'));
    expect(s.seasonKey).toBe('2026-Q3');
    expect(s.startMonth).toBe('2026-07');
    expect(s.endMonth).toBe('2026-09');
    expect(s.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(s.endExclusive.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('handles Q1 and Q4 edges', () => {
    expect(seasonBoundsForDate(new Date('2026-01-01T00:00:00Z')).seasonKey).toBe('2026-Q1');
    expect(seasonBoundsForDate(new Date('2026-12-31T23:59:59Z')).seasonKey).toBe('2026-Q4');
  });

  it('previousSeasonBounds crosses the year boundary', () => {
    const prev = previousSeasonBounds(new Date('2026-02-10T00:00:00Z'));
    expect(prev.seasonKey).toBe('2025-Q4');
    expect(prev.endMonth).toBe('2025-12');
  });

  it('isSeasonFinished is true only past the end', () => {
    const s = seasonBoundsForDate(new Date('2026-08-15T00:00:00Z'));
    expect(isSeasonFinished(s, new Date('2026-09-30T23:00:00Z'))).toBe(false);
    expect(isSeasonFinished(s, new Date('2026-10-01T00:00:01Z'))).toBe(true);
  });
});

describe('discord names are English', () => {
  it('formats month labels and role names in English', () => {
    expect(englishMonthLabel('2026-09')).toBe('September 2026');
    expect(championRoleName('2026-09')).toBe('World Champion September 2026');
    expect(nationalTeamRoleName('fr')).toBe('National Team FR');
  });
});

function standing(code: string, ranked: boolean, score: number, players: string[]): CountryStanding {
  return {
    countryCode: code,
    ranked,
    players: players.length,
    teamSize: players.length,
    games: 60,
    wins: 40,
    losses: 20,
    winRate: 0.66,
    avgElo: 1800,
    avgOpponentElo: 1700,
    forfeitLosses: 0,
    score,
    breakdown: { winRate: 0.66, strengthFactor: 0.5, eloFactor: 0.5, activityFactor: 0.5, forfeitRate: 0 },
    topPlayers: players.map((u, i) => ({ userId: `${code}-${i}`, username: u, elo: 1800, wins: 7, games: 10 })),
  };
}

describe('planPodium', () => {
  it('takes the top 3 ranked countries with their players', () => {
    const standings = [
      standing('fr', true, 80, ['A', 'B']),
      standing('es', true, 70, ['C']),
      standing('it', true, 60, ['D']),
      standing('de', true, 50, ['E']),
      standing('br', false, 95, ['F']),
    ];
    const podium = planPodium(standings);
    expect(podium.map((p) => p.countryCode)).toEqual(['fr', 'es', 'it']);
    expect(podium[0].rank).toBe(1);
    expect(podium[0].players.map((p) => p.username)).toEqual(['A', 'B']);
    expect(podium[0].players[0].userId).toBe('fr-0');
  });

  it('ignores not-ranked countries even with a higher score', () => {
    const podium = planPodium([standing('br', false, 99, ['X']), standing('fr', true, 40, ['Y'])]);
    expect(podium.map((p) => p.countryCode)).toEqual(['fr']);
  });
});
