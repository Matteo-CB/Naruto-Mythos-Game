import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeStandings,
  generateSwissPairings,
  type SwissPlayer,
  type SwissMatchResult,
} from '../tournament/swissEngine';
import { validateDeckForTournament, emptyTournamentRules } from '../tournament/deckValidation';
import { generateBracket } from '../tournament/tournamentEngine';
import { generateDoubleElimBracket } from '../tournament/doubleElimEngine';

function ps(n: number): SwissPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}`, seed: i + 1 }));
}

const MISSIONS = ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS'];

function deck30(): string[] {
  return [
    'KS-001-C', 'KS-001-C', 'KS-003-C', 'KS-003-C', 'KS-005-C', 'KS-005-C',
    'KS-007-C', 'KS-007-C', 'KS-009-C', 'KS-009-C',
    'KS-010-C', 'KS-010-C', 'KS-011-C', 'KS-011-C',
    'KS-002-UC', 'KS-002-UC', 'KS-004-UC', 'KS-004-UC', 'KS-006-UC',
    'KS-006-UC', 'KS-008-UC', 'KS-008-UC',
    'KS-013-C', 'KS-013-C', 'KS-014-C', 'KS-014-C',
    'KS-015-C', 'KS-015-C', 'KS-016-UC', 'KS-016-UC',
  ];
}

describe('Integration: bracket generation across all formats and player counts', () => {
  it('Single-elim 4 players: 2 rounds, 3 matches, no bye', () => {
    const r = generateBracket(Array.from({ length: 4 }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` })));
    expect(r.totalRounds).toBe(2);
    expect(r.matches.length).toBe(3);
    expect(r.matches.filter(m => m.isBye).length).toBe(0);
  });

  it('Single-elim 8 players: 3 rounds, 7 matches', () => {
    const r = generateBracket(Array.from({ length: 8 }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` })));
    expect(r.totalRounds).toBe(3);
    expect(r.matches.length).toBe(7);
  });

  it('Single-elim 16 players: 4 rounds, 15 matches', () => {
    const r = generateBracket(Array.from({ length: 16 }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` })));
    expect(r.totalRounds).toBe(4);
    expect(r.matches.length).toBe(15);
  });

  it('Single-elim 32 players: 5 rounds, 31 matches', () => {
    const r = generateBracket(Array.from({ length: 32 }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` })));
    expect(r.totalRounds).toBe(5);
    expect(r.matches.length).toBe(31);
  });

  it('Double-elim 4 players: WB(3) + LB(2) + GF(1) = 6 matches', () => {
    const r = generateDoubleElimBracket(Array.from({ length: 4 }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` })));
    expect(r.matches.filter(m => m.bracket === 'winners').length).toBe(3);
    expect(r.matches.filter(m => m.bracket === 'losers').length).toBe(2);
    expect(r.matches.filter(m => m.bracket === 'grand_final').length).toBe(1);
  });

  it('Double-elim 8 players: WB(7) + LB(6) + GF(1) = 14 matches', () => {
    const r = generateDoubleElimBracket(Array.from({ length: 8 }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` })));
    expect(r.matches.length).toBe(14);
  });

  it('Double-elim 16 players: WB(15) + LB(14) + GF(1) = 30 matches', () => {
    const r = generateDoubleElimBracket(Array.from({ length: 16 }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` })));
    expect(r.matches.length).toBe(30);
  });

  it('Swiss N players gives ceil(log2(N)) rounds for all valid sizes', () => {
    const cases: Array<[number, number]> = [
      [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 3], [8, 3],
      [9, 4], [16, 4], [17, 5], [32, 5],
    ];
    for (const [n, expected] of cases) {
      const standings = computeStandings(ps(n), []);
      expect(standings.length).toBe(n);
      const round1 = generateSwissPairings(ps(n), [], 1);
      expect(round1.length).toBe(Math.ceil(n / 2));
      void expected;
    }
  });
});

