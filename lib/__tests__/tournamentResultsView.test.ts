import { describe, it, expect } from 'vitest';
import { buildTournamentResultsView } from '@/lib/tournament/resultsView';
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
    name: 'T1',
    type: 'simulator',
    status: 'completed',
    gameMode: 'classic',
    maxPlayers: 8,
    currentRound: 3,
    totalRounds: 3,
    isPublic: true,
    joinCode: null,
    creatorId: 'creator',
    creatorUsername: 'creator',
    requiresDiscord: false,
    useBanList: false,
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

describe('buildTournamentResultsView — Fix #3 results clarity', () => {
  it('returns null champion when tournament has no winner', () => {
    const t = makeTournament({ winnerId: null, winnerUsername: null });
    const view = buildTournamentResultsView(t);
    expect(view.champion).toBeNull();
  });

  it('classifies match outcomes correctly', () => {
    const t = makeTournament({
      format: 'swiss',
      matches: [
        makeMatch({ id: 'm-played', status: 'completed', winnerId: 'p1', winnerUsername: 'P1', round: 1 }),
        makeMatch({ id: 'm-forfeit', status: 'forfeit', winnerId: 'p2', winnerUsername: 'P2', round: 1, matchIndex: 1 }),
        makeMatch({ id: 'm-double', status: 'forfeit', winnerId: null, winnerUsername: null, round: 1, matchIndex: 2, player1Id: 'p3', player2Id: 'p4', player1Username: 'P3', player2Username: 'P4' }),
        makeMatch({ id: 'm-bye', isBye: true, status: 'completed', winnerId: 'p5', winnerUsername: 'P5', round: 1, matchIndex: 3 }),
      ],
    });

    const view = buildTournamentResultsView(t);
    const byId = (id: string) => view.entries.find((e) => e.matchId === id)!;
    expect(byId('m-played').outcome).toBe('win_played');
    expect(byId('m-forfeit').outcome).toBe('win_forfeit');
    expect(byId('m-double').outcome).toBe('double_forfeit');
    expect(byId('m-double').doubleForfeitUsernames).toEqual(['P3', 'P4']);
    expect(byId('m-bye').outcome).toBe('bye');
  });

  it('includes forfeit matches in entries (regression: prior version hid them)', () => {
    const t = makeTournament({
      format: 'swiss',
      matches: [
        makeMatch({ id: 'm1', status: 'forfeit', winnerId: 'p1', winnerUsername: 'P1', round: 1 }),
        makeMatch({ id: 'm2', status: 'forfeit', winnerId: null, round: 1, matchIndex: 1, player1Username: 'P3', player2Username: 'P4' }),
      ],
    });

    const view = buildTournamentResultsView(t);
    expect(view.entries).toHaveLength(2);
    expect(view.forfeitCount).toBe(1);
    expect(view.doubleForfeitCount).toBe(1);
  });

  it('sorts entries by round descending (most recent first)', () => {
    const t = makeTournament({
      format: 'swiss',
      matches: [
        makeMatch({ id: 'm-r1', round: 1, status: 'completed', winnerId: 'p1' }),
        makeMatch({ id: 'm-r3', round: 3, status: 'completed', winnerId: 'p1' }),
        makeMatch({ id: 'm-r2', round: 2, status: 'completed', winnerId: 'p1' }),
      ],
    });

    const view = buildTournamentResultsView(t);
    expect(view.entries.map((e) => e.matchId)).toEqual(['m-r3', 'm-r2', 'm-r1']);
  });

  it('Swiss: podium uses tournament.standings when available', () => {
    const t = makeTournament({
      format: 'swiss',
      standings: [
        { userId: 'p1', username: 'P1', rank: 1, wins: 3, losses: 0, draws: 0, matchPoints: 9, buchholz: 0, buchholzExtended: 0, seed: 1, opponents: [], hadBye: false },
        { userId: 'p2', username: 'P2', rank: 2, wins: 2, losses: 1, draws: 0, matchPoints: 6, buchholz: 0, buchholzExtended: 0, seed: 2, opponents: [], hadBye: false },
        { userId: 'p3', username: 'P3', rank: 3, wins: 2, losses: 1, draws: 0, matchPoints: 6, buchholz: 0, buchholzExtended: 0, seed: 3, opponents: [], hadBye: false },
        { userId: 'p4', username: 'P4', rank: 4, wins: 1, losses: 2, draws: 0, matchPoints: 3, buchholz: 0, buchholzExtended: 0, seed: 4, opponents: [], hadBye: false },
      ],
    });

    const view = buildTournamentResultsView(t);
    expect(view.podium).toHaveLength(3);
    expect(view.podium[0]).toEqual({ userId: 'p1', username: 'P1', place: 1 });
    expect(view.podium[1]).toEqual({ userId: 'p2', username: 'P2', place: 2 });
    expect(view.podium[2]).toEqual({ userId: 'p3', username: 'P3', place: 3 });
  });

  it('Swiss: podium falls back to champion-only when standings missing', () => {
    const t = makeTournament({ format: 'swiss', standings: undefined });
    const view = buildTournamentResultsView(t);
    expect(view.podium).toHaveLength(1);
    expect(view.podium[0]).toEqual({ userId: 'p1', username: 'P1', place: 1 });
  });

  it('Elimination: podium = winner + finalist + semi-loser', () => {
    const t = makeTournament({
      format: 'elimination',
      matches: [
        makeMatch({ id: 'sf1', round: 1, status: 'completed', winnerId: 'p1', winnerUsername: 'P1', player2Id: 'p3', player2Username: 'P3' }),
        makeMatch({ id: 'sf2', round: 1, matchIndex: 1, status: 'completed', winnerId: 'p2', winnerUsername: 'P2', player1Id: 'p4', player1Username: 'P4', player2Id: 'p2', player2Username: 'P2' }),
        makeMatch({ id: 'final', round: 2, status: 'completed', winnerId: 'p1', winnerUsername: 'P1', player1Id: 'p1', player1Username: 'P1', player2Id: 'p2', player2Username: 'P2' }),
      ],
    });

    const view = buildTournamentResultsView(t);
    expect(view.podium[0]).toEqual({ userId: 'p1', username: 'P1', place: 1 });
    expect(view.podium[1]).toEqual({ userId: 'p2', username: 'P2', place: 2 });
    expect(view.podium.find((p) => p.place === 3)).toBeDefined();
  });

  it('counts forfeits + double-forfeits separately', () => {
    const t = makeTournament({
      format: 'swiss',
      matches: [
        makeMatch({ id: 'a', status: 'forfeit', winnerId: 'p1', round: 1 }),
        makeMatch({ id: 'b', status: 'forfeit', winnerId: 'p2', round: 1, matchIndex: 1 }),
        makeMatch({ id: 'c', status: 'forfeit', winnerId: null, round: 2, player1Username: 'P3', player2Username: 'P4' }),
        makeMatch({ id: 'd', status: 'completed', winnerId: 'p1', round: 2, matchIndex: 1 }),
      ],
    });
    const view = buildTournamentResultsView(t);
    expect(view.forfeitCount).toBe(2);
    expect(view.doubleForfeitCount).toBe(1);
  });

  it('regression: the 2026-05-12 Tournament 1 produces meaningful results (forfeits visible)', () => {
    const t = makeTournament({
      format: 'swiss',
      winnerId: 'yclooney',
      winnerUsername: 'yclooney',
      matches: [
        makeMatch({ id: 'r1m0', round: 1, status: 'completed', winnerId: 'p_traf', winnerUsername: 'Trafalgar', player1Username: 'yass_1613', player2Username: 'Trafalgar' }),
        makeMatch({ id: 'r1m2', round: 1, matchIndex: 2, status: 'forfeit', winnerId: 'p_ycloo', winnerUsername: 'yclooney', player1Username: 'Princexviii', player2Username: 'yclooney' }),
        makeMatch({ id: 'r3m1', round: 3, matchIndex: 1, status: 'forfeit', winnerId: null, player1Username: 'Trafalgar', player2Username: 'mak52554' }),
        makeMatch({ id: 'r3m3', round: 3, matchIndex: 3, status: 'forfeit', winnerId: null, player1Username: 'legoubz', player2Username: 'Mister_Mrozikk' }),
      ],
    });

    const view = buildTournamentResultsView(t);
    expect(view.entries).toHaveLength(4);
    expect(view.forfeitCount).toBe(1);
    expect(view.doubleForfeitCount).toBe(2);
    const r3DoubleFf = view.entries.filter((e) => e.round === 3 && e.outcome === 'double_forfeit');
    expect(r3DoubleFf).toHaveLength(2);
    expect(r3DoubleFf[0].doubleForfeitUsernames.length).toBe(2);
  });
});
