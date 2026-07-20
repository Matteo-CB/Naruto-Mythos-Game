import { describe, it, expect } from 'vitest';
import {
  parisWallToUtc,
  parisDateParts,
  pickDailyPrizeCardId,
  DAILY_TOURNAMENT_START_HOUR,
  DAILY_TOURNAMENT_REG_HOUR,
  DAILY_TOURNAMENT_MAX_PLAYERS,
} from '@/lib/tournament/dailyTournament';
import { TOURNAMENT_PRIZE_CARD_IDS } from '@/lib/variants/constants';

describe('parisWallToUtc (DST-safe)', () => {
  it('summer CEST (UTC+2): 21:00 Paris is 19:00 UTC', () => {
    expect(parisWallToUtc(2026, 7, 1, 21, 0).toISOString()).toBe('2026-07-01T19:00:00.000Z');
  });
  it('winter CET (UTC+1): 21:00 Paris is 20:00 UTC', () => {
    expect(parisWallToUtc(2026, 1, 15, 21, 0).toISOString()).toBe('2026-01-15T20:00:00.000Z');
  });
  it('midnight Paris maps to the correct UTC instant', () => {
    expect(parisWallToUtc(2026, 7, 1, 0, 0).toISOString()).toBe('2026-06-30T22:00:00.000Z');
  });
});

describe('parisDateParts', () => {
  it('reads the Paris wall-clock date and hour', () => {
    const parts = parisDateParts(new Date('2026-07-01T19:30:00.000Z'));
    expect(parts).toMatchObject({ year: 2026, month: 7, day: 1, hour: 21 });
  });
});

describe('pickDailyPrizeCardId', () => {
  it('always returns a valid tournament-winner card', () => {
    const pool = TOURNAMENT_PRIZE_CARD_IDS as readonly string[];
    for (let i = 0; i < 50; i++) expect(pool).toContain(pickDailyPrizeCardId());
  });
  it('is deterministic under a fixed rng', () => {
    expect(pickDailyPrizeCardId(() => 0)).toBe(TOURNAMENT_PRIZE_CARD_IDS[0]);
  });
});

describe('daily tournament config', () => {
  it('registration at 17h, start at 21h, 16 slots', () => {
    expect(DAILY_TOURNAMENT_REG_HOUR).toBe(17);
    expect(DAILY_TOURNAMENT_START_HOUR).toBe(21);
    expect(DAILY_TOURNAMENT_MAX_PLAYERS).toBe(16);
  });
});
