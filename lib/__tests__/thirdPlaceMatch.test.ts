import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tournamentMatch: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: { findUnique: vi.fn(), update: vi.fn() },
    deck: { findUnique: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/socket/server', () => ({
  rooms: new Map(),
  getSocketIO: vi.fn(() => null),
}));

vi.mock('@/lib/tournament/absenceManager', () => ({
  startAbsenceTimer: vi.fn(() => new Date(Date.now() + 120_000)),
  clearAbsenceTimer: vi.fn(),
  scheduleAbsenceTimerWithDeadline: vi.fn(),
  ABSENCE_TIMEOUT_MS: 120_000,
}));

vi.mock('@/lib/discord/tournamentRoles', () => ({
  assignTournamentWinnerRole: vi.fn(),
}));

vi.mock('@/lib/discord/tournamentWebhook', () => ({
  sendTournamentResults: vi.fn(),
}));

vi.mock('@/lib/data/cardIndex', () => ({
  getCharacterById: vi.fn(),
  getMissionById: vi.fn(),
}));

vi.mock('@/lib/tournament/matchRoomCleanup', () => ({
  finalizeAndScheduleRoomDeletion: vi.fn(),
}));

vi.mock('@/lib/tournament/matchEventLog', () => ({
  logMatchEvent: vi.fn(),
}));

vi.mock('@/lib/tournament/nwlPrize', () => ({
  awardNwlPrizeIfNeeded: vi.fn().mockResolvedValue(undefined),
  retryPendingNwlPrizes: vi.fn().mockResolvedValue({ retried: 0 }),
}));

import { prisma } from '@/lib/db/prisma';
import { sendTournamentResults } from '@/lib/discord/tournamentWebhook';
import { advanceMatchWinner } from '../socket/tournamentHandlers';
import { generateBracket, MAIN_BRACKET, THIRD_PLACE_BRACKET } from '../tournament/tournamentEngine';
import { buildTournamentResultsView, buildEliminationPrizeUserIds } from '../tournament/resultsView';
import type { TournamentData, TournamentMatch } from '@/stores/tournamentStore';

const p = prisma as never as {
  tournament: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  tournamentParticipant: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  tournamentMatch: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  deck: { findUnique: ReturnType<typeof vi.fn> };
};

interface Row {
  id: string;
  bracket: string;
  round: number;
  matchIndex: number;
  player1Id: string | null;
  player2Id: string | null;
  player1Username: string | null;
  player2Username: string | null;
  winnerId: string | null;
  winnerUsername: string | null;
  isBye: boolean;
  status: string;
}

function row(overrides: Partial<Row> & { id: string; round: number; matchIndex: number }): Row {
  return {
    bracket: MAIN_BRACKET,
    player1Id: null,
    player2Id: null,
    player1Username: null,
    player2Username: null,
    winnerId: null,
    winnerUsername: null,
    isBye: false,
    status: 'pending',
    ...overrides,
  };
}

function installFakeMatchTable(rows: Row[]) {
  p.tournamentMatch.findUnique.mockImplementation((args: { where: Record<string, unknown> }) => {
    const where = args.where as {
      id?: string;
      tournamentId_bracket_round_matchIndex?: { bracket: string; round: number; matchIndex: number };
    };
    if (where.id) return Promise.resolve(rows.find((r) => r.id === where.id) ?? null);
    const key = where.tournamentId_bracket_round_matchIndex;
    if (!key) return Promise.resolve(null);
    return Promise.resolve(
      rows.find((r) => r.bracket === key.bracket && r.round === key.round && r.matchIndex === key.matchIndex) ?? null,
    );
  });
  p.tournamentMatch.update.mockImplementation((args: { where: { id: string }; data: Partial<Row> }) => {
    const target = rows.find((r) => r.id === args.where.id);
    if (!target) return Promise.resolve(null);
    Object.assign(target, args.data);
    return Promise.resolve({ ...target });
  });
  p.tournamentMatch.findMany.mockImplementation((args?: { where?: { round?: number } }) => {
    const round = args?.where?.round;
    return Promise.resolve(rows.filter((r) => round === undefined || r.round === round).map((r) => ({ ...r })));
  });
}

