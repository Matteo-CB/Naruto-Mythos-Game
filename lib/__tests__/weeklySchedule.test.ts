import { describe, it, expect } from 'vitest';
import {
  specForWeekday,
  inferTournamentKind,
  AUTO_TOURNAMENT_MAX_PLAYERS,
  AUTO_TOURNAMENT_START_HOUR,
  WEEKLY_SCHEDULE,
  startHourForSpec,
  maxPlayersForSpec,
  nextWeeklyOccurrences,
} from '@/lib/tournament/weeklySchedule';
import { NWL_START_HOUR, NWL_MAX_PLAYERS } from '@/lib/tournament/nwlPartner';

describe('weekly tournament schedule', () => {
  it('never auto-creates a tournament on Friday (New World Loot owns that slot)', () => {
    expect(specForWeekday(5)).toBeNull();
  });

  it('still shows the New World Loot partner tournament on Friday in the calendar', () => {
    const friday = WEEKLY_SCHEDULE[5];
    expect(friday).not.toBeNull();
    expect(friday).toMatchObject({
      kind: 'partner',
      partner: 'nwl',
      format: 'elimination',
      gameMode: 'classic',
      useBanList: true,
      autoCreate: false,
    });
  });

  it('the Friday calendar entry matches the real New World Loot creator settings', () => {
    const friday = WEEKLY_SCHEDULE[5]!;
    expect(startHourForSpec(friday)).toBe(NWL_START_HOUR);
    expect(maxPlayersForSpec(friday)).toBe(NWL_MAX_PLAYERS);
  });

  it('non-partner days keep the standard start hour and slot count', () => {
    const monday = WEEKLY_SCHEDULE[1]!;
    expect(startHourForSpec(monday)).toBe(AUTO_TOURNAMENT_START_HOUR);
    expect(maxPlayersForSpec(monday)).toBe(AUTO_TOURNAMENT_MAX_PLAYERS);
  });

  it('Monday is open (all cards, no ban list)', () => {
    expect(specForWeekday(1)).toMatchObject({ kind: 'open', format: 'swiss', gameMode: 'classic', useBanList: false });
  });

  it('Tuesday is single elimination', () => {
    expect(specForWeekday(2)).toMatchObject({ kind: 'elimination', format: 'elimination', gameMode: 'classic' });
  });

  it('Wednesday is sealed', () => {
    expect(specForWeekday(3)).toMatchObject({ kind: 'sealed', gameMode: 'sealed' });
  });

  it('Thursday, Saturday and Sunday are classic swiss', () => {
    for (const wd of [4, 6, 0]) {
      expect(specForWeekday(wd)).toMatchObject({ kind: 'classic', format: 'swiss', gameMode: 'classic', useBanList: true });
    }
  });

  it('every automatic tournament has 32 slots', () => {
    expect(AUTO_TOURNAMENT_MAX_PLAYERS).toBe(32);
  });

  it('infers the display kind from tournament fields (auto or admin-created)', () => {
    expect(inferTournamentKind({ gameMode: 'sealed' })).toBe('sealed');
    expect(inferTournamentKind({ format: 'elimination', gameMode: 'classic' })).toBe('elimination');
    expect(inferTournamentKind({ format: 'double_elimination', gameMode: 'classic' })).toBe('elimination');
    expect(inferTournamentKind({ format: 'swiss', gameMode: 'classic', useBanList: false })).toBe('open');
    expect(inferTournamentKind({ format: 'swiss', gameMode: 'classic', useBanList: true })).toBe('classic');
    expect(inferTournamentKind({ format: 'elimination', gameMode: 'classic', partner: 'nwl' })).toBe('partner');
  });
});

describe('weekly calendar occurrences across time zones', () => {
  const summerFriday = new Date('2026-07-24T12:00:00.000Z');
  const weekdayIn = (tz: string, d: Date) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d);
  const hourIn = (tz: string, d: Date) =>
    parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }).format(d), 10);

  it('returns one upcoming occurrence per scheduled day, in chronological order', () => {
    const occurrences = nextWeeklyOccurrences(summerFriday);
    expect(occurrences).toHaveLength(7);
    for (let i = 1; i < occurrences.length; i++) {
      expect(occurrences[i].startAt.getTime()).toBeGreaterThan(occurrences[i - 1].startAt.getTime());
    }
  });

  it('never shows a tournament whose start time has already passed', () => {
    const occurrences = nextWeeklyOccurrences(summerFriday);
    for (const o of occurrences) {
      expect(o.startAt.getTime()).toBeGreaterThan(summerFriday.getTime());
      expect(o.regAt.getTime()).toBeLessThan(o.startAt.getTime());
    }
  });

  it('starts the New World Loot tournament at 22:00 Paris', () => {
    const nwl = nextWeeklyOccurrences(summerFriday).find((o) => o.spec.partner === 'nwl')!;
    expect(hourIn('Europe/Paris', nwl.startAt)).toBe(22);
    expect(nwl.startAt.toISOString()).toBe('2026-07-24T20:00:00.000Z');
  });

  it('falls on the NEXT calendar day in far-east time zones, so the day label must follow the viewer', () => {
    const nwl = nextWeeklyOccurrences(summerFriday).find((o) => o.spec.partner === 'nwl')!;
    expect(weekdayIn('Europe/Paris', nwl.startAt)).toBe('Friday');
    expect(weekdayIn('Asia/Tokyo', nwl.startAt)).toBe('Saturday');
    expect(weekdayIn('Pacific/Auckland', nwl.startAt)).toBe('Saturday');
  });

  it('can also fall on the PREVIOUS calendar day in the western Americas', () => {
    const sunday = nextWeeklyOccurrences(summerFriday).find((o) => o.scheduleWeekday === 0)!;
    expect(weekdayIn('Europe/Paris', sunday.startAt)).toBe('Sunday');
    expect(weekdayIn('America/Los_Angeles', sunday.startAt)).toBe('Sunday');
    expect(hourIn('America/Los_Angeles', sunday.startAt)).toBe(12);
  });

  it('stays correct through the winter time change', () => {
    const winterNwl = nextWeeklyOccurrences(new Date('2026-01-06T12:00:00.000Z')).find((o) => o.spec.partner === 'nwl')!;
    expect(hourIn('Europe/Paris', winterNwl.startAt)).toBe(22);
    expect(winterNwl.startAt.toISOString()).toBe('2026-01-09T21:00:00.000Z');
  });
});
