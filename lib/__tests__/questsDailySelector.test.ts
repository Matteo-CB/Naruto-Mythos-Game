import { describe, it, expect } from 'vitest';
import { pickDailyQuest, formatDateUTC, pickDailyQuestForToday } from '@/lib/quests/dailySelector';
import { QUESTS } from '@/lib/quests/questData';

describe('dailySelector', () => {
  it('formatDateUTC produces YYYY-MM-DD', () => {
    expect(formatDateUTC(new Date('2026-05-25T13:45:00Z'))).toBe('2026-05-25');
    expect(formatDateUTC(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02');
  });

  it('is deterministic for a given date', () => {
    const a = pickDailyQuest('2026-05-25', []);
    const b = pickDailyQuest('2026-05-25', []);
    expect(a.id).toBe(b.id);
  });

  it('different dates likely pick different quests', () => {
    const dates = [
      '2026-01-01', '2026-02-15', '2026-03-30', '2026-04-12',
      '2026-05-25', '2026-06-08', '2026-07-21', '2026-08-04',
      '2026-09-17', '2026-10-30',
    ];
    const ids = new Set(dates.map((d) => pickDailyQuest(d, []).id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('avoids recently picked quests when alternatives exist', () => {
    const date = '2026-05-25';
    const first = pickDailyQuest(date, []);
    const second = pickDailyQuest(date, [first.id]);
    expect(second.id).not.toBe(first.id);
  });

  it('falls back to full pool if every quest was recently picked', () => {
    const everyId = QUESTS.map((q) => q.id);
    const q = pickDailyQuest('2026-05-25', everyId);
    expect(q).toBeTruthy();
    expect(everyId).toContain(q.id);
  });

  it('only ever returns quests from the canonical pool', () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    for (let i = 0; i < 50; i++) {
      const q = pickDailyQuest(`2026-01-${String(i + 1).padStart(2, '0')}`);
      expect(ids.has(q.id)).toBe(true);
    }
  });

  it('pickDailyQuestForToday returns today + a quest', () => {
    const now = new Date('2026-05-25T05:00:00Z');
    const r = pickDailyQuestForToday(now);
    expect(r.date).toBe('2026-05-25');
    expect(r.quest).toBeTruthy();
  });
});

describe('quest data integrity', () => {
  const coreQuests = QUESTS.filter((q) => !q.hook.startsWith('trade.'));
  const tradeQuests = QUESTS.filter((q) => q.hook.startsWith('trade.'));

  it('has exactly 100 core quests plus the trade quests', () => {
    expect(coreQuests.length).toBe(100);
    expect(tradeQuests.length).toBe(3);
  });

  it('has 25 core quests at each difficulty level', () => {
    const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const q of coreQuests) byLevel[q.level]++;
    expect(byLevel[1]).toBe(25);
    expect(byLevel[2]).toBe(25);
    expect(byLevel[3]).toBe(25);
    expect(byLevel[4]).toBe(25);
  });

  it('every quest has a unique id', () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    expect(ids.size).toBe(QUESTS.length);
  });

  it('every quest has positive target', () => {
    for (const q of QUESTS) expect(q.target).toBeGreaterThan(0);
  });

  it('no quest opts into Solo v Self by default', () => {
    for (const q of QUESTS) expect(q.allowSoloVSelf).not.toBe(true);
  });
});
