import { describe, expect, it } from 'vitest';
import {
  WEEKLY_SCHEDULE,
  AUTO_TOURNAMENT_REG_HOUR,
  NWL_CALENDAR_REG_HOUR,
  NWL_CALENDAR_START_HOUR,
  regHourForSpec,
  startHourForSpec,
} from '@/lib/tournament/weeklySchedule';
import { NWL_REG_OPEN_HOUR, NWL_FRIDAY_WEEKDAY } from '@/lib/tournament/nwlFridayTournament';
import { NWL_START_HOUR } from '@/lib/tournament/nwlPartner';

describe('the New World Loot Friday tournament opens three hours earlier', () => {
  it('registration opens at 14, three hours before the old 17', () => {
    expect(NWL_REG_OPEN_HOUR).toBe(14);
    expect(AUTO_TOURNAMENT_REG_HOUR - NWL_REG_OPEN_HOUR, 'exactly three hours earlier').toBe(3);
  });

  it('the calendar shown to players advertises the same hour as the creator uses', () => {
    const friday = WEEKLY_SCHEDULE[NWL_FRIDAY_WEEKDAY]!;
    expect(regHourForSpec(friday)).toBe(NWL_REG_OPEN_HOUR);
    expect(NWL_CALENDAR_REG_HOUR).toBe(NWL_REG_OPEN_HOUR);
  });

  it('the start time does not move, only the opening does', () => {
    const friday = WEEKLY_SCHEDULE[NWL_FRIDAY_WEEKDAY]!;
    expect(startHourForSpec(friday)).toBe(NWL_CALENDAR_START_HOUR);
    expect(NWL_START_HOUR).toBe(22);
  });

  it('the other days keep their usual registration hour', () => {
    for (const [weekday, spec] of Object.entries(WEEKLY_SCHEDULE)) {
      if (!spec || Number(weekday) === NWL_FRIDAY_WEEKDAY) continue;
      expect(regHourForSpec(spec), `weekday ${weekday} must not move`).toBe(AUTO_TOURNAMENT_REG_HOUR);
    }
  });

  it('the registration window still ends when the tournament starts', () => {
    expect(NWL_REG_OPEN_HOUR).toBeLessThan(NWL_START_HOUR);
    expect(NWL_START_HOUR - NWL_REG_OPEN_HOUR, 'eight hours of registration').toBe(8);
  });
});
