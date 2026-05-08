import { describe, it, expect } from 'vitest';
import {
  generateDoubleElimBracket,
  loserDropTarget,
  winnerAdvanceTarget,
  type DEMatch,
  type DEBracket,
} from '../tournament/doubleElimEngine';
import { computeStandings, generateSwissPairings, type SwissPlayer, type SwissMatchResult } from '../tournament/swissEngine';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}`, seed: i + 1 }));
}


describe('Idempotency — Double-elim advancement', () => {
  it('Calling complete twice on the same WB R1 match yields the same target slots', () => {
    const r = generateDoubleElimBracket(players(8));
    const m1: DEMatch[] = r.matches.map((m) => ({ ...m }));
    const m2: DEMatch[] = r.matches.map((m) => ({ ...m }));

    function complete(arr: DEMatch[], b: DEBracket, round: number, idx: number, winP1: boolean) {
      const m = arr.find((x) => x.bracket === b && x.round === round && x.matchIndex === idx)!;
      const winner = winP1 ? { id: m.player1Id!, name: m.player1Username! } : { id: m.player2Id!, name: m.player2Username! };
      const loser = winP1 ? { id: m.player2Id!, name: m.player2Username! } : { id: m.player1Id!, name: m.player1Username! };
      m.winnerId = winner.id;
      m.status = 'completed';
      const winT = winnerAdvanceTarget({ bracket: b, round, matchIndex: idx }, r.wbRounds, r.lbRounds)!;
      const target = arr.find((x) => x.bracket === winT.bracket && x.round === winT.round && x.matchIndex === winT.matchIndex)!;
      if (winT.slot === 'player1') { target.player1Id = winner.id; target.player1Username = winner.name; }
      else { target.player2Id = winner.id; target.player2Username = winner.name; }
      const loseT = loserDropTarget({ bracket: 'winners', round, matchIndex: idx }, r.wbRounds)!;
      const lt = arr.find((x) => x.bracket === loseT.bracket && x.round === loseT.round && x.matchIndex === loseT.matchIndex)!;
      if (loseT.slot === 'player1') { lt.player1Id = loser.id; lt.player1Username = loser.name; }
      else { lt.player2Id = loser.id; lt.player2Username = loser.name; }
    }

    complete(m1, 'winners', 1, 0, true);
    complete(m2, 'winners', 1, 0, true);
    complete(m2, 'winners', 1, 0, true);

    const wbR2_m1 = m1.find((x) => x.bracket === 'winners' && x.round === 2 && x.matchIndex === 0)!;
    const wbR2_m2 = m2.find((x) => x.bracket === 'winners' && x.round === 2 && x.matchIndex === 0)!;
    expect(wbR2_m1.player1Id).toBe(wbR2_m2.player1Id);

    const lbR1_m1 = m1.find((x) => x.bracket === 'losers' && x.round === 1 && x.matchIndex === 0)!;
    const lbR1_m2 = m2.find((x) => x.bracket === 'losers' && x.round === 1 && x.matchIndex === 0)!;
    expect(lbR1_m1.player1Id).toBe(lbR1_m2.player1Id);
  });
});


describe('Idempotency — Swiss standings recalculation', () => {
  it('computeStandings is deterministic: calling twice gives identical output', () => {
    const ps: SwissPlayer[] = players(8);
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u8', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u2', player2Id: 'u7', winnerId: 'u2', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u6', winnerId: 'u3', isBye: false },
      { round: 1, player1Id: 'u4', player2Id: 'u5', winnerId: 'u4', isBye: false },
    ];
    const s1 = computeStandings(ps, results);
    const s2 = computeStandings(ps, results);
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });

  it('generateSwissPairings is deterministic when called twice with same input', () => {
    const ps: SwissPlayer[] = players(8);
    const r1Results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u8', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u2', player2Id: 'u7', winnerId: 'u2', isBye: false },
      { round: 1, player1Id: 'u3', player2Id: 'u6', winnerId: 'u3', isBye: false },
      { round: 1, player1Id: 'u4', player2Id: 'u5', winnerId: 'u4', isBye: false },
    ];
    const p1 = generateSwissPairings(ps, r1Results, 2);
    const p2 = generateSwissPairings(ps, r1Results, 2);
    expect(p1.length).toBe(p2.length);
    for (let i = 0; i < p1.length; i++) {
      expect(p1[i].player1.userId).toBe(p2[i].player1.userId);
      expect(p1[i].player2?.userId ?? null).toBe(p2[i].player2?.userId ?? null);
    }
  });
});


describe('Idempotency — Bracket generation', () => {
  it('generateDoubleElimBracket is deterministic for same player list', () => {
    const ps = players(8);
    const a = generateDoubleElimBracket(ps);
    const b = generateDoubleElimBracket(ps);
    expect(a.matches.length).toBe(b.matches.length);
    for (let i = 0; i < a.matches.length; i++) {
      expect(a.matches[i].bracket).toBe(b.matches[i].bracket);
      expect(a.matches[i].round).toBe(b.matches[i].round);
      expect(a.matches[i].matchIndex).toBe(b.matches[i].matchIndex);
      expect(a.matches[i].player1Id).toBe(b.matches[i].player1Id);
      expect(a.matches[i].player2Id).toBe(b.matches[i].player2Id);
    }
  });
});


describe('Idempotency — DE drop/advance targets', () => {
  it('Calling loserDropTarget twice with same input gives identical result', () => {
    for (const wbR of [2, 3, 4, 5]) {
      const cases = [
        { bracket: 'winners' as const, round: 1, matchIndex: 0 },
        { bracket: 'winners' as const, round: 2, matchIndex: 0 },
        { bracket: 'winners' as const, round: wbR, matchIndex: 0 },
      ];
      for (const c of cases) {
        const a = loserDropTarget(c, wbR);
        const b = loserDropTarget(c, wbR);
        expect(a).toEqual(b);
      }
    }
  });

  it('Calling winnerAdvanceTarget twice with same input gives identical result', () => {
    const cases = [
      { bracket: 'winners' as const, round: 1, matchIndex: 0 },
      { bracket: 'winners' as const, round: 2, matchIndex: 1 },
      { bracket: 'losers' as const, round: 1, matchIndex: 0 },
      { bracket: 'losers' as const, round: 2, matchIndex: 1 },
      { bracket: 'losers' as const, round: 4, matchIndex: 0 },
    ];
    for (const c of cases) {
      const a = winnerAdvanceTarget(c, 3, 4);
      const b = winnerAdvanceTarget(c, 3, 4);
      expect(a).toEqual(b);
    }
  });
});
