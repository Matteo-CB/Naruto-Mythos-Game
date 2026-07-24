import { describe, it, expect } from 'vitest';
import { buildEliminationPrizeUserIds } from '@/lib/tournament/resultsView';
import type { TournamentData, TournamentMatch } from '@/stores/tournamentStore';

function makeMatch(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm-default',
    tournamentId: 't1',
    bracket: 'main',
    round: 1,
    matchIndex: 0,
    player1Id: 'p1',
    player2Id: 'p2',
    player1Username: 'P1',
    player2Username: 'P2',
    winnerId: null,
    winnerUsername: null,
    isBye: false,
    status: 'ready',
    roomCode: null,
    gameId: null,
    absenceDeadline: null,
    absentPlayerId: null,
    ...overrides,
  };
}

function makeTournament(overrides: Partial<TournamentData> = {}): TournamentData {
  return {
    id: 't1',
    name: 'NWL',
    type: 'simulator',
    status: 'completed',
    gameMode: 'classic',
    maxPlayers: 16,
    currentRound: 2,
    totalRounds: 2,
    isPublic: true,
    joinCode: null,
    creatorId: 'creator',
    creatorUsername: 'creator',
    requiresDiscord: false,
    useBanList: true,
    sealedBoosterCount: null,
    sealedSetChoice: null,
    discordRoleReward: null,
    bannedCardIds: [],
    allowedLeagues: [],
    winnerId: 'p1',
    winnerUsername: 'P1',
    participants: [],
    matches: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function placesOf(result: { userId: string; place: 1 | 2 | 3 }[], place: 1 | 2 | 3): string[] {
  return result.filter((r) => r.place === place).map((r) => r.userId).sort();
}

describe('NWL Chunin podium — buildEliminationPrizeUserIds', () => {
  it('4-player bracket: top 3 = winner + finalist + BOTH semifinalists (4 people)', () => {
    const t = makeTournament({
      format: 'elimination',
      winnerId: 'p1',
      matches: [
        makeMatch({ id: 'sf1', round: 1, matchIndex: 0, status: 'completed', player1Id: 'p1', player1Username: 'P1', player2Id: 'p3', player2Username: 'P3', winnerId: 'p1', winnerUsername: 'P1' }),
        makeMatch({ id: 'sf2', round: 1, matchIndex: 1, status: 'completed', player1Id: 'p2', player1Username: 'P2', player2Id: 'p4', player2Username: 'P4', winnerId: 'p2', winnerUsername: 'P2' }),
        makeMatch({ id: 'final', round: 2, matchIndex: 0, status: 'completed', player1Id: 'p1', player1Username: 'P1', player2Id: 'p2', player2Username: 'P2', winnerId: 'p1', winnerUsername: 'P1' }),
      ],
    });
    const r = buildEliminationPrizeUserIds(t);
    expect(placesOf(r, 1)).toEqual(['p1']);
    expect(placesOf(r, 2)).toEqual(['p2']);
    expect(placesOf(r, 3)).toEqual(['p3', 'p4']);
    expect(r).toHaveLength(4);
  });

  it('8-player bracket: quarterfinal losers are NOT in the podium', () => {
    const t = makeTournament({
      format: 'elimination',
      currentRound: 3,
      totalRounds: 3,
      winnerId: 'p1',
      matches: [
        makeMatch({ id: 'q1', round: 1, matchIndex: 0, status: 'completed', player1Id: 'p1', player2Id: 'p5', winnerId: 'p1' }),
        makeMatch({ id: 'q2', round: 1, matchIndex: 1, status: 'completed', player1Id: 'p2', player2Id: 'p6', winnerId: 'p2' }),
        makeMatch({ id: 'q3', round: 1, matchIndex: 2, status: 'completed', player1Id: 'p3', player2Id: 'p7', winnerId: 'p3' }),
        makeMatch({ id: 'q4', round: 1, matchIndex: 3, status: 'completed', player1Id: 'p4', player2Id: 'p8', winnerId: 'p4' }),
        makeMatch({ id: 'sf1', round: 2, matchIndex: 0, status: 'completed', player1Id: 'p1', player2Id: 'p3', winnerId: 'p1' }),
        makeMatch({ id: 'sf2', round: 2, matchIndex: 1, status: 'completed', player1Id: 'p2', player2Id: 'p4', winnerId: 'p2' }),
        makeMatch({ id: 'final', round: 3, matchIndex: 0, status: 'completed', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
      ],
    });
    const r = buildEliminationPrizeUserIds(t);
    expect(placesOf(r, 1)).toEqual(['p1']);
    expect(placesOf(r, 2)).toEqual(['p2']);
    expect(placesOf(r, 3)).toEqual(['p3', 'p4']);
    const all = r.map((x) => x.userId);
    for (const q of ['p5', 'p6', 'p7', 'p8']) expect(all).not.toContain(q);
  });

  it('bye semifinal: the bye side has no loser, so only one place-3 finisher', () => {
    const t = makeTournament({
      format: 'elimination',
      winnerId: 'p1',
      matches: [
        makeMatch({ id: 'sf1', round: 1, matchIndex: 0, status: 'completed', player1Id: 'p1', player2Id: 'p3', winnerId: 'p1' }),
        makeMatch({ id: 'sf2', round: 1, matchIndex: 1, isBye: true, status: 'completed', player1Id: 'p2', player2Id: null, winnerId: 'p2' }),
        makeMatch({ id: 'final', round: 2, matchIndex: 0, status: 'completed', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
      ],
    });
    const r = buildEliminationPrizeUserIds(t);
    expect(placesOf(r, 1)).toEqual(['p1']);
    expect(placesOf(r, 2)).toEqual(['p2']);
    expect(placesOf(r, 3)).toEqual(['p3']);
    expect(r).toHaveLength(3);
  });

  it('final won by forfeit: the finalist is still awarded place 2', () => {
    const t = makeTournament({
      format: 'elimination',
      winnerId: 'p1',
      matches: [
        makeMatch({ id: 'sf1', round: 1, matchIndex: 0, status: 'completed', player1Id: 'p1', player2Id: 'p3', winnerId: 'p1' }),
        makeMatch({ id: 'sf2', round: 1, matchIndex: 1, status: 'completed', player1Id: 'p2', player2Id: 'p4', winnerId: 'p2' }),
        makeMatch({ id: 'final', round: 2, matchIndex: 0, status: 'forfeit', player1Id: 'p1', player2Id: 'p2', winnerId: 'p1' }),
      ],
    });
    const r = buildEliminationPrizeUserIds(t);
    expect(placesOf(r, 2)).toEqual(['p2']);
  });

  it('no winner yet: returns an empty prize list', () => {
    const t = makeTournament({ format: 'elimination', winnerId: null, winnerUsername: null });
    expect(buildEliminationPrizeUserIds(t)).toEqual([]);
  });
});
