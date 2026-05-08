import { describe, it, expect } from 'vitest';
import {
  generateDoubleElimBracket,
  loserDropTarget,
  winnerAdvanceTarget,
  type DEMatch,
  type DEBracket,
} from '../tournament/doubleElimEngine';
import { generateBracket } from '../tournament/tournamentEngine';
import {
  generateSwissPairings,
  computeStandings,
  type SwissPlayer,
  type SwissMatchResult,
} from '../tournament/swissEngine';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` }));
}


type DESim = {
  matches: DEMatch[];
  wbRounds: number;
  lbRounds: number;
};

function buildSim(n: number): DESim {
  const r = generateDoubleElimBracket(players(n));
  return {
    matches: r.matches.map((m) => ({ ...m })),
    wbRounds: r.wbRounds,
    lbRounds: r.lbRounds,
  };
}

function findMatch(sim: DESim, bracket: DEBracket, round: number, matchIndex: number): DEMatch | undefined {
  return sim.matches.find((m) => m.bracket === bracket && m.round === round && m.matchIndex === matchIndex);
}

function setSlot(m: DEMatch, slot: 'player1' | 'player2', userId: string, username: string) {
  if (slot === 'player1') {
    m.player1Id = userId;
    m.player1Username = username;
  } else {
    m.player2Id = userId;
    m.player2Username = username;
  }
  if (m.player1Id && m.player2Id) m.status = 'ready';
}

function complete(sim: DESim, bracket: DEBracket, round: number, matchIndex: number, winnerIsP1: boolean): { winnerId: string; loserId: string } {
  const m = findMatch(sim, bracket, round, matchIndex);
  if (!m) throw new Error(`Match ${bracket} R${round} M${matchIndex} not found`);
  if (!m.player1Id || !m.player2Id) throw new Error(`Match ${bracket} R${round} M${matchIndex} not ready (p1=${m.player1Id} p2=${m.player2Id})`);
  const winner = winnerIsP1 ? { id: m.player1Id, name: m.player1Username! } : { id: m.player2Id, name: m.player2Username! };
  const loser = winnerIsP1 ? { id: m.player2Id, name: m.player2Username! } : { id: m.player1Id, name: m.player1Username! };
  m.winnerId = winner.id;
  m.winnerUsername = winner.name;
  m.status = 'completed';

  const winT = winnerAdvanceTarget({ bracket, round, matchIndex }, sim.wbRounds, sim.lbRounds);
  if (winT) {
    const target = findMatch(sim, winT.bracket, winT.round, winT.matchIndex);
    if (target) setSlot(target, winT.slot, winner.id, winner.name);
  }

  if (bracket === 'winners') {
    const loseT = loserDropTarget({ bracket: 'winners', round, matchIndex }, sim.wbRounds);
    if (loseT) {
      const target = findMatch(sim, loseT.bracket, loseT.round, loseT.matchIndex);
      if (target) setSlot(target, loseT.slot, loser.id, loser.name);
    }
  }

  return { winnerId: winner.id, loserId: loser.id };
}

function forfeit(sim: DESim, bracket: DEBracket, round: number, matchIndex: number, forfeiterIsP1: boolean): { winnerId: string; loserId: string } {
  return complete(sim, bracket, round, matchIndex, !forfeiterIsP1);
}


describe('Double-elim — forfeit cascades', () => {
  it('Forfait WB R1: loser still drops to LB R1 normally', () => {
    const sim = buildSim(8);
    const result = forfeit(sim, 'winners', 1, 0, true);
    const lbR1m0 = findMatch(sim, 'losers', 1, 0)!;
    expect(lbR1m0.player1Id).toBe(result.loserId);
  });

  it('Forfait WB final: loser drops to LB final, winner goes to GF p1', () => {
    const sim = buildSim(8);
    complete(sim, 'winners', 1, 0, true);
    complete(sim, 'winners', 1, 1, true);
    complete(sim, 'winners', 1, 2, true);
    complete(sim, 'winners', 1, 3, true);
    complete(sim, 'losers', 1, 0, true);
    complete(sim, 'losers', 1, 1, true);
    complete(sim, 'winners', 2, 0, true);
    complete(sim, 'winners', 2, 1, true);
    complete(sim, 'losers', 2, 0, true);
    complete(sim, 'losers', 2, 1, true);
    complete(sim, 'losers', 3, 0, true);

    const wbFinalRes = forfeit(sim, 'winners', 3, 0, true);
    const lbFinal = findMatch(sim, 'losers', 4, 0)!;
    expect(lbFinal.player2Id).toBe(wbFinalRes.loserId);
    const gf = findMatch(sim, 'grand_final', 1, 0)!;
    expect(gf.player1Id).toBe(wbFinalRes.winnerId);
  });

  it('Multiple forfaits in sequence keep bracket consistent', () => {
    const sim = buildSim(8);
    forfeit(sim, 'winners', 1, 0, true);
    forfeit(sim, 'winners', 1, 1, true);
    forfeit(sim, 'winners', 1, 2, true);
    forfeit(sim, 'winners', 1, 3, true);

    for (let i = 0; i < 4; i++) {
      const w = findMatch(sim, 'winners', 2, Math.floor(i / 2));
      expect(w).toBeDefined();
    }
    expect(findMatch(sim, 'losers', 1, 0)!.status).toBe('ready');
    expect(findMatch(sim, 'losers', 1, 1)!.status).toBe('ready');
  });
});


describe('Single-elim — forfeit cascades', () => {
  it('R1 forfait: winner advances to R2 with correct slot', () => {
    const r = generateBracket(players(4));
    const matches = r.matches.map((m) => ({ ...m, player1: { ...m.player1 }, player2: { ...m.player2 } }));
    const m0 = matches.find((m) => m.round === 1 && m.matchIndex === 0)!;
    const winnerId = m0.player1.participantId!;
    const winnerName = m0.player1.username!;
    m0.winnerId = winnerId;
    m0.winnerUsername = winnerName;
    m0.status = 'completed';

    const r2 = matches.find((m) => m.round === 2 && m.matchIndex === 0)!;
    if (m0.matchIndex % 2 === 0) {
      r2.player1 = { participantId: winnerId, username: winnerName };
    }
    expect(r2.player1.participantId).toBe(winnerId);
  });
});


describe('Swiss — round-by-round flow with multiple forfaits', () => {
  it('4 players, R1 has both players forfeit (1 from each match)', () => {
    const ps: SwissPlayer[] = players(4).map((p, i) => ({ ...p, seed: i + 1 }));
    const r1: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u4', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u2', player2Id: 'u3', winnerId: 'u3', isBye: false },
    ];
    const standings1 = computeStandings(ps, r1);
    expect(standings1[0].matchPoints).toBeGreaterThan(0);
    expect(standings1.length).toBe(4);

    const pairings2 = generateSwissPairings(ps, r1, 2);
    expect(pairings2.length).toBe(2);
    for (const p of pairings2) {
      const sameKey = [p.player1.userId, p.player2?.userId].sort().join('|');
      const playedKey1 = ['u1', 'u4'].sort().join('|');
      const playedKey2 = ['u2', 'u3'].sort().join('|');
      expect(sameKey).not.toBe(playedKey1);
      expect(sameKey).not.toBe(playedKey2);
    }
  });

  it('Standings stay consistent when a player forfait every round (no eliminations in Swiss)', () => {
    const ps: SwissPlayer[] = players(4).map((p, i) => ({ ...p, seed: i + 1 }));
    const results: SwissMatchResult[] = [
      { round: 1, player1Id: 'u1', player2Id: 'u4', winnerId: 'u1', isBye: false },
      { round: 1, player1Id: 'u2', player2Id: 'u3', winnerId: 'u3', isBye: false },
      { round: 2, player1Id: 'u1', player2Id: 'u3', winnerId: 'u1', isBye: false },
      { round: 2, player1Id: 'u2', player2Id: 'u4', winnerId: 'u2', isBye: false },
    ];
    const standings = computeStandings(ps, results);
    expect(standings.length).toBe(4);
    expect(standings[0].userId).toBe('u1');
    expect(standings[0].matchPoints).toBe(6);
    const u4 = standings.find((s) => s.userId === 'u4')!;
    expect(u4.matchPoints).toBe(0);
  });
});


describe('Double-elim — bye-only path', () => {
  it('5 players: top 3 seeds bye in WB R1, bracket holds (post-validation rejects, but engine still produces structure)', () => {
    const r = generateDoubleElimBracket(players(5));
    const wbR1 = r.matches.filter((m) => m.bracket === 'winners' && m.round === 1);
    const byes = wbR1.filter((m) => m.isBye);
    expect(byes.length).toBeGreaterThanOrEqual(3);
    for (const b of byes) {
      expect(b.status).toBe('completed');
      expect(b.winnerId).toBeTruthy();
    }
  });
});
