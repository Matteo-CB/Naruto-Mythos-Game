// Weekly automatic tournament schedule. Shared by the auto-creator (server) and the
// calendar UI (client), so it must stay free of server-only imports.

export type TourneyKind = 'classic' | 'open' | 'elimination' | 'sealed';

export interface WeeklyDaySpec {
  kind: TourneyKind;
  format: 'swiss' | 'elimination';
  gameMode: 'classic' | 'sealed';
  useBanList: boolean;
}

export const AUTO_TOURNAMENT_MAX_PLAYERS = 32;
export const AUTO_TOURNAMENT_REG_HOUR = 17;
export const AUTO_TOURNAMENT_START_HOUR = 21;
export const AUTO_SEALED_BOOSTER_COUNT = 5;
export const AUTO_SEALED_SET_CHOICE = 'random';

// JS weekday: 0=Sunday .. 6=Saturday.
// Monday: classic but 100% of cards allowed (no ban list). Tuesday: single elimination.
// Wednesday: sealed. Thursday/Saturday/Sunday: classic. Friday: NO tournament.
export const WEEKLY_SCHEDULE: Record<number, WeeklyDaySpec | null> = {
  1: { kind: 'open', format: 'swiss', gameMode: 'classic', useBanList: false },
  2: { kind: 'elimination', format: 'elimination', gameMode: 'classic', useBanList: true },
  3: { kind: 'sealed', format: 'swiss', gameMode: 'sealed', useBanList: true },
  4: { kind: 'classic', format: 'swiss', gameMode: 'classic', useBanList: true },
  5: null,
  6: { kind: 'classic', format: 'swiss', gameMode: 'classic', useBanList: true },
  0: { kind: 'classic', format: 'swiss', gameMode: 'classic', useBanList: true },
};

export const AUTO_TOURNAMENT_NAMES: Record<TourneyKind, string> = {
  classic: 'Weekly Classic',
  open: 'Weekly Open (All Cards)',
  elimination: 'Weekly Elimination',
  sealed: 'Weekly Sealed',
};

export const AUTO_TOURNAMENT_NAME_SET: readonly string[] = Object.values(AUTO_TOURNAMENT_NAMES);

export const KIND_COLORS: Record<TourneyKind, string> = {
  classic: '#c4a35a',
  open: '#4a9e4a',
  elimination: '#b33e3e',
  sealed: '#6f8fc0',
};

export function specForWeekday(weekday: number): WeeklyDaySpec | null {
  return WEEKLY_SCHEDULE[weekday] ?? null;
}

// Infer the display kind of any tournament (auto OR admin-created) from its stored fields,
// so the calendar can colour and describe it consistently.
export function inferTournamentKind(t: { format?: string | null; gameMode?: string | null; useBanList?: boolean | null }): TourneyKind {
  if (t.gameMode === 'sealed') return 'sealed';
  if (t.format === 'elimination' || t.format === 'double_elimination') return 'elimination';
  if (t.gameMode === 'classic' && t.useBanList === false) return 'open';
  return 'classic';
}
