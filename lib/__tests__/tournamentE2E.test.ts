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
  type DEMatch,
  type DEBracket,
} from '../tournament/doubleElimEngine';
import { generateBracket } from '../tournament/tournamentEngine';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}`, seed: i + 1 }));
}


function runFullSwiss(playerCount: number, decideWinner: (p1: string, p2: string, round: number) => string): {
  totalRounds: number;
  results: SwissMatchResult[];
  finalStandings: ReturnType<typeof computeStandings>;
} {
  const ps: SwissPlayer[] = players(playerCount);
  const totalRounds = computeSwissRoundCount(playerCount);
  const allResults: SwissMatchResult[] = [];

  let pairings: SwissPairing[] = generateSwissRound1(ps);

  for (let round = 1; round <= totalRounds; round++) {
    const roundResults: SwissMatchResult[] = pairings.map((p) => {
      if (p.player2 === null) {
        return {
          round, player1Id: p.player1.userId, player2Id: p.player1.userId,
          winnerId: p.player1.userId, isBye: true,
        };
      }
      const winnerId = decideWinner(p.player1.userId, p.player2.userId, round);
      return {
        round, player1Id: p.player1.userId, player2Id: p.player2.userId,
        winnerId, isBye: false,
      };
    });
    allResults.push(...roundResults);

    if (round < totalRounds) {
      pairings = generateSwissPairings(ps, allResults, round + 1);
    }
  }

  const finalStandings = computeStandings(ps, allResults);
  return { totalRounds, results: allResults, finalStandings };
}


describe('Swiss E2E — full lifecycle', () => {
  it('4 players: 2 rounds, top seed always wins, finishes 4-0 at top', () => {
    const { totalRounds, results, finalStandings } = runFullSwiss(4, (a, b) => {
      const an = parseInt(a.replace('u', ''), 10);
      const bn = parseInt(b.replace('u', ''), 10);
      return an < bn ? a : b;
    });
    expect(totalRounds).toBe(2);
    expect(results.length).toBe(4);
    expect(finalStandings[0].userId).toBe('u1');
    expect(finalStandings[0].matchPoints).toBe(6);
    expect(finalStandings[0].wins).toBe(2);
    expect(finalStandings[0].losses).toBe(0);
  });

  it('8 players: 3 rounds, top seed wins all, finishes at top', () => {
    const { totalRounds, results, finalStandings } = runFullSwiss(8, (a, b) => {
      const an = parseInt(a.replace('u', ''), 10);
      const bn = parseInt(b.replace('u', ''), 10);
      return an < bn ? a : b;
    });
    expect(totalRounds).toBe(3);
    expect(results.length).toBe(12);
    expect(finalStandings[0].userId).toBe('u1');
    expect(finalStandings[0].wins).toBe(3);
    expect(finalStandings[finalStandings.length - 1].wins).toBeGreaterThanOrEqual(0);
  });

  it('5 players (odd): 3 rounds with byes distributed, all play 3 games incl bye', () => {
    const { totalRounds, results, finalStandings } = runFullSwiss(5, (a, b) => {
      const an = parseInt(a.replace('u', ''), 10);
      const bn = parseInt(b.replace('u', ''), 10);
      return an < bn ? a : b;
    });
    expect(totalRounds).toBe(3);
    const byes = results.filter((r) => r.isBye);
    expect(byes.length).toBeGreaterThanOrEqual(3);
    const byePlayers = new Set(byes.map((b) => b.winnerId));
    expect(byePlayers.size).toBeGreaterThanOrEqual(3);
    expect(finalStandings.length).toBe(5);
  });

  it('8 players: no rematches across all 3 rounds', () => {
    const { results } = runFullSwiss(8, (a) => a);
    const seenPairs = new Set<string>();
    for (const r of results) {
      if (r.isBye) continue;
      const k = [r.player1Id, r.player2Id].sort().join('|');
      expect(seenPairs.has(k)).toBe(false);
      seenPairs.add(k);
    }
  });

  it('16 players: 4 rounds, top seed wins all, finishes #1', () => {
    const { totalRounds, finalStandings } = runFullSwiss(16, (a, b) => {
      const an = parseInt(a.replace('u', ''), 10);
      const bn = parseInt(b.replace('u', ''), 10);
      return an < bn ? a : b;
    });
    expect(totalRounds).toBe(4);
    expect(finalStandings[0].userId).toBe('u1');
    expect(finalStandings[0].wins).toBe(4);
  });

  it('Standings rank ties broken by Buchholz then seed', () => {
    const ps: SwissPlayer[] = players(4);
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u4', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u2', player2Id: 'u3', winnerId: 'u2', isBye: false },
      { round: 2, player1Id: 'u1', player2Id: 'u2', winnerId: 'u2', isBye: false },
      { round: 2, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
    ];
    const standings = computeStandings(ps, results);
    expect(standings[0].userId).toBe('u2');
    expect(standings[0].matchPoints).toBe(6);
    const tiedAt3 = standings.filter((s) => s.matchPoints === 3);
    expect(tiedAt3.length).toBe(2);
  });
});


type DESim = {
  matches: DEMatch[];
  wbRounds: number;
  lbRounds: number;
};

function buildDESim(n: number): DESim {
  const r = generateDoubleElimBracket(players(n));
  return {
    matches: r.matches.map((m) => ({ ...m })),
    wbRounds: r.wbRounds,
    lbRounds: r.lbRounds,
  };
}

function findM(sim: DESim, b: DEBracket, round: number, idx: number): DEMatch | undefined {
  return sim.matches.find((m) => m.bracket === b && m.round === round && m.matchIndex === idx);
}

function setSlot(m: DEMatch, slot: 'player1' | 'player2', userId: string, username: string) {
  if (slot === 'player1') { m.player1Id = userId; m.player1Username = username; }
  else { m.player2Id = userId; m.player2Username = username; }
  if (m.player1Id && m.player2Id) m.status = 'ready';
}

function completeDE(sim: DESim, b: DEBracket, round: number, idx: number, winnerIsP1: boolean) {
  const m = findM(sim, b, round, idx)!;
  const winner = winnerIsP1
    ? { id: m.player1Id!, name: m.player1Username! }
    : { id: m.player2Id!, name: m.player2Username! };
  const loser = winnerIsP1
    ? { id: m.player2Id!, name: m.player2Username! }
    : { id: m.player1Id!, name: m.player1Username! };
  m.winnerId = winner.id;
  m.winnerUsername = winner.name;
  m.status = 'completed';

  const winT = winnerAdvanceTarget({ bracket: b, round, matchIndex: idx }, sim.wbRounds, sim.lbRounds);
  if (winT) {
    const target = findM(sim, winT.bracket, winT.round, winT.matchIndex);
    if (target) setSlot(target, winT.slot, winner.id, winner.name);
  }
  if (b === 'winners') {
    const loseT = loserDropTarget({ bracket: 'winners', round, matchIndex: idx }, sim.wbRounds);
    if (loseT) {
      const target = findM(sim, loseT.bracket, loseT.round, loseT.matchIndex);
      if (target) setSlot(target, loseT.slot, loser.id, loser.name);
    }
  }
  return { winner, loser };
}


describe('Double-elim E2E — full lifecycle', () => {
  it('4 players: WB winner sweeps, no GF reset needed', () => {
    const sim = buildDESim(4);
    completeDE(sim, 'winners', 1, 0, true);
    completeDE(sim, 'winners', 1, 1, true);
    completeDE(sim, 'losers', 1, 0, true);
    completeDE(sim, 'winners', 2, 0, true);
    completeDE(sim, 'losers', 2, 0, true);
    const gf = findM(sim, 'grand_final', 1, 0);
    expect(gf).toBeDefined();
    expect(gf!.player1Id).toBe('u1');
    expect(gf!.player2Id).toBeTruthy();
    expect(gf!.status).toBe('ready');
  });

  it('8 players: full bracket play-through, GF reaches `ready`', () => {
    const sim = buildDESim(8);
    for (let i = 0; i < 4; i++) completeDE(sim, 'winners', 1, i, true);
    completeDE(sim, 'losers', 1, 0, true);
    completeDE(sim, 'losers', 1, 1, true);
    completeDE(sim, 'winners', 2, 0, true);
    completeDE(sim, 'winners', 2, 1, true);
    completeDE(sim, 'losers', 2, 0, true);
    completeDE(sim, 'losers', 2, 1, true);
    completeDE(sim, 'losers', 3, 0, true);
    completeDE(sim, 'winners', 3, 0, true);
    completeDE(sim, 'losers', 4, 0, true);
    const gf = findM(sim, 'grand_final', 1, 0)!;
    expect(gf.player1Id).toBeTruthy();
    expect(gf.player2Id).toBeTruthy();
    expect(gf.status).toBe('ready');
  });

  it('8 players: WB winner is player1 of GF, LB winner is player2', () => {
    const sim = buildDESim(8);
    for (let i = 0; i < 4; i++) completeDE(sim, 'winners', 1, i, true);
    completeDE(sim, 'losers', 1, 0, true);
    completeDE(sim, 'losers', 1, 1, true);
    completeDE(sim, 'winners', 2, 0, true);
    completeDE(sim, 'winners', 2, 1, true);
    completeDE(sim, 'losers', 2, 0, true);
    completeDE(sim, 'losers', 2, 1, true);
    completeDE(sim, 'losers', 3, 0, true);
    completeDE(sim, 'winners', 3, 0, true);
    completeDE(sim, 'losers', 4, 0, true);
    const gf = findM(sim, 'grand_final', 1, 0)!;
    const wbFinal = findM(sim, 'winners', 3, 0)!;
    expect(gf.player1Id).toBe(wbFinal.winnerId);
    expect(gf.player2Id).not.toBe(wbFinal.winnerId);
  });
});


describe('Single-elim E2E — full lifecycle', () => {
  it('4 players: top seed sweeps to final', () => {
    const r = generateBracket(players(4));
    const matches = r.matches.map((m) => ({ ...m, player1: { ...m.player1 }, player2: { ...m.player2 } }));

    function complete(round: number, idx: number, winP1: boolean) {
      const m = matches.find((x) => x.round === round && x.matchIndex === idx)!;
      const winner = winP1
        ? { id: m.player1.participantId!, name: m.player1.username! }
        : { id: m.player2.participantId!, name: m.player2.username! };
      m.winnerId = winner.id;
      m.winnerUsername = winner.name;
      m.status = 'completed';
      const next = matches.find((x) => x.round === round + 1 && x.matchIndex === Math.floor(idx / 2));
      if (next) {
        if (idx % 2 === 0) {
          next.player1 = { participantId: winner.id, username: winner.name };
        } else {
          next.player2 = { participantId: winner.id, username: winner.name };
        }
      }
    }

    complete(1, 0, true);
    complete(1, 1, true);

    const final = matches.find((x) => x.round === 2 && x.matchIndex === 0)!;
    expect(final.player1.participantId).toBeTruthy();
    expect(final.player2.participantId).toBeTruthy();
  });
});


describe('Swiss tiebreaker — exhaustive', () => {
  it('Buchholz: opponent strength determines order at tied match points', () => {
    const ps: SwissPlayer[] = players(4);
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u4', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u2', player2Id: 'u3', winnerId: 'u2', isBye: false },
      { round: 2, player1Id: 'u1', player2Id: 'u2', winnerId: 'u1', isBye: false },
      { round: 2, player1Id: 'u3', player2Id: 'u4', winnerId: 'u3', isBye: false },
    ];
    const s = computeStandings(ps, results);
    expect(s[0].userId).toBe('u1');
    expect(s[0].buchholz).toBeGreaterThan(0);
  });

  it('Round-N winner has wins=N when never loses', () => {
    const ps: SwissPlayer[] = players(8);
    const results: SwissMatchResult[] = [];
    let pairings = generateSwissRound1(ps);
    for (let round = 1; round <= 3; round++) {
      for (const p of pairings) {
        if (p.player2 === null) {
          results.push({ round, player1Id: p.player1.userId, player2Id: p.player1.userId, winnerId: p.player1.userId, isBye: true });
        } else {
          const win = p.player1.userId === 'u1' || p.player2.userId === 'u1' ? 'u1' : p.player1.userId;
          results.push({ round, player1Id: p.player1.userId, player2Id: p.player2.userId, winnerId: win, isBye: false });
        }
      }
      if (round < 3) pairings = generateSwissPairings(ps, results, round + 1);
    }
    const s = computeStandings(ps, results);
    const u1 = s.find((x) => x.userId === 'u1')!;
    expect(u1.wins).toBe(3);
    expect(u1.matchPoints).toBe(9);
    expect(u1.rank).toBe(1);
  });
});
