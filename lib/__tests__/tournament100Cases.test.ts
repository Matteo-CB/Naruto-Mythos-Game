import { describe, it, expect } from 'vitest';
import {
  computeSwissRoundCount,
  generateSwissRound1,
  generateSwissPairings,
  computeStandings,
  type SwissPlayer,
  type SwissMatchResult,
  type SwissPairing,
} from '../tournament/swissEngine';
import {
  generateDoubleElimBracket,
  loserDropTarget,
  winnerAdvanceTarget,
  type DEBracket,
} from '../tournament/doubleElimEngine';
import { generateBracket } from '../tournament/tournamentEngine';

function players(n: number): SwissPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}`, seed: i + 1 }));
}

function deterministic(n: number) {
  let s = n * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function simulateSwissTournament(
  n: number,
  options: { forfeitPlayers?: Set<string>; doubleAbsentMatches?: number } = {},
): { winner: string | null; completed: boolean; activeCount: number; rounds: number } {
  const ps = players(n);
  const totalRounds = computeSwissRoundCount(n);
  const eliminatedIds = new Set<string>();
  const allResults: SwissMatchResult[] = [];
  const r1Pairings = generateSwissRound1(ps);
  let currentRound = 1;
  let pairings = r1Pairings;
  let doubleAbsentBudget = options.doubleAbsentMatches ?? 0;
  const rand = deterministic(n + (options.forfeitPlayers?.size ?? 0));

  while (true) {
    for (const p of pairings) {
      const p1Id = p.player1.userId;
      const p2Id = p.player2?.userId ?? null;
      const isBye = p2Id === null;

      if (isBye) {
        allResults.push({
          round: p.round, player1Id: p1Id, player2Id: p1Id,
          winnerId: p1Id, isBye: true, isDoubleForfeit: false,
        });
        continue;
      }
      const p1Absent = options.forfeitPlayers?.has(p1Id) ?? false;
      const p2Absent = options.forfeitPlayers?.has(p2Id!) ?? false;

      if (doubleAbsentBudget > 0 && p1Absent && p2Absent) {
        allResults.push({
          round: p.round, player1Id: p1Id, player2Id: p2Id!,
          winnerId: null, isBye: false, isDoubleForfeit: true,
        });
        eliminatedIds.add(p1Id);
        eliminatedIds.add(p2Id!);
        doubleAbsentBudget--;
        continue;
      }
      if (p1Absent) {
        allResults.push({
          round: p.round, player1Id: p1Id, player2Id: p2Id!,
          winnerId: p2Id!, isBye: false, isDoubleForfeit: false,
        });
        eliminatedIds.add(p1Id);
        continue;
      }
      if (p2Absent) {
        allResults.push({
          round: p.round, player1Id: p1Id, player2Id: p2Id!,
          winnerId: p1Id, isBye: false, isDoubleForfeit: false,
        });
        eliminatedIds.add(p2Id!);
        continue;
      }
      const winnerId = rand() < 0.5 ? p1Id : p2Id!;
      allResults.push({
        round: p.round, player1Id: p1Id, player2Id: p2Id!,
        winnerId, isBye: false, isDoubleForfeit: false,
      });
    }

    const activeCount = n - eliminatedIds.size;
    if (activeCount <= 1) {
      const standings = computeStandings(ps, allResults);
      const winner = standings.find(s => !eliminatedIds.has(s.userId))?.userId ?? null;
      return { winner, completed: activeCount === 1, activeCount, rounds: currentRound };
    }
    if (currentRound >= totalRounds) {
      const standings = computeStandings(ps, allResults);
      const winner = standings.find(s => !eliminatedIds.has(s.userId))?.userId ?? null;
      return { winner, completed: !!winner, activeCount, rounds: currentRound };
    }
    currentRound++;
    pairings = generateSwissPairings(ps, allResults, currentRound, eliminatedIds);
  }
}

function simulateSingleElim(
  n: number,
  options: { forfeitPlayers?: Set<string> } = {},
): { winner: string | null; rounds: number; matchesPlayed: number } {
  const ps = players(n).map(p => ({ userId: p.userId, username: p.username }));
  const { matches } = generateBracket(ps);
  const totalRounds = Math.log2(n);
  const byId = new Map(matches.map(m => [`${m.round}:${m.matchIndex}`, m]));
  const rand = deterministic(n);
  let played = 0;

  for (let round = 1; round <= totalRounds; round++) {
    const rms = matches.filter(m => m.round === round);
    for (const m of rms) {
      if (m.status === 'completed' && m.winnerId) continue;
      const p1 = m.player1?.participantId ?? null;
      const p2 = m.player2?.participantId ?? null;
      if (!p1 || !p2) continue;
      const p1Absent = options.forfeitPlayers?.has(p1) ?? false;
      const p2Absent = options.forfeitPlayers?.has(p2) ?? false;
      let winnerId: string;
      if (p1Absent && p2Absent) winnerId = p1;
      else if (p1Absent) winnerId = p2;
      else if (p2Absent) winnerId = p1;
      else winnerId = rand() < 0.5 ? p1 : p2;
      m.winnerId = winnerId;
      m.status = 'completed';
      played++;
      const winnerUsername = winnerId === p1 ? m.player1!.username : m.player2!.username;
      if (round < totalRounds) {
        const nextIdx = Math.floor(m.matchIndex / 2);
        const next = byId.get(`${round + 1}:${nextIdx}`);
        if (next) {
          if (m.matchIndex % 2 === 0) {
            next.player1 = { participantId: winnerId, username: winnerUsername };
          } else {
            next.player2 = { participantId: winnerId, username: winnerUsername };
          }
        }
      }
    }
  }
  const final = matches.find(m => m.round === totalRounds);
  return { winner: final?.winnerId ?? null, rounds: totalRounds, matchesPlayed: played };
}

function simulateDoubleElim(
  n: number,
  options: { lbWinnerBeatsWB?: boolean } = {},
): { winner: string | null; finalReset: boolean } {
  const ps = players(n).map(p => ({ userId: p.userId, username: p.username }));
  const { matches, totalRounds } = generateDoubleElimBracket(ps);
  void totalRounds;
  const wbRounds = Math.max(1, Math.log2(n));
  const lbRounds = Math.max(0, 2 * wbRounds - 2);
  const rand = deterministic(n);
  const byKey = new Map(matches.map(m => [`${m.bracket}:${m.round}:${m.matchIndex}`, m]));

  let safety = 0;
  while (safety++ < 200) {
    const ready = matches.find(
      m => m.status === 'ready' && m.player1Id && m.player2Id && !m.winnerId,
    );
    if (!ready) break;
    const isGrandFinal = ready.bracket === 'grand_final';
    let winnerId: string;
    if (isGrandFinal && ready.round === 1 && options.lbWinnerBeatsWB) {
      winnerId = ready.player2Id!;
    } else if (isGrandFinal && ready.round === 1) {
      winnerId = ready.player1Id!;
    } else {
      winnerId = rand() < 0.5 ? ready.player1Id! : ready.player2Id!;
    }
    const loserId = ready.player1Id === winnerId ? ready.player2Id! : ready.player1Id!;
    ready.winnerId = winnerId;
    ready.winnerUsername = winnerId === ready.player1Id ? ready.player1Username : ready.player2Username;
    ready.status = 'completed';

    if (isGrandFinal && ready.round === 1 && winnerId === ready.player2Id) {
      const reset = {
        tournamentId: 't', bracket: 'grand_final' as DEBracket, round: 2, matchIndex: 0,
        player1Id: ready.player1Id, player1Username: ready.player1Username,
        player2Id: winnerId, player2Username: ready.winnerUsername ?? null,
        winnerId: null, winnerUsername: null, isBye: false,
        status: 'ready' as const,
      };
      matches.push(reset as never);
      byKey.set(`grand_final:2:0`, reset as never);
      continue;
    }
    if (isGrandFinal && (ready.round === 2 || winnerId === ready.player1Id)) {
      return { winner: winnerId, finalReset: ready.round === 2 };
    }

    const winT = winnerAdvanceTarget(
      { bracket: ready.bracket as DEBracket, round: ready.round, matchIndex: ready.matchIndex },
      wbRounds, lbRounds,
    );
    if (winT) {
      const target = byKey.get(`${winT.bracket}:${winT.round}:${winT.matchIndex}`);
      if (target) {
        if (winT.slot === 'player1') {
          target.player1Id = winnerId;
          target.player1Username = ready.winnerUsername ?? null;
        } else {
          target.player2Id = winnerId;
          target.player2Username = ready.winnerUsername ?? null;
        }
        if (target.player1Id && target.player2Id && target.status === 'pending') {
          target.status = 'ready';
        }
      }
    }
    if (ready.bracket === 'winners') {
      const dropT = loserDropTarget(
        { bracket: 'winners', round: ready.round, matchIndex: ready.matchIndex },
        wbRounds,
      );
      if (dropT) {
        const target = byKey.get(`${dropT.bracket}:${dropT.round}:${dropT.matchIndex}`);
        if (target) {
          const loserUsername = loserId === ready.player1Id ? ready.player1Username : ready.player2Username;
          if (dropT.slot === 'player1') {
            target.player1Id = loserId;
            target.player1Username = loserUsername;
          } else {
            target.player2Id = loserId;
            target.player2Username = loserUsername;
          }
          if (target.player1Id && target.player2Id && target.status === 'pending') {
            target.status = 'ready';
          }
        }
      }
    }
  }
  return { winner: null, finalReset: false };
}

describe('Tournament 100% coverage — Swiss N=2..16 happy path', () => {
  for (let n = 2; n <= 16; n++) {
    it(`Swiss N=${n}: completes with exactly 1 winner`, () => {
      const r = simulateSwissTournament(n);
      expect(r.winner).not.toBeNull();
      expect(r.rounds).toBeGreaterThan(0);
      expect(r.rounds).toBeLessThanOrEqual(computeSwissRoundCount(n));
    });
  }
});

describe('Tournament 100% coverage — Swiss with absences', () => {
  it('Swiss N=8: 1 player absent every match (only 1 forfeit per opponent) → tournament completes', () => {
    const r = simulateSwissTournament(8, { forfeitPlayers: new Set(['u1']) });
    expect(r.winner).not.toBeNull();
  });
  it('Swiss N=8: 2 players are absent (cascade forfeits)', () => {
    const r = simulateSwissTournament(8, { forfeitPlayers: new Set(['u1', 'u2']) });
    expect(r.winner).not.toBeNull();
  });
  it('Swiss N=4: double absence in round 1 → both eliminated, tournament still completes', () => {
    const r = simulateSwissTournament(4, {
      forfeitPlayers: new Set(['u1', 'u2']),
      doubleAbsentMatches: 1,
    });
    expect(r.activeCount).toBeLessThanOrEqual(2);
    expect(r.winner).not.toBeNull();
  });
  it('Swiss N=6 with all but 1 eliminated → auto-complete with that 1 player as winner', () => {
    const r = simulateSwissTournament(6, {
      forfeitPlayers: new Set(['u1', 'u2', 'u3', 'u4', 'u5']),
    });
    expect(r.winner).toBe('u6');
    expect(r.activeCount).toBe(1);
  });
});

describe('Tournament 100% coverage — Single elim happy path', () => {
  for (const n of [4, 8, 16, 32]) {
    it(`Single elim N=${n}: completes with exactly 1 winner and ${n - 1} matches played`, () => {
      const r = simulateSingleElim(n);
      expect(r.winner).not.toBeNull();
      expect(r.matchesPlayed).toBe(n - 1);
      expect(r.rounds).toBe(Math.log2(n));
    });
  }
});

describe('Tournament 100% coverage — Single elim with forfeits', () => {
  for (const n of [4, 8, 16, 32]) {
    it(`Single elim N=${n}: all matches forfeited (1 player absent everywhere) → tournament still completes`, () => {
      const forfeits = new Set<string>();
      for (let i = 1; i <= n; i += 2) forfeits.add(`u${i}`);
      const r = simulateSingleElim(n, { forfeitPlayers: forfeits });
      expect(r.winner).not.toBeNull();
    });
  }
});

describe('Tournament 100% coverage — Double elim happy path', () => {
  for (const n of [4, 8, 16, 32]) {
    it(`Double elim N=${n}: completes with one winner (WB winner takes grand final)`, () => {
      const r = simulateDoubleElim(n);
      expect(r.winner).not.toBeNull();
    });
    it(`Double elim N=${n}: grand final reset (LB winner beats WB winner round 1) still completes`, () => {
      const r = simulateDoubleElim(n, { lbWinnerBeatsWB: true });
      expect(r.winner).not.toBeNull();
      expect(r.finalReset).toBe(true);
    });
  }
});

describe('Tournament 100% coverage — Round-count and match-count invariants', () => {
  for (let n = 2; n <= 32; n++) {
    it(`Swiss N=${n}: round count = ceil(log2(N))`, () => {
      expect(computeSwissRoundCount(n)).toBe(Math.ceil(Math.log2(n)));
    });
  }
  for (const n of [4, 8, 16, 32]) {
    it(`Single elim N=${n}: total matches = N-1`, () => {
      const r = generateBracket(players(n).map(p => ({ userId: p.userId, username: p.username })));
      expect(r.matches.length).toBe(n - 1);
    });
    it(`Double elim N=${n}: bracket has WB, LB, grand_final and total matches in expected range`, () => {
      const r = generateDoubleElimBracket(players(n).map(p => ({ userId: p.userId, username: p.username })));
      const wb = r.matches.filter(m => m.bracket === 'winners').length;
      const lb = r.matches.filter(m => m.bracket === 'losers').length;
      const gf = r.matches.filter(m => m.bracket === 'grand_final').length;
      expect(wb).toBe(n - 1);
      expect(lb).toBeGreaterThanOrEqual(n - 2);
      expect(gf).toBeGreaterThanOrEqual(1);
    });
  }
});
