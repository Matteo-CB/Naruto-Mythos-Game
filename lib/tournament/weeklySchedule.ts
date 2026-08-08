// Weekly automatic tournament schedule. Shared by the auto-creator (server) and the
// calendar UI (client), so it must stay free of server-only imports.

export type TourneyKind = 'classic' | 'open' | 'elimination' | 'sealed' | 'partner';

export interface WeeklyDaySpec {
  kind: TourneyKind;
  format: 'swiss' | 'elimination';
  gameMode: 'classic' | 'sealed';
  useBanList: boolean;
  autoCreate?: boolean;
  partner?: string;
  startHour?: number;
  regHour?: number;
  maxPlayers?: number;
}

export const AUTO_TOURNAMENT_MAX_PLAYERS = 32;
export const AUTO_TOURNAMENT_REG_HOUR = 17;
export const AUTO_TOURNAMENT_START_HOUR = 21;
export const AUTO_SEALED_BOOSTER_COUNT = 5;
export const AUTO_SEALED_SET_CHOICE = 'random';

export const NWL_PARTNER_NAME = 'New World Loot';
export const NWL_CALENDAR_START_HOUR = 22;
export const NWL_CALENDAR_REG_HOUR = 14;
export const NWL_FIRST_PLACE_STORE_CREDIT_GBP = 20;
export const NWL_FIRST_PLACE_PAYPAL_GBP = 10;
export const NWL_CHUNIN_PODIUM_PLACES = 3;
export const NWL_DISCORD_INVITE = 'discord.gg/Wk5MQhkNEw';
export const NWL_CALENDAR_MAX_PLAYERS = 32;

export const WEEKLY_SCHEDULE: Record<number, WeeklyDaySpec | null> = {
  1: { kind: 'open', format: 'swiss', gameMode: 'classic', useBanList: false },
  2: { kind: 'elimination', format: 'elimination', gameMode: 'classic', useBanList: true },
  3: { kind: 'sealed', format: 'swiss', gameMode: 'sealed', useBanList: true },
  4: { kind: 'classic', format: 'swiss', gameMode: 'classic', useBanList: true },
  5: {
    kind: 'partner',
    format: 'elimination',
    gameMode: 'classic',
    useBanList: true,
    autoCreate: false,
    partner: 'nwl',
    startHour: NWL_CALENDAR_START_HOUR,
    regHour: NWL_CALENDAR_REG_HOUR,
    maxPlayers: NWL_CALENDAR_MAX_PLAYERS,
  },
  6: { kind: 'classic', format: 'swiss', gameMode: 'classic', useBanList: true },
  0: { kind: 'classic', format: 'swiss', gameMode: 'classic', useBanList: true },
};

export const AUTO_TOURNAMENT_NAMES: Record<TourneyKind, string> = {
  classic: 'Weekly Classic',
  open: 'Weekly Open (All Cards)',
  elimination: 'Weekly Elimination',
  sealed: 'Weekly Sealed',
  partner: 'Friday Free Genin Tournament',
};

export const AUTO_TOURNAMENT_NAME_SET: readonly string[] = Object.values(AUTO_TOURNAMENT_NAMES);

export const KIND_COLORS: Record<TourneyKind, string> = {
  classic: '#c4a35a',
  open: '#4a9e4a',
  elimination: '#b33e3e',
  sealed: '#6f8fc0',
  partner: '#9a6fc4',
};

export function specForWeekday(weekday: number): WeeklyDaySpec | null {
  const spec = WEEKLY_SCHEDULE[weekday] ?? null;
  if (!spec || spec.autoCreate === false) return null;
  return spec;
}

export function startHourForSpec(spec: WeeklyDaySpec): number {
  return spec.startHour ?? AUTO_TOURNAMENT_START_HOUR;
}

export function regHourForSpec(spec: WeeklyDaySpec): number {
  return spec.regHour ?? AUTO_TOURNAMENT_REG_HOUR;
}

export function maxPlayersForSpec(spec: WeeklyDaySpec): number {
  return spec.maxPlayers ?? AUTO_TOURNAMENT_MAX_PLAYERS;
}

export const SCHEDULE_TZ = 'Europe/Paris';

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function scheduleDateParts(base: Date): { year: number; month: number; day: number; hour: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(base)) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: +map.year,
    month: +map.month,
    day: +map.day,
    hour,
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

export function scheduleWallToUtc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(guess))) map[p.type] = p.value;
  let h = parseInt(map.hour, 10);
  if (h === 24) h = 0;
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, h, +map.minute, +map.second);
  return new Date(guess - (asUtc - guess));
}

export interface WeeklyOccurrence {
  scheduleWeekday: number;
  spec: WeeklyDaySpec;
  regAt: Date;
  startAt: Date;
}

export function nextWeeklyOccurrences(now: Date = new Date()): WeeklyOccurrence[] {
  const today = scheduleDateParts(now);
  const occurrences: WeeklyOccurrence[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const shifted = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth() + 1;
    const day = shifted.getUTCDate();
    const scheduleWeekday = shifted.getUTCDay();

    const spec = WEEKLY_SCHEDULE[scheduleWeekday];
    if (!spec) continue;

    let startAt = scheduleWallToUtc(year, month, day, startHourForSpec(spec));
    let regAt = scheduleWallToUtc(year, month, day, regHourForSpec(spec));

    if (startAt.getTime() <= now.getTime()) {
      const rolled = new Date(Date.UTC(year, month - 1, day + 7));
      const ry = rolled.getUTCFullYear();
      const rm = rolled.getUTCMonth() + 1;
      const rd = rolled.getUTCDate();
      startAt = scheduleWallToUtc(ry, rm, rd, startHourForSpec(spec));
      regAt = scheduleWallToUtc(ry, rm, rd, regHourForSpec(spec));
    }

    occurrences.push({ scheduleWeekday, spec, regAt, startAt });
  }

  return occurrences.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export function inferTournamentKind(t: { format?: string | null; gameMode?: string | null; useBanList?: boolean | null; partner?: string | null }): TourneyKind {
  if (t.partner) return 'partner';
  if (t.gameMode === 'sealed') return 'sealed';
  if (t.format === 'elimination' || t.format === 'double_elimination') return 'elimination';
  if (t.gameMode === 'classic' && t.useBanList === false) return 'open';
  return 'classic';
}
