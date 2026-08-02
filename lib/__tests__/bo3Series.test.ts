import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  tournament: { id: 't1', bestOf: 3 as number | null, format: 'elimination' },
  match: {
    id: 'm1', tournamentId: 't1', bracket: 'main', round: 1, matchIndex: 0,
    player1Id: 'u1', player1Username: 'Alice', player2Id: 'u2', player2Username: 'Bob',
    winnerId: null as string | null, winnerUsername: null as string | null,
    isBye: false, status: 'in_progress', roomCode: 'T-m1',
    player1GameWins: 0 as number | null, player2GameWins: 0 as number | null,
    gameId: null as string | null,
  },
  matchUpdates: [] as Array<Record<string, unknown>>,
  participantUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) => {
        if (select?.bestOf) return { bestOf: db.tournament.bestOf };
        if (select?.totalRounds) return { totalRounds: 1, status: 'in_progress' };
        if (select?.format) return { format: db.tournament.format };
        return { ...db.tournament, totalRounds: 1, status: 'in_progress' };
      }),
      update: vi.fn(async () => ({})),
    },
    tournamentMatch: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === db.match.id) return { ...db.match };
        return null;
      }),
      findMany: vi.fn(async () => [{ ...db.match, status: db.match.status }]),
      update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (where.id !== db.match.id) return { id: where.id, ...data };
        db.matchUpdates.push(data);
        Object.assign(db.match, data);
        return { ...db.match };
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    tournamentParticipant: {
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.participantUpdates.push(data);
        return { count: 1 };
      }),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    user: { update: vi.fn(async () => ({ tournamentWins: 1 })), findUnique: vi.fn(async () => null) },
    game: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock('@/lib/socket/server', () => ({
  rooms: new Map(),
  maybeStartTournamentGame: vi.fn(),
  reconcileTournamentRoomSeats: vi.fn(),
  isSeatSocketAlive: vi.fn(() => false),
  clearTournamentInviteTimer: vi.fn(),
  isUserInAnotherLiveGame: vi.fn(() => false),
}));
vi.mock('@/lib/socket/io', () => ({ emitToUser: vi.fn(), isUserConnected: vi.fn(() => true), getOnlineUserIds: vi.fn(() => new Set()) }));
vi.mock('@/lib/quests/hooks', () => ({ emitQuestEvent: vi.fn() }));
vi.mock('@/lib/quests/listenerSetup', () => ({ ensureQuestPersistenceListener: vi.fn() }));
vi.mock('@/lib/discord/tournamentRoles', () => ({ assignTournamentWinnerRole: vi.fn(async () => null), removeTournamentRole: vi.fn(async () => {}) }));
vi.mock('@/lib/discord/tournamentWebhook', () => ({ sendTournamentResults: vi.fn(async () => {}) }));
vi.mock('@/lib/tournament/nwlPrize', () => ({ awardNwlPrizeIfNeeded: vi.fn(async () => {}) }));
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({ finalizeAndScheduleRoomDeletion: vi.fn(), clearAllMatchRoomTimers: vi.fn() }));
vi.mock('@/lib/tournament/absenceManager', () => ({
  startAbsenceTimer: vi.fn(() => new Date(Date.now() + 300000)),
  clearAbsenceTimer: vi.fn(),
  scheduleAbsenceTimerWithDeadline: vi.fn(),
  ABSENCE_TIMEOUT_MS: 300000,
}));

import { handleTournamentMatchEnd } from '@/lib/socket/tournamentHandlers';

const io = { to: () => ({ emit: vi.fn() }) } as never;

function resetMatch(overrides: Partial<typeof db.match> = {}) {
  db.match = {
    id: 'm1', tournamentId: 't1', bracket: 'main', round: 1, matchIndex: 0,
    player1Id: 'u1', player1Username: 'Alice', player2Id: 'u2', player2Username: 'Bob',
    winnerId: null, winnerUsername: null,
    isBye: false, status: 'in_progress', roomCode: 'T-m1',
    player1GameWins: 0, player2GameWins: 0, gameId: null,
    ...overrides,
  };
  db.matchUpdates.length = 0;
  db.participantUpdates.length = 0;
}

describe('best of 3: a match only completes at two game wins', () => {
  beforeEach(() => {
    db.tournament.bestOf = 3;
    resetMatch();
  });

  it('the first game win resets the match to ready with the score 1-0', async () => {
    await handleTournamentMatchEnd(io, 't1', 'm1', 'u1', null);

    expect(db.match.player1GameWins).toBe(1);
    expect(db.match.player2GameWins).toBe(0);
    expect(db.match.status, 'the series is not over, the match must reopen').toBe('ready');
    expect(db.match.winnerId, 'no series winner yet').toBeNull();
    expect(db.match.roomCode, 'the old room reference must be cleared').toBeNull();
    expect(db.participantUpdates.length, 'nobody is eliminated mid series').toBe(0);
  });

  it('an in-game forfeit counts as one game and the series continues', async () => {
    resetMatch({ player1GameWins: 1, player2GameWins: 0 });

    await handleTournamentMatchEnd(io, 't1', 'm1', 'u2', null);

    expect(db.match.player1GameWins).toBe(1);
    expect(db.match.player2GameWins).toBe(1);
    expect(db.match.status, 'one all, a third game is needed').toBe('ready');
    expect(db.match.winnerId).toBeNull();
  });

  it('the second win of the same player closes the series and the match', async () => {
    resetMatch({ player1GameWins: 1, player2GameWins: 1 });

    await handleTournamentMatchEnd(io, 't1', 'm1', 'u1', null);

    expect(db.match.player1GameWins).toBe(2);
    expect(db.match.status).toBe('completed');
    expect(db.match.winnerId).toBe('u1');
    expect(db.participantUpdates.some((u) => u.eliminated === true), 'the loser is eliminated now').toBe(true);
  });

  it('a duplicate report of the same game cannot count a second win', async () => {
    resetMatch({ status: 'ready', player1GameWins: 1, player2GameWins: 0, roomCode: null as unknown as string });

    await handleTournamentMatchEnd(io, 't1', 'm1', 'u1', null);

    expect(db.match.player1GameWins, 'the stray report must not score').toBe(1);
    expect(db.match.status, 'the match stays ready for the next game').toBe('ready');
    expect(db.match.winnerId).toBeNull();
  });

  it('an already decided match ignores late game reports', async () => {
    resetMatch({ status: 'completed', winnerId: 'u1', player1GameWins: 2 });

    await handleTournamentMatchEnd(io, 't1', 'm1', 'u2', null);

    expect(db.match.winnerId).toBe('u1');
    expect(db.match.player2GameWins).toBe(0);
  });

  it('a best of 1 tournament completes on the first game, unchanged', async () => {
    db.tournament.bestOf = 1;
    await handleTournamentMatchEnd(io, 't1', 'm1', 'u2', null);

    expect(db.match.status).toBe('completed');
    expect(db.match.winnerId).toBe('u2');
    expect(db.match.player1GameWins ?? 0).toBe(0);
  });

  it('an old tournament with no stored bestOf behaves as best of 1', async () => {
    db.tournament.bestOf = null;
    await handleTournamentMatchEnd(io, 't1', 'm1', 'u1', null);

    expect(db.match.status).toBe('completed');
    expect(db.match.winnerId).toBe('u1');
  });
});
