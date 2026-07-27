import { describe, it, expect } from 'vitest';
import {
  buildDayRange,
  deckSignature,
  emptyPlayStats,
  fillMissingDays,
  playStatsDayKey,
  shiftDayKey,
  summarizePeriod,
  type DailyPlayRow,
} from '@/lib/stats/dailyPlay';

describe('day keys', () => {
  it('formats a date as an UTC day key', () => {
    expect(playStatsDayKey(new Date('2026-07-27T22:41:00.000Z'))).toBe('2026-07-27');
  });

  it('shifts across a month boundary', () => {
    expect(shiftDayKey('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftDayKey('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('builds an inclusive ascending range ending today', () => {
    expect(buildDayRange('2026-07-27', 3)).toEqual(['2026-07-25', '2026-07-26', '2026-07-27']);
  });
});

describe('deckSignature', () => {
  it('is stable regardless of card order', () => {
    expect(deckSignature(['a', 'b', 'c'])).toBe(deckSignature(['c', 'a', 'b']));
  });

  it('differs for a different card list', () => {
    expect(deckSignature(['a', 'b', 'c'])).not.toBe(deckSignature(['a', 'b', 'd']));
  });

  it('counts duplicates as part of the deck identity', () => {
    expect(deckSignature(['a', 'a', 'b'])).not.toBe(deckSignature(['a', 'b']));
  });

  it('returns null for an empty or unusable list', () => {
    expect(deckSignature([])).toBeNull();
    expect(deckSignature(['', ''])).toBeNull();
  });
});

describe('fillMissingDays', () => {
  it('pads days with no games so the chart never has holes', () => {
    const rows: DailyPlayRow[] = [{ day: '2026-07-27', games: 4, evolving: 1, players: 5, decks: 3 }];
    const filled = fillMissingDays(rows, '2026-07-27', 3);
    expect(filled.map((r) => r.day)).toEqual(['2026-07-25', '2026-07-26', '2026-07-27']);
    expect(filled[0]).toEqual({ day: '2026-07-25', games: 0, evolving: 0, players: 0, decks: 0 });
    expect(filled[2].games).toBe(4);
  });

  it('ignores stored days outside the requested window', () => {
    const rows: DailyPlayRow[] = [{ day: '2026-01-01', games: 99, evolving: 0, players: 9, decks: 9 }];
    const filled = fillMissingDays(rows, '2026-07-27', 2);
    expect(filled.every((r) => r.games === 0)).toBe(true);
  });
});

describe('summarizePeriod', () => {
  const rows: DailyPlayRow[] = [
    { day: '2026-07-25', games: 0, evolving: 0, players: 0, decks: 0 },
    { day: '2026-07-26', games: 10, evolving: 2, players: 6, decks: 5 },
    { day: '2026-07-27', games: 4, evolving: 1, players: 3, decks: 3 },
  ];

  it('totals games and evolving games over the window', () => {
    const s = summarizePeriod(rows, 8, 7, 3);
    expect(s.games).toBe(14);
    expect(s.evolving).toBe(3);
  });

  it('takes unique players and decks from the caller rather than summing days', () => {
    const s = summarizePeriod(rows, 8, 7, 3);
    expect(s.players).toBe(8);
    expect(s.decks).toBe(7);
  });

  it('averages over every day of the window, not only active ones', () => {
    const s = summarizePeriod(rows, 8, 7, 3);
    expect(s.averagePerDay).toBeCloseTo(4.7, 1);
    expect(s.activeDays).toBe(2);
    expect(s.days).toBe(3);
  });

  it('reports the busiest day', () => {
    expect(summarizePeriod(rows, 8, 7, 3).busiestDay).toEqual({ day: '2026-07-26', games: 10 });
  });

  it('has no busiest day when nothing was played', () => {
    const quiet = rows.map((r) => ({ ...r, games: 0 }));
    const s = summarizePeriod(quiet, 0, 0, 3);
    expect(s.busiestDay).toBeNull();
    expect(s.averagePerDay).toBe(0);
    expect(s.activeDays).toBe(0);
  });
});

describe('emptyPlayStats', () => {
  it('returns a full zeroed week so the window still renders', () => {
    const payload = emptyPlayStats('2026-07-27', '2026-07-27T00:00:00.000Z');
    expect(payload.series).toHaveLength(7);
    expect(payload.week.games).toBe(0);
    expect(payload.month.days).toBe(30);
    expect(payload.today).toBeNull();
  });
});
