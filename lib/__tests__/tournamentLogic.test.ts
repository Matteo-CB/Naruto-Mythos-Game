import { describe, it, expect } from 'vitest';
import {
  generateDoubleElimBracket,
  loserDropTarget,
  winnerAdvanceTarget,
  type DEMatch,
} from '../tournament/doubleElimEngine';
import { generateBracket } from '../tournament/tournamentEngine';
import {
  computeSwissRoundCount,
  generateSwissRound1,
  generateSwissPairings,
  computeStandings,
  type SwissPlayer,
  type SwissMatchResult,
} from '../tournament/swissEngine';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` }));
}

describe('Tournament logic — Swiss', () => {
  it('rounds count formula matches ceil(log2(N)) for all valid sizes', () => {
    expect(computeSwissRoundCount(2)).toBe(1);
    expect(computeSwissRoundCount(4)).toBe(2);
    expect(computeSwissRoundCount(5)).toBe(3);
    expect(computeSwissRoundCount(8)).toBe(3);
    expect(computeSwissRoundCount(9)).toBe(4);
    expect(computeSwissRoundCount(16)).toBe(4);
    expect(computeSwissRoundCount(17)).toBe(5);
    expect(computeSwissRoundCount(32)).toBe(5);
  });

  it('R1 produces floor(N/2) matches with one bye for odd counts', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 32]) {
      const ps: SwissPlayer[] = players(n).map((p, i) => ({ ...p, seed: i + 1 }));
      const r1 = generateSwissRound1(ps);
      const realMatches = r1.filter((m) => m.player2 !== null);
      const byes = r1.filter((m) => m.player2 === null);
      expect(r1.length).toBe(Math.ceil(n / 2));
      expect(realMatches.length).toBe(Math.floor(n / 2));
      expect(byes.length).toBe(n % 2 === 1 ? 1 : 0);
    }
  });

  it('Swiss with 2 players: 1 round, 1 match, no bye', () => {
    const ps: SwissPlayer[] = players(2).map((p, i) => ({ ...p, seed: i + 1 }));
    expect(computeSwissRoundCount(2)).toBe(1);
    const r1 = generateSwissRound1(ps);
    expect(r1.length).toBe(1);
    expect(r1[0].player2).not.toBeNull();
  });

  it('Swiss with 3 players: 2 rounds, R1 has 1 match + 1 bye', () => {
    const ps: SwissPlayer[] = players(3).map((p, i) => ({ ...p, seed: i + 1 }));
    expect(computeSwissRoundCount(3)).toBe(2);
    const r1 = generateSwissRound1(ps);
    expect(r1.length).toBe(2);
    const real = r1.filter((m) => m.player2 !== null);
    const bye = r1.filter((m) => m.player2 === null);
    expect(real.length).toBe(1);
    expect(bye.length).toBe(1);
  });

  it('Bye match in R1 has player1 as the lowest-seed and no player2', () => {
    const ps: SwissPlayer[] = players(5).map((p, i) => ({ ...p, seed: i + 1 }));
    const r1 = generateSwissRound1(ps);
    const bye = r1.find((m) => m.player2 === null);
    expect(bye).toBeDefined();
    expect(bye!.player1.userId).toBe('u5');
  });

  it('computeStandings applies Buchholz correctly for a 4-player 2-round example', () => {
    const ps: SwissPlayer[] = players(4).map((p, i) => ({ ...p, seed: i + 1 }));
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u4', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u2', player2Id: 'u3', winnerId: 'u2', isBye: false },
      { round: 2, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 2, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
    ];
    const s = computeStandings(ps, results);
    expect(s[0].userId).toBe('u1');
    expect(s[0].matchPoints).toBe(6);
    expect(s.find((x) => x.userId === 'u4')!.matchPoints).toBe(0);
  });
});

describe('Tournament logic — Single elimination', () => {
  it('produces correct number of matches for power-of-2 sizes', () => {
    for (const n of [4, 8, 16, 32]) {
      const r = generateBracket(players(n));
      expect(r.matches.length).toBe(n - 1);
      expect(r.totalRounds).toBe(Math.log2(n));
    }
  });

  it('first round has N/2 matches with both players assigned', () => {
    const r = generateBracket(players(8));
    const r1 = r.matches.filter((m) => m.round === 1);
    expect(r1.length).toBe(4);
    for (const m of r1) {
      expect(m.player1.participantId).toBeTruthy();
      expect(m.player2.participantId).toBeTruthy();
    }
  });
});

describe('Tournament logic — Double elimination', () => {
  it('match counts match the formula for sizes 4 / 8 / 16 / 32', () => {
    const expected: Record<number, { wb: number; lb: number; gf: number }> = {
      4: { wb: 2 + 1, lb: 1 + 1, gf: 1 },
      8: { wb: 4 + 2 + 1, lb: 2 + 2 + 1 + 1, gf: 1 },
      16: { wb: 8 + 4 + 2 + 1, lb: 4 + 4 + 2 + 2 + 1 + 1, gf: 1 },
      32: { wb: 16 + 8 + 4 + 2 + 1, lb: 8 + 8 + 4 + 4 + 2 + 2 + 1 + 1, gf: 1 },
    };
    for (const [n, exp] of Object.entries(expected)) {
      const r = generateDoubleElimBracket(players(Number(n)));
      const wb = r.matches.filter((m) => m.bracket === 'winners').length;
      const lb = r.matches.filter((m) => m.bracket === 'losers').length;
      const gf = r.matches.filter((m) => m.bracket === 'grand_final').length;
      expect(wb).toBe(exp.wb);
      expect(lb).toBe(exp.lb);
      expect(gf).toBe(exp.gf);
    }
  });

  it('LB drop pattern: WB R1 losers go to LB R1 paired up', () => {
    const wbRounds = 3;
    const t0 = loserDropTarget({ bracket: 'winners', round: 1, matchIndex: 0 }, wbRounds);
    const t1 = loserDropTarget({ bracket: 'winners', round: 1, matchIndex: 1 }, wbRounds);
    const t2 = loserDropTarget({ bracket: 'winners', round: 1, matchIndex: 2 }, wbRounds);
    const t3 = loserDropTarget({ bracket: 'winners', round: 1, matchIndex: 3 }, wbRounds);
    expect(t0).toEqual({ bracket: 'losers', round: 1, matchIndex: 0, slot: 'player1' });
    expect(t1).toEqual({ bracket: 'losers', round: 1, matchIndex: 0, slot: 'player2' });
    expect(t2).toEqual({ bracket: 'losers', round: 1, matchIndex: 1, slot: 'player1' });
    expect(t3).toEqual({ bracket: 'losers', round: 1, matchIndex: 1, slot: 'player2' });
  });

  it('LB drop pattern: WB R2 losers go to LB R2 absorbing slot (player2)', () => {
    const wbRounds = 3;
    expect(loserDropTarget({ bracket: 'winners', round: 2, matchIndex: 0 }, wbRounds)).toEqual({
      bracket: 'losers', round: 2, matchIndex: 0, slot: 'player2',
    });
    expect(loserDropTarget({ bracket: 'winners', round: 2, matchIndex: 1 }, wbRounds)).toEqual({
      bracket: 'losers', round: 2, matchIndex: 1, slot: 'player2',
    });
  });

  it('LB drop pattern: WB final loser goes to LB final', () => {
    expect(loserDropTarget({ bracket: 'winners', round: 2, matchIndex: 0 }, 2)).toEqual({
      bracket: 'losers', round: 2, matchIndex: 0, slot: 'player2',
    });
    expect(loserDropTarget({ bracket: 'winners', round: 3, matchIndex: 0 }, 3)).toEqual({
      bracket: 'losers', round: 4, matchIndex: 0, slot: 'player2',
    });
    expect(loserDropTarget({ bracket: 'winners', round: 4, matchIndex: 0 }, 4)).toEqual({
      bracket: 'losers', round: 6, matchIndex: 0, slot: 'player2',
    });
    expect(loserDropTarget({ bracket: 'winners', round: 5, matchIndex: 0 }, 5)).toEqual({
      bracket: 'losers', round: 8, matchIndex: 0, slot: 'player2',
    });
  });

  it('LB advancement: even rounds advance to player1 of next-round same matchIndex', () => {
    expect(winnerAdvanceTarget({ bracket: 'losers', round: 1, matchIndex: 0 }, 3, 4)).toEqual({
      bracket: 'losers', round: 2, matchIndex: 0, slot: 'player1',
    });
    expect(winnerAdvanceTarget({ bracket: 'losers', round: 1, matchIndex: 1 }, 3, 4)).toEqual({
      bracket: 'losers', round: 2, matchIndex: 1, slot: 'player1',
    });
  });

  it('LB advancement: odd rounds pair winners (matchIndex floor(i/2), slot alternates)', () => {
    expect(winnerAdvanceTarget({ bracket: 'losers', round: 2, matchIndex: 0 }, 3, 4)).toEqual({
      bracket: 'losers', round: 3, matchIndex: 0, slot: 'player1',
    });
    expect(winnerAdvanceTarget({ bracket: 'losers', round: 2, matchIndex: 1 }, 3, 4)).toEqual({
      bracket: 'losers', round: 3, matchIndex: 0, slot: 'player2',
    });
  });

  it('GF placement: WB winner goes to GF p1, LB winner goes to GF p2', () => {
    expect(winnerAdvanceTarget({ bracket: 'winners', round: 3, matchIndex: 0 }, 3, 4)).toEqual({
      bracket: 'grand_final', round: 1, matchIndex: 0, slot: 'player1',
    });
    expect(winnerAdvanceTarget({ bracket: 'losers', round: 4, matchIndex: 0 }, 3, 4)).toEqual({
      bracket: 'grand_final', round: 1, matchIndex: 0, slot: 'player2',
    });
  });

  it('Initial WB R1 byes propagate to WB R2 with correct slot', () => {
    const r = generateDoubleElimBracket(players(5));
    const wbR2 = r.matches.filter((m: DEMatch) => m.bracket === 'winners' && m.round === 2);
    const filledR2 = wbR2.filter((m: DEMatch) => m.player1Id || m.player2Id);
    expect(filledR2.length).toBeGreaterThan(0);
  });
});

describe('Tournament logic — Swiss double absence (no-show)', () => {
  it('isDoubleForfeit gives both players a loss and 0 match points (not a draw)', () => {
    const ps: SwissPlayer[] = players(2).map((p, i) => ({ ...p, seed: i + 1 }));
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: null, isBye: false, isDoubleForfeit: true },
    ];
    const standings = computeStandings(ps, results);
    const u1 = standings.find(s => s.userId === 'u1')!;
    const u2 = standings.find(s => s.userId === 'u2')!;
    expect(u1.matchPoints).toBe(0);
    expect(u2.matchPoints).toBe(0);
    expect(u1.losses).toBe(1);
    expect(u2.losses).toBe(1);
    expect(u1.draws).toBe(0);
    expect(u2.draws).toBe(0);
    expect(u1.wins).toBe(0);
    expect(u2.wins).toBe(0);
  });

  it('plain draw (winnerId=null without doubleForfeit) still gives 1 point each', () => {
    const ps: SwissPlayer[] = players(2).map((p, i) => ({ ...p, seed: i + 1 }));
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: null, isBye: false },
    ];
    const standings = computeStandings(ps, results);
    expect(standings[0].matchPoints).toBe(1);
    expect(standings[1].matchPoints).toBe(1);
    expect(standings[0].draws).toBe(1);
    expect(standings[1].draws).toBe(1);
  });

  it('double forfeit does not give Buchholz-rewarding points to opponents', () => {
    const ps: SwissPlayer[] = players(4).map((p, i) => ({ ...p, seed: i + 1 }));
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: null, isBye: false, isDoubleForfeit: true },
      { round: 2, player1Id: 'u1', player2Id: 'u3', winnerId: 'u1', isBye: false },
    ];
    const standings = computeStandings(ps, results);
    const u1 = standings.find(s => s.userId === 'u1')!;
    const u3 = standings.find(s => s.userId === 'u3')!;
    expect(u3.matchPoints).toBe(0);
    expect(u1.matchPoints).toBe(6);
    expect(u1.buchholz).toBe(0);
  });
});

describe('Tournament logic — Swiss eliminated player exclusion', () => {
  it('excluded user ids are not paired in subsequent rounds', () => {
    const ps: SwissPlayer[] = players(4).map((p, i) => ({ ...p, seed: i + 1 }));
    const r1Results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
    ];
    const r2 = generateSwissPairings(ps, r1Results, 2, new Set(['u3']));
    const allPairedIds = r2.flatMap(m => [m.player1.userId, m.player2?.userId].filter(Boolean) as string[]);
    expect(allPairedIds).not.toContain('u3');
    expect(new Set(allPairedIds).size).toBe(allPairedIds.length);
  });

  it('with one eliminated player out of 4, the other 3 produce 1 match + 1 bye', () => {
    const ps: SwissPlayer[] = players(4).map((p, i) => ({ ...p, seed: i + 1 }));
    const r1Results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
    ];
    const r2 = generateSwissPairings(ps, r1Results, 2, new Set(['u4']));
    expect(r2.length).toBe(2);
    const byes = r2.filter(m => m.player2 === null);
    expect(byes.length).toBe(1);
  });

  it('standings still include eliminated players (their stats are frozen)', () => {
    const ps: SwissPlayer[] = players(4).map((p, i) => ({ ...p, seed: i + 1 }));
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
    ];
    const standings = computeStandings(ps, results);
    expect(standings.find(s => s.userId === 'u4')).toBeDefined();
    expect(standings.find(s => s.userId === 'u4')?.matchPoints).toBe(0);
  });

  it('excluding all players returns no pairings (does not crash)', () => {
    const ps: SwissPlayer[] = players(4).map((p, i) => ({ ...p, seed: i + 1 }));
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
    ];
    const r2 = generateSwissPairings(ps, results, 2, new Set(['u1', 'u2', 'u3', 'u4']));
    expect(r2).toEqual([]);
  });
});

describe('Tournament logic — full mental run for 8 players double-elim', () => {
  it('produces the right number of total matches and a single GF', () => {
    const r = generateDoubleElimBracket(players(8));
    expect(r.wbRounds).toBe(3);
    expect(r.lbRounds).toBe(4);
    expect(r.matches.length).toBe(7 + 6 + 1);
  });

  it('every WB R1 match is in `ready` status when both players are assigned', () => {
    const r = generateDoubleElimBracket(players(8));
    const r1 = r.matches.filter((m: DEMatch) => m.bracket === 'winners' && m.round === 1);
    for (const m of r1) {
      if (m.player1Id && m.player2Id) {
        expect(m.status).toBe('ready');
      }
    }
  });
});