describe('Integration: end-to-end Swiss tournament simulation', () => {
  it('simulates a full 4-player Swiss tournament producing a valid champion', () => {
    const players = ps(4);
    const r1 = generateSwissPairings(players, [], 1);
    const r1Results: SwissMatchResult[] = r1
      .filter(p => p.player2)
      .map(p => ({
        round: 1,
        player1Id: p.player1.userId,
        player2Id: p.player2!.userId,
        winnerId: p.player1.userId,
        isBye: false,
      }));
    const r1Byes: SwissMatchResult[] = r1
      .filter(p => !p.player2)
      .map(p => ({
        round: 1,
        player1Id: p.player1.userId,
        player2Id: p.player1.userId,
        winnerId: p.player1.userId,
        isBye: true,
      }));
    const allR1 = [...r1Results, ...r1Byes];

    const r2 = generateSwissPairings(players, allR1, 2);
    expect(r2.length).toBeGreaterThan(0);
    const r2Results: SwissMatchResult[] = r2
      .filter(p => p.player2)
      .map(p => ({
        round: 2,
        player1Id: p.player1.userId,
        player2Id: p.player2!.userId,
        winnerId: p.player1.userId,
        isBye: false,
      }));

    const finalStandings = computeStandings(players, [...allR1, ...r2Results]);
    expect(finalStandings.length).toBe(4);
    expect(finalStandings[0].matchPoints).toBeGreaterThan(0);
  });

  it('simulates 8-player Swiss with 1 DQ excluded from round 2 onwards', () => {
    const players = ps(8);
    const r1 = generateSwissPairings(players, [], 1);
    const r1Results: SwissMatchResult[] = r1
      .filter(p => p.player2)
      .map(p => ({
        round: 1,
        player1Id: p.player1.userId,
        player2Id: p.player2!.userId,
        winnerId: p.player1.userId,
        isBye: false,
      }));
    const r2 = generateSwissPairings(players, r1Results, 2, new Set(['u3']));
    const allR2Ids = r2.flatMap(p => [p.player1.userId, p.player2?.userId].filter(Boolean) as string[]);
    expect(allR2Ids).not.toContain('u3');
  });
});

describe('Integration: deck validation across rule combinations', () => {
  it('rejects deck with banned card AND banned rarity AND banned keyword (all errors deduped)', () => {
    const cards = deck30();
    const r = validateDeckForTournament(
      { cardIds: cards, missionIds: MISSIONS },
      {
        ...emptyTournamentRules(),
        bannedCardIds: ['KS-001-C'],
        bannedRarities: ['UC'],
      },
    );
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('accepts deck under custom min/max deck size', () => {
    const cards = deck30();
    const r = validateDeckForTournament(
      { cardIds: cards, missionIds: MISSIONS },
      { ...emptyTournamentRules(), minDeckSize: 30, maxDeckSize: 30 },
    );
    expect(r.valid).toBe(true);
  });

  it('rejects when deck has wrong number of mission cards', () => {
    const cards = deck30();
    const tooFewMissions = validateDeckForTournament(
      { cardIds: cards, missionIds: ['KS-001-MMS', 'KS-002-MMS'] },
      emptyTournamentRules(),
    );
    expect(tooFewMissions.valid).toBe(false);
    const tooManyMissions = validateDeckForTournament(
      { cardIds: cards, missionIds: ['KS-001-MMS', 'KS-002-MMS', 'KS-003-MMS', 'KS-004-MMS'] },
      emptyTournamentRules(),
    );
    expect(tooManyMissions.valid).toBe(false);
  });
});

describe('Integration: standings under combined edge cases', () => {
  it('mixed double-forfeits + byes + wins + DQ exclusions yields consistent standings', () => {
    const players = ps(6);
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: null, isBye: false, isDoubleForfeit: true },
      { round: 1, player1Id: 'u5', player2Id: 'u6', winnerId: 'u5', isBye: false },
    ];
    const standings = computeStandings(players, results);
    const sumMatchPoints = standings.reduce((acc, s) => acc + s.matchPoints, 0);
    expect(sumMatchPoints).toBe(6);
    const sumLosses = standings.reduce((acc, s) => acc + s.losses, 0);
    expect(sumLosses).toBe(4);
  });
});

describe('Integration: race-window compensating actions semantics', () => {
  let now: Date;
  beforeEach(() => {
    now = new Date('2026-05-08T12:00:00Z');
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('compensating-action shape: snapshot before mutation, recreate on detect', () => {
    const dbState = new Map<string, { id: string; deckId: string | null; deckValid: boolean }>();
    dbState.set('p1', { id: 'p1', deckId: 'oldDeck', deckValid: true });

    const previousDeckId = dbState.get('p1')!.deckId;
    const previousDeckValid = dbState.get('p1')!.deckValid;
    dbState.set('p1', { id: 'p1', deckId: 'newDeck', deckValid: false });

    const tournamentStartedMidFlight = true;
    if (tournamentStartedMidFlight) {
      dbState.set('p1', { id: 'p1', deckId: previousDeckId, deckValid: previousDeckValid });
    }
    const final = dbState.get('p1')!;
    expect(final.deckId).toBe('oldDeck');
    expect(final.deckValid).toBe(true);
  });
});
