export const DAILY_PLAY_RETENTION_DAYS = 60;

export interface DailyPlayRow {
  day: string;
  games: number;
  evolving: number;
  players: number;
  decks: number;
}

export interface PlayStatsPeriod {
  days: number;
  games: number;
  evolving: number;
  players: number;
  decks: number;
  averagePerDay: number;
  activeDays: number;
  busiestDay: { day: string; games: number } | null;
}

export interface PlayStatsPayload {
  series: DailyPlayRow[];
  week: PlayStatsPeriod;
  month: PlayStatsPeriod;
  today: DailyPlayRow | null;
  updatedAt: string;
}

export function playStatsDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDayKey(day: string, deltaDays: number): string {
  const base = new Date(`${day}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return playStatsDayKey(base);
}

export function deckSignature(cardIds: readonly string[]): string | null {
  const cleaned = cardIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (cleaned.length === 0) return null;
  const joined = [...cleaned].sort().join('|');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < joined.length; i++) {
    const c = joined.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

export function buildDayRange(today: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(shiftDayKey(today, -i));
  return out;
}

export function fillMissingDays(rows: readonly DailyPlayRow[], today: string, days: number): DailyPlayRow[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return buildDayRange(today, days).map(
    (day) => byDay.get(day) ?? { day, games: 0, evolving: 0, players: 0, decks: 0 },
  );
}

export function summarizePeriod(
  rows: readonly DailyPlayRow[],
  uniquePlayers: number,
  uniqueDecks: number,
  days: number,
): PlayStatsPeriod {
  let games = 0;
  let evolving = 0;
  let activeDays = 0;
  let busiestDay: { day: string; games: number } | null = null;

  for (const row of rows) {
    games += row.games;
    evolving += row.evolving;
    if (row.games > 0) activeDays += 1;
    if (row.games > 0 && (!busiestDay || row.games > busiestDay.games)) {
      busiestDay = { day: row.day, games: row.games };
    }
  }

  return {
    days,
    games,
    evolving,
    players: uniquePlayers,
    decks: uniqueDecks,
    averagePerDay: days > 0 ? Math.round((games / days) * 10) / 10 : 0,
    activeDays,
    busiestDay,
  };
}

export function emptyPlayStats(today: string, updatedAt: string): PlayStatsPayload {
  const week = fillMissingDays([], today, 7);
  const month = fillMissingDays([], today, 30);
  return {
    series: week,
    week: summarizePeriod(week, 0, 0, 7),
    month: summarizePeriod(month, 0, 0, 30),
    today: null,
    updatedAt,
  };
}
