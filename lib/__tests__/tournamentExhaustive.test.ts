import { describe, it, expect } from 'vitest';
import {
  generateDoubleElimBracket,
  loserDropTarget,
  winnerAdvanceTarget,
} from '../tournament/doubleElimEngine';
import { generateBracket, nextPowerOf2 } from '../tournament/tournamentEngine';
import { computeSwissRoundCount, generateSwissRound1, type SwissPlayer } from '../tournament/swissEngine';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` }));
}


describe('Exhaustive Swiss bracket invariants for N=2..32', () => {
  for (let n = 2; n <= 32; n++) {
    it(`N=${n}: ceil(log2(N)) rounds, floor(N/2) real matches, (N%2===1) byes`, () => {
      const ps: SwissPlayer[] = players(n).map((p, i) => ({ ...p, seed: i + 1 }));
      const expectedRounds = Math.ceil(Math.log2(n));
      expect(computeSwissRoundCount(n)).toBe(expectedRounds);
      const r1 = generateSwissRound1(ps);
      expect(r1.length).toBe(Math.ceil(n / 2));
      const reals = r1.filter((m) => m.player2 !== null);
      const byes = r1.filter((m) => m.player2 === null);
      expect(reals.length).toBe(Math.floor(n / 2));
      expect(byes.length).toBe(n % 2 === 1 ? 1 : 0);

      const seen = new Set<string>();
      for (const m of reals) {
        const k = [m.player1.userId, m.player2!.userId].sort().join('|');
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }

      const allUserIds = new Set<string>();
      for (const m of r1) {
        if (m.player1) allUserIds.add(m.player1.userId);
        if (m.player2) allUserIds.add(m.player2.userId);
      }
      expect(allUserIds.size).toBe(n);
    });
  }
});


describe('Exhaustive Single-elim invariants for N in {4,8,16,32}', () => {
  for (const n of [4, 8, 16, 32]) {
    it(`N=${n}: log2(N) rounds, exactly N-1 matches`, () => {
      const r = generateBracket(players(n));
      expect(r.totalRounds).toBe(Math.log2(n));
      expect(r.matches.length).toBe(n - 1);
      for (let round = 1; round <= r.totalRounds; round++) {
        const matchesInRound = r.matches.filter((m) => m.round === round);
        expect(matchesInRound.length).toBe(n / Math.pow(2, round));
      }
      const r1 = r.matches.filter((m) => m.round === 1);
      const seenInR1 = new Set<string>();
      for (const m of r1) {
        if (m.player1.participantId) {
          expect(seenInR1.has(m.player1.participantId)).toBe(false);
          seenInR1.add(m.player1.participantId);
        }
        if (m.player2.participantId) {
          expect(seenInR1.has(m.player2.participantId)).toBe(false);
          seenInR1.add(m.player2.participantId);
        }
      }
      expect(seenInR1.size).toBe(n);
    });
  }
});


describe('Exhaustive Double-elim invariants for N in {4,8,16,32}', () => {
  for (const n of [4, 8, 16, 32]) {
    it(`N=${n}: bracket structure is correct`, () => {
      const r = generateDoubleElimBracket(players(n));
      const wbRounds = Math.log2(n);
      expect(r.wbRounds).toBe(wbRounds);
      expect(r.lbRounds).toBe(2 * wbRounds - 2);

      const wbMatches = r.matches.filter((m) => m.bracket === 'winners');
      expect(wbMatches.length).toBe(n - 1);

      for (let round = 1; round <= wbRounds; round++) {
        const wbR = wbMatches.filter((m) => m.round === round);
        expect(wbR.length).toBe(n / Math.pow(2, round));
      }

      const gf = r.matches.filter((m) => m.bracket === 'grand_final');
      expect(gf.length).toBe(1);
      expect(gf[0].round).toBe(1);
    });

    it(`N=${n}: every WB R1 loser has a unique LB drop target slot`, () => {
      const wbRounds = Math.log2(n);
      const r1Matches = n / 2;
      const slots = new Set<string>();
      for (let i = 0; i < r1Matches; i++) {
        const t = loserDropTarget({ bracket: 'winners', round: 1, matchIndex: i }, wbRounds);
        expect(t).not.toBeNull();
        const key = `${t!.bracket}-${t!.round}-${t!.matchIndex}-${t!.slot}`;
        expect(slots.has(key)).toBe(false);
        slots.add(key);
      }
    });

    it(`N=${n}: WB winners advance targets are unique within each round`, () => {
      const wbRounds = Math.log2(n);
      const lbRounds = 2 * wbRounds - 2;
      for (let round = 1; round < wbRounds; round++) {
        const slots = new Set<string>();
        const matchCount = n / Math.pow(2, round);
        for (let i = 0; i < matchCount; i++) {
          const t = winnerAdvanceTarget({ bracket: 'winners', round, matchIndex: i }, wbRounds, lbRounds);
          expect(t).not.toBeNull();
          const key = `${t!.bracket}-${t!.round}-${t!.matchIndex}-${t!.slot}`;
          expect(slots.has(key)).toBe(false);
          slots.add(key);
        }
      }
    });
  }
});


describe('Double-elim full simulation for N=8 (bye-free run)', () => {
  it('plays out all rounds and finishes with one champion', () => {
    const ps = players(8);
    const r = generateDoubleElimBracket(ps);
    const matches = r.matches.map((m) => ({ ...m }));
    const wbRounds = r.wbRounds;
    const lbRounds = r.lbRounds;

    function findMatch(bracket: string, round: number, matchIndex: number) {
      return matches.find((m) => m.bracket === bracket && m.round === round && m.matchIndex === matchIndex);
    }

    function complete(bracket: string, round: number, matchIndex: number, winnerIsP1: boolean) {
      const m = findMatch(bracket, round, matchIndex);
      if (!m || !m.player1Id || !m.player2Id) throw new Error(`match ${bracket} R${round} M${matchIndex} not playable`);
      const winner = winnerIsP1 ? { id: m.player1Id, name: m.player1Username! } : { id: m.player2Id, name: m.player2Username! };
      const loser = winnerIsP1 ? { id: m.player2Id, name: m.player2Username! } : { id: m.player1Id, name: m.player1Username! };
      m.winnerId = winner.id;
      m.winnerUsername = winner.name;
      m.status = 'completed';

      const winT = winnerAdvanceTarget({ bracket: bracket as never, round, matchIndex }, wbRounds, lbRounds);
      if (winT) {
        const target = findMatch(winT.bracket, winT.round, winT.matchIndex);
        if (target) {
          if (winT.slot === 'player1') { target.player1Id = winner.id; target.player1Username = winner.name; }
          else { target.player2Id = winner.id; target.player2Username = winner.name; }
          if (target.player1Id && target.player2Id) target.status = 'ready';
        }
      }

      if (bracket === 'winners') {
        const loseT = loserDropTarget({ bracket: 'winners', round, matchIndex }, wbRounds);
        if (loseT) {
          const target = findMatch(loseT.bracket, loseT.round, loseT.matchIndex);
          if (target) {
            if (loseT.slot === 'player1') { target.player1Id = loser.id; target.player1Username = loser.name; }
            else { target.player2Id = loser.id; target.player2Username = loser.name; }
            if (target.player1Id && target.player2Id) target.status = 'ready';
          }
        }
      }
    }

    complete('winners', 1, 0, true);
    complete('winners', 1, 1, true);
    complete('winners', 1, 2, true);
    complete('winners', 1, 3, true);

    complete('losers', 1, 0, true);
    complete('losers', 1, 1, true);

    complete('winners', 2, 0, true);
    complete('winners', 2, 1, true);

    complete('losers', 2, 0, true);
    complete('losers', 2, 1, true);

    complete('losers', 3, 0, true);

    complete('winners', 3, 0, true);

    complete('losers', 4, 0, true);

    const gf = findMatch('grand_final', 1, 0);
    expect(gf).toBeDefined();
    expect(gf!.player1Id).toBeTruthy();
    expect(gf!.player2Id).toBeTruthy();
    expect(gf!.status).toBe('ready');
  });
});


describe('nextPowerOf2 invariant', () => {
  it('returns the smallest power of two >= input for N in 2..1024', () => {
    for (let n = 2; n <= 1024; n++) {
      const p = nextPowerOf2(n);
      expect(p).toBeGreaterThanOrEqual(n);
      expect((p & (p - 1)) === 0).toBe(true);
      const half = p / 2;
      expect(half < n).toBe(true);
    }
  });
});
