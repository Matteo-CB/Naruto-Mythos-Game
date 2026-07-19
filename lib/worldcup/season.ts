export interface SeasonBounds {
  seasonKey: string;
  startMonth: string;
  endMonth: string;
  start: Date;
  endExclusive: Date;
}

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function quarterIndex(month: number): number {
  return Math.floor(month / 3);
}

export function seasonBoundsForDate(now: Date): SeasonBounds {
  const year = now.getUTCFullYear();
  const q = quarterIndex(now.getUTCMonth());
  const startMonthIdx = q * 3;
  const start = new Date(Date.UTC(year, startMonthIdx, 1));
  const endExclusive = new Date(Date.UTC(year, startMonthIdx + 3, 1));
  const endMonthDate = new Date(Date.UTC(year, startMonthIdx + 2, 1));
  return {
    seasonKey: `${year}-Q${q + 1}`,
    startMonth: start.toISOString().slice(0, 7),
    endMonth: endMonthDate.toISOString().slice(0, 7),
    start,
    endExclusive,
  };
}

export function previousSeasonBounds(now: Date): SeasonBounds {
  const current = seasonBoundsForDate(now);
  const beforeStart = new Date(current.start.getTime() - 86400000);
  return seasonBoundsForDate(beforeStart);
}

export function seasonKeyForDate(now: Date): string {
  return seasonBoundsForDate(now).seasonKey;
}

export function isSeasonFinished(bounds: SeasonBounds, now: Date): boolean {
  return now.getTime() >= bounds.endExclusive.getTime();
}

export function englishMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${EN_MONTHS[m - 1]} ${y}`;
}

export function championRoleName(endMonth: string): string {
  return `World Champion ${englishMonthLabel(endMonth)}`;
}

export function nationalTeamRoleName(countryCode: string): string {
  return `National Team ${countryCode.toUpperCase()}`;
}
