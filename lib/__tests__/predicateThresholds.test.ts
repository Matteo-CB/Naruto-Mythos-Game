import { describe, it, expect } from 'vitest';
import { matchQuestsForEvent } from '@/lib/quests/trackProgress';

describe('predicateMatches — threshold semantics', () => {
  it('streak predicate matches all thresholds when actual >= expected', () => {
    const matches = matchQuestsForEvent('ranked.win.streak', { gameMode: 'ranked', streak: 10 });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).toContain('ranked-streak-5');
    expect(ids).toContain('ranked-streak-10');
  });

  it('streak predicate does NOT match higher thresholds when actual < expected', () => {
    const matches = matchQuestsForEvent('ranked.win.streak', { gameMode: 'ranked', streak: 5 });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).toContain('ranked-streak-5');
    expect(ids).not.toContain('ranked-streak-10');
  });

  it('streak predicate matches nothing when actual below smallest threshold', () => {
    const matches = matchQuestsForEvent('ranked.win.streak', { gameMode: 'ranked', streak: 4 });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).not.toContain('ranked-streak-5');
    expect(ids).not.toContain('ranked-streak-10');
  });

  it('threshold predicate matches when actual >= expected (Itachi Power)', () => {
    const matches = matchQuestsForEvent('character.power.threshold', {
      gameMode: 'ranked', name: 'ITACHI UCHIWA', threshold: 15,
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).toContain('itachi-10-power-match');
  });

  it('threshold predicate does NOT match when actual < expected', () => {
    const matches = matchQuestsForEvent('character.power.threshold', {
      gameMode: 'ranked', name: 'ITACHI UCHIWA', threshold: 8,
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).not.toContain('itachi-10-power-match');
  });

  it('maxRound predicate matches when actual <= expected (short win)', () => {
    const matches = matchQuestsForEvent('match.won.short', { gameMode: 'ranked', maxRound: 2 });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).toContain('short-wins-5');
  });

  it('maxRound predicate does NOT match when actual > expected', () => {
    const matches = matchQuestsForEvent('match.won.short', { gameMode: 'ranked', maxRound: 4 });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).not.toContain('short-wins-5');
  });

  it('minPrinted predicate matches when actual >= expected (high-power deck)', () => {
    const matches = matchQuestsForEvent('match.won.deck.power_minimum', {
      gameMode: 'ranked', minPrinted: 4,
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).toContain('win-deck-power-minimum-4');
  });

  it('mission_points threshold predicate completes the 12-point quest in 1 emit', () => {
    const matches = matchQuestsForEvent('mission_points.scored.match', {
      gameMode: 'ranked', threshold: 14,
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).toContain('mission-points-12-match');
    const quest = matches.find((m) => m.quest.id === 'mission-points-12-match');
    expect(quest?.quest.target).toBe(1);
  });

  it('does not match when score below 12', () => {
    const matches = matchQuestsForEvent('mission_points.scored.match', {
      gameMode: 'ranked', threshold: 10,
    });
    expect(matches.map((m) => m.quest.id)).not.toContain('mission-points-12-match');
  });
});