function fourPlayerRows(): Row[] {
  return [
    row({ id: 'sf1', round: 1, matchIndex: 0, player1Id: 'p1', player1Username: 'P1', player2Id: 'p3', player2Username: 'P3', status: 'ready' }),
    row({ id: 'sf2', round: 1, matchIndex: 1, player1Id: 'p2', player1Username: 'P2', player2Id: 'p4', player2Username: 'P4', status: 'ready' }),
    row({ id: 'final', round: 2, matchIndex: 0 }),
    row({ id: 'third', bracket: THIRD_PLACE_BRACKET, round: 2, matchIndex: 0 }),
  ];
}

beforeEach(() => {
  for (const model of Object.values(p)) {
    if (typeof model === 'object' && model !== null) {
      for (const fn of Object.values(model as Record<string, unknown>)) {
        if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
  p.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
  p.tournamentMatch.updateMany.mockResolvedValue({ count: 0 });
});


describe('generateBracket — third place match', () => {
  const players = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` }));

  it('creates a third place match for 4 players, at the final round, in its own bracket', () => {
    const r = generateBracket(players(4));
    expect(r.thirdPlaceMatch).not.toBeNull();
    expect(r.thirdPlaceMatch!.bracket).toBe(THIRD_PLACE_BRACKET);
    expect(r.thirdPlaceMatch!.round).toBe(r.totalRounds);
    expect(r.thirdPlaceMatch!.matchIndex).toBe(0);
    expect(r.thirdPlaceMatch!.status).toBe('pending');
    expect(r.thirdPlaceMatch!.player1.participantId).toBeNull();
    expect(r.thirdPlaceMatch!.player2.participantId).toBeNull();
  });

  it('keeps the main bracket untouched: N-1 matches, all tagged main', () => {
    for (const n of [4, 8, 16, 32]) {
      const r = generateBracket(players(n));
      expect(r.matches.length).toBe(n - 1);
      expect(r.matches.every((m) => m.bracket === MAIN_BRACKET)).toBe(true);
    }
  });

  it('never creates a third place match for a 2 player bracket', () => {
    const r = generateBracket(players(2));
    expect(r.thirdPlaceMatch).toBeNull();
  });
});


describe('advanceMatchWinner — routing semifinal losers into the third place match', () => {
  it('first semifinal loser takes the player1 slot, second takes player2 and the match becomes ready', async () => {
    const rows = fourPlayerRows();
    installFakeMatchTable(rows);
    const third = () => rows.find((r) => r.id === 'third')!;

    await advanceMatchWinner(null, 't1', { ...rows[0] }, 'p1', 'P1');
    rows[0].winnerId = 'p1';
    rows[0].status = 'completed';

    expect(third().player1Id).toBe('p3');
    expect(third().player2Id).toBeNull();
    expect(third().status).toBe('pending');

    await advanceMatchWinner(null, 't1', { ...rows[1] }, 'p2', 'P2');
    rows[1].winnerId = 'p2';
    rows[1].status = 'completed';

    expect(third().player1Id).toBe('p3');
    expect(third().player2Id).toBe('p4');
    expect(third().status).toBe('ready');
    expect(third().winnerId).toBeNull();
  });

  it('does not touch the third place match when it is no longer pending', async () => {
    const rows = fourPlayerRows();
    const third = rows.find((r) => r.id === 'third')!;
    third.status = 'in_progress';
    third.player1Id = 'p3';
    third.player1Username = 'P3';
    installFakeMatchTable(rows);

    await advanceMatchWinner(null, 't1', { ...rows[1] }, 'p2', 'P2');

    expect(third.player2Id).toBeNull();
    expect(third.status).toBe('in_progress');
  });

  it('walkover: when the sibling semifinal is a bye, the lone loser wins third place directly', async () => {
    const rows = fourPlayerRows();
    const sf2 = rows.find((r) => r.id === 'sf2')!;
    sf2.isBye = true;
    sf2.player2Id = null;
    sf2.player2Username = null;
    sf2.winnerId = 'p2';
    sf2.status = 'completed';
    installFakeMatchTable(rows);

    await advanceMatchWinner(null, 't1', { ...rows[0] }, 'p1', 'P1');

    const third = rows.find((r) => r.id === 'third')!;
    expect(third.player1Id).toBe('p3');
    expect(third.winnerId).toBe('p3');
    expect(third.status).toBe('completed');
  });

  it('legacy bracket with no third place match: semifinal completion changes nothing extra', async () => {
    const rows = fourPlayerRows().filter((r) => r.bracket === MAIN_BRACKET);
    installFakeMatchTable(rows);

    await advanceMatchWinner(null, 't1', { ...rows[0] }, 'p1', 'P1');

    expect(rows.find((r) => r.id === 'final')!.player1Id).toBe('p1');
    expect(rows.some((r) => r.bracket === THIRD_PLACE_BRACKET)).toBe(false);
  });
});


describe('advanceMatchWinner — the third place match never crowns a champion', () => {
  it('completing the third place match leaves the tournament untouched', async () => {
    const rows = fourPlayerRows();
    installFakeMatchTable(rows);
    const third = rows.find((r) => r.id === 'third')!;
    third.player1Id = 'p3';
    third.player2Id = 'p4';
    third.status = 'ready';

    await advanceMatchWinner(null, 't1', { ...third }, 'p3', 'P3');

    expect(p.tournament.update).not.toHaveBeenCalled();
    expect(p.tournamentMatch.findUnique).not.toHaveBeenCalled();
  });

  it('the final still completes the tournament while the third place match is unfinished', async () => {
    const rows = fourPlayerRows();
    const finalRow = rows.find((r) => r.id === 'final')!;
    finalRow.player1Id = 'p1';
    finalRow.player1Username = 'P1';
    finalRow.player2Id = 'p2';
    finalRow.player2Username = 'P2';
    finalRow.status = 'ready';
    const third = rows.find((r) => r.id === 'third')!;
    third.player1Id = 'p3';
    third.player2Id = 'p4';
    third.status = 'ready';
    installFakeMatchTable(rows);

    p.tournament.findUnique.mockImplementation((args: { select?: unknown; include?: unknown }) => {
      if (args.select) return Promise.resolve({ totalRounds: 2, status: 'in_progress', format: 'elimination', gameMode: 'classic' });
      if (args.include) return Promise.resolve({ name: 'Cup', matches: rows.map((r) => ({ ...r })), _count: { participants: 4 } });
      return Promise.resolve(null);
    });
    p.tournamentParticipant.findFirst.mockResolvedValue(null);
    p.user.update.mockResolvedValue({ tournamentWins: 1 });
    p.tournament.update.mockResolvedValue({});

    await advanceMatchWinner(null, 't1', { ...finalRow }, 'p1', 'P1');

    const completion = p.tournament.update.mock.calls.find((c: unknown[]) => {
      const arg = c[0] as { data: { status?: string; winnerId?: string } };
      return arg.data.status === 'completed';
    });
    expect(completion).toBeTruthy();
    expect((completion![0] as { data: { winnerId?: string } }).data.winnerId).toBe('p1');
  });
});


describe('advanceMatchWinner — results announcement waits for the playoff', () => {
  const webhook = vi.mocked(sendTournamentResults);

  function seededRows(): Row[] {
    const rows = fourPlayerRows();
    const sf1 = rows.find((r) => r.id === 'sf1')!;
    sf1.winnerId = 'p1'; sf1.winnerUsername = 'P1'; sf1.status = 'completed';
    const sf2 = rows.find((r) => r.id === 'sf2')!;
    sf2.winnerId = 'p2'; sf2.winnerUsername = 'P2'; sf2.status = 'completed';
    const finalRow = rows.find((r) => r.id === 'final')!;
    finalRow.player1Id = 'p1'; finalRow.player1Username = 'P1';
    finalRow.player2Id = 'p2'; finalRow.player2Username = 'P2';
    finalRow.status = 'ready';
    const third = rows.find((r) => r.id === 'third')!;
    third.player1Id = 'p3'; third.player1Username = 'P3';
    third.player2Id = 'p4'; third.player2Username = 'P4';
    third.status = 'ready';
    return rows;
  }

  function mockTournament(tournamentId: string, rows: Row[], status: string) {
    p.tournament.findUnique.mockImplementation((args: { select?: unknown; include?: unknown }) => {
      if (args.select) return Promise.resolve({ totalRounds: 2, status: 'in_progress', format: 'elimination', gameMode: 'classic' });
      if (args.include) {
        return Promise.resolve({
          id: tournamentId,
          name: 'Cup',
          status,
          winnerId: 'p1',
          winnerUsername: 'P1',
          matches: rows.map((r) => ({ ...r })),
          _count: { participants: 4 },
        });
      }
      return Promise.resolve(null);
    });
    p.tournamentParticipant.findFirst.mockResolvedValue(null);
    p.user.update.mockResolvedValue({ tournamentWins: 1 });
    p.tournament.update.mockResolvedValue({});
  }

  it('holds the results announcement back while the playoff is still open', async () => {
    webhook.mockClear();
    const rows = seededRows();
    installFakeMatchTable(rows);
    mockTournament('t-defer', rows, 'completed');

    await advanceMatchWinner(null, 't-defer', { ...rows.find((r) => r.id === 'final')! }, 'p1', 'P1');

    expect(webhook).not.toHaveBeenCalled();
  });

  it('announces the full podium once the playoff is decided', async () => {
    webhook.mockClear();
    const rows = seededRows();
    const third = rows.find((r) => r.id === 'third')!;
    third.status = 'completed';
    third.winnerId = 'p4';
    third.winnerUsername = 'P4';
    const finalRow = rows.find((r) => r.id === 'final')!;
    finalRow.status = 'completed';
    finalRow.winnerId = 'p1';
    finalRow.winnerUsername = 'P1';
    installFakeMatchTable(rows);
    mockTournament('t-announce', rows, 'completed');

    await advanceMatchWinner(null, 't-announce', { ...third }, 'p4', 'P4');

    expect(webhook).toHaveBeenCalledTimes(1);
    const podium = webhook.mock.calls[0][1];
    expect(podium).toEqual([
      { userId: 'p1', username: 'P1', place: 1 },
      { userId: 'p2', username: 'P2', place: 2 },
      { userId: 'p4', username: 'P4', place: 3 },
    ]);
  });

  it('legacy tournament with no playoff still announces its podium immediately', async () => {
    webhook.mockClear();
    const rows = seededRows().filter((r) => r.bracket === MAIN_BRACKET);
    installFakeMatchTable(rows);
    mockTournament('t-legacy', rows, 'completed');

    await advanceMatchWinner(null, 't-legacy', { ...rows.find((r) => r.id === 'final')! }, 'p1', 'P1');

    expect(webhook).toHaveBeenCalledTimes(1);
    const podium = webhook.mock.calls[0][1];
    expect(podium).toEqual([
      { userId: 'p1', username: 'P1', place: 1 },
      { userId: 'p2', username: 'P2', place: 2 },
      { userId: 'p3', username: 'P3', place: 3 },
    ]);
  });
});


function makeMatch(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm-default',
    tournamentId: 't1',
    bracket: MAIN_BRACKET,
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
    name: 'Cup',
    type: 'simulator',
    status: 'completed',
    gameMode: 'classic',
    maxPlayers: 8,
    currentRound: 2,
    totalRounds: 2,
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
    format: 'elimination',
    winnerId: 'p1',
    winnerUsername: 'P1',
    participants: [],
    matches: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const semisAndFinal = [
  makeMatch({ id: 'sf1', round: 1, matchIndex: 0, status: 'completed', player1Id: 'p1', player1Username: 'P1', player2Id: 'p3', player2Username: 'P3', winnerId: 'p1', winnerUsername: 'P1' }),
  makeMatch({ id: 'sf2', round: 1, matchIndex: 1, status: 'completed', player1Id: 'p2', player1Username: 'P2', player2Id: 'p4', player2Username: 'P4', winnerId: 'p2', winnerUsername: 'P2' }),
  makeMatch({ id: 'final', round: 2, matchIndex: 0, status: 'completed', player1Id: 'p1', player1Username: 'P1', player2Id: 'p2', player2Username: 'P2', winnerId: 'p1', winnerUsername: 'P1' }),
];

describe('resultsView — third place decided by the playoff', () => {
  it('podium place 3 is the third place match winner, its loser is not on the podium', () => {
    const t = makeTournament({
      matches: [
        ...semisAndFinal,
        makeMatch({ id: 'third', bracket: THIRD_PLACE_BRACKET, round: 2, matchIndex: 0, status: 'completed', player1Id: 'p3', player1Username: 'P3', player2Id: 'p4', player2Username: 'P4', winnerId: 'p4', winnerUsername: 'P4' }),
      ],
    });
    const view = buildTournamentResultsView(t);
    expect(view.podium.map((e) => e.userId)).toEqual(['p1', 'p2', 'p4']);
    expect(view.podium.find((e) => e.userId === 'p3')).toBeUndefined();
  });

  it('prize list has exactly one place 3 entry when the playoff is decided', () => {
    const t = makeTournament({
      matches: [
        ...semisAndFinal,
        makeMatch({ id: 'third', bracket: THIRD_PLACE_BRACKET, round: 2, matchIndex: 0, status: 'forfeit', player1Id: 'p3', player1Username: 'P3', player2Id: 'p4', player2Username: 'P4', winnerId: 'p3', winnerUsername: 'P3' }),
      ],
    });
    const prizes = buildEliminationPrizeUserIds(t);
    expect(prizes).toEqual([
      { userId: 'p1', place: 1 },
      { userId: 'p2', place: 2 },
      { userId: 'p3', place: 3 },
    ]);
  });

  it('walkover third place match still awards place 3', () => {
    const t = makeTournament({
      matches: [
        ...semisAndFinal,
        makeMatch({ id: 'third', bracket: THIRD_PLACE_BRACKET, round: 2, matchIndex: 0, status: 'completed', isBye: true, player1Id: 'p3', player1Username: 'P3', player2Id: null, player2Username: null, winnerId: 'p3', winnerUsername: 'P3' }),
      ],
    });
    expect(buildEliminationPrizeUserIds(t).filter((e) => e.place === 3)).toEqual([{ userId: 'p3', place: 3 }]);
    expect(buildTournamentResultsView(t).podium.find((e) => e.place === 3)?.userId).toBe('p3');
  });

  it('an undecided third place match yields no place 3 rather than a guess', () => {
    const t = makeTournament({
      matches: [
        ...semisAndFinal,
        makeMatch({ id: 'third', bracket: THIRD_PLACE_BRACKET, round: 2, matchIndex: 0, status: 'ready', player1Id: 'p3', player1Username: 'P3', player2Id: 'p4', player2Username: 'P4' }),
      ],
    });
    expect(buildEliminationPrizeUserIds(t).some((e) => e.place === 3)).toBe(false);
    expect(buildTournamentResultsView(t).podium.map((e) => e.place)).toEqual([1, 2]);
  });

  it('legacy tournament with no third place match keeps the old podium and the old prize list', () => {
    const t = makeTournament({ matches: semisAndFinal });
    expect(buildEliminationPrizeUserIds(t)).toEqual([
      { userId: 'p1', place: 1 },
      { userId: 'p2', place: 2 },
      { userId: 'p3', place: 3 },
      { userId: 'p4', place: 3 },
    ]);
    const podium = buildTournamentResultsView(t).podium;
    expect(podium.map((e) => e.userId)).toEqual(['p1', 'p2', 'p3']);
  });
});
