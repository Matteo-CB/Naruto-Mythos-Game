import { describe, it, expect } from 'vitest';
import { specForWeekday, inferTournamentKind, AUTO_TOURNAMENT_MAX_PLAYERS } from '@/lib/tournament/weeklySchedule';

describe('weekly tournament schedule', () => {
  it('has no tournament on Friday evening', () => {
    expect(specForWeekday(5)).toBeNull();
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
  });
});
