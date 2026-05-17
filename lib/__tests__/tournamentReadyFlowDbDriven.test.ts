import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
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

import { prisma } from '@/lib/db/prisma';
import { registerTournamentHandlers, advanceMatchWinner, cleanupTournamentMapsByIds } from '../socket/tournamentHandlers';

const p = prisma as never as {
  tournament: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tournamentParticipant: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  tournamentMatch: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  deck: { findUnique: ReturnType<typeof vi.fn> };
};

interface FakeSocket {
  data: { userId?: string };
  joined: string[];
  emitted: Array<{ event: string; data: unknown }>;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  join(room: string): void;
  leave(room: string): void;
  emit(event: string, data: unknown): void;
  handlers: Record<string, (...args: unknown[]) => unknown>;
}

function fakeSocket(userId?: string): FakeSocket {
  const sock: FakeSocket = {
    data: userId ? { userId } : {},
    joined: [],
    emitted: [],
    handlers: {},
    on(event, handler) { this.handlers[event] = handler; },
    join(room) { this.joined.push(room); },
    leave(room) { this.joined = this.joined.filter(r => r !== room); },
    emit(event, data) { this.emitted.push({ event, data }); },
  };
  return sock;
}

function fakeIO() {
  const emitSpy = vi.fn();
  return {
    to: vi.fn(() => ({ emit: emitSpy })),
    sockets: { sockets: new Map() },
    _emitSpy: emitSpy,
  };
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




describe('tournament:ready — server-restart resilience (the "ready never advances" bug)', () => {
  it('after server restart, the 2nd ready emit detects DB absentPlayerId === userId and starts the match', async () => {
    cleanupTournamentMapsByIds('t1', ['m-restart']);

    const io = fakeIO();
    const sock = fakeSocket('p2');

    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm-restart',
      tournamentId: 't1',
      player1Id: 'p1',
      player2Id: 'p2',
      status: 'ready',
      roomCode: null,
      absentPlayerId: 'p2',
      absenceDeadline: new Date(Date.now() + 60_000),
    });
    p.tournament.findUnique.mockResolvedValue({ gameMode: 'casual', sealedBoosterCount: null, sealedSetChoice: null });
    p.tournamentParticipant.findFirst.mockResolvedValue(null);
    p.tournamentMatch.update.mockResolvedValue({});

    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm-restart', userId: 'p2' });

    const updateCalls = p.tournamentMatch.update.mock.calls;
    const startedMatchUpdate = updateCalls.find((c: unknown[]) => {
      const arg = c[0] as { data: { status?: string } };
      return arg.data.status === 'in_progress';
    });
    expect(startedMatchUpdate).toBeTruthy();
  });

  it('first ready emit (DB clean) sets absentPlayerId to the OTHER player', async () => {
    cleanupTournamentMapsByIds('t1', ['m-first']);

    const io = fakeIO();
    const sock = fakeSocket('p1');

    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm-first',
      tournamentId: 't1',
      player1Id: 'p1',
      player2Id: 'p2',
      status: 'ready',
      roomCode: null,
      absentPlayerId: null,
      absenceDeadline: null,
    });
    p.tournamentMatch.update.mockResolvedValue({});

    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm-first', userId: 'p1' });

    const updateArgs = p.tournamentMatch.update.mock.calls[0][0] as { data: { absentPlayerId?: string; status?: string } };
    expect(updateArgs.data.absentPlayerId).toBe('p2');
    expect(updateArgs.data.status).toBeUndefined();
  });

  it('re-emit by same player (re-mount / refresh) is a no-op: does NOT reset the absence timer or re-update DB', async () => {
    const { startAbsenceTimer } = await import('@/lib/tournament/absenceManager');
    (startAbsenceTimer as ReturnType<typeof vi.fn>).mockClear();
    cleanupTournamentMapsByIds('t1', ['m-refresh']);

    const io = fakeIO();
    const sock = fakeSocket('p1');

    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm-refresh',
      tournamentId: 't1',
      player1Id: 'p1',
      player2Id: 'p2',
      status: 'ready',
      roomCode: null,
      absentPlayerId: 'p2',
      absenceDeadline: new Date(Date.now() + 60_000),
    });
    p.tournamentMatch.update.mockResolvedValue({});

    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm-refresh', userId: 'p1' });

    expect(startAbsenceTimer).not.toHaveBeenCalled();
    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
  });

  it('both players emit ready within same process: bothReady triggers match start', async () => {
    cleanupTournamentMapsByIds('t1', ['m-rapid']);

    const io = fakeIO();
    const sockP1 = fakeSocket('p1');
    const sockP2 = fakeSocket('p2');

    const matchSnapshots = [
      { id: 'm-rapid', tournamentId: 't1', player1Id: 'p1', player2Id: 'p2', status: 'ready', roomCode: null, absentPlayerId: null, absenceDeadline: null },
      { id: 'm-rapid', tournamentId: 't1', player1Id: 'p1', player2Id: 'p2', status: 'ready', roomCode: null, absentPlayerId: 'p2', absenceDeadline: new Date() },
    ];
    p.tournamentMatch.findUnique.mockImplementation(() => Promise.resolve(matchSnapshots.shift()));
    p.tournament.findUnique.mockResolvedValue({ gameMode: 'casual', sealedBoosterCount: null, sealedSetChoice: null });
    p.tournamentParticipant.findFirst.mockResolvedValue(null);
    p.tournamentMatch.update.mockResolvedValue({});

    registerTournamentHandlers(io as never, sockP1 as never);
    await sockP1.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm-rapid', userId: 'p1' });

    registerTournamentHandlers(io as never, sockP2 as never);
    await sockP2.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm-rapid', userId: 'p2' });

    const updateCalls = p.tournamentMatch.update.mock.calls;
    const startedMatchUpdate = updateCalls.find((c: unknown[]) => {
      const arg = c[0] as { data: { status?: string } };
      return arg.data.status === 'in_progress';
    });
    expect(startedMatchUpdate).toBeTruthy();
  });
});




describe('advanceMatchWinner — never marks tournament complete on a non-final match', () => {
  it('refuses to complete the tournament if match.round < tournament.totalRounds, even when nextMatch is missing', async () => {

    p.tournamentMatch.findUnique.mockResolvedValueOnce(null);
    p.tournament.findUnique.mockResolvedValueOnce({ totalRounds: 4, status: 'in_progress' });

    const tournamentUpdates: unknown[] = [];
    p.tournament.update = vi.fn().mockImplementation((arg: { data: unknown }) => {
      tournamentUpdates.push(arg.data);
      return Promise.resolve({});
    });

    await advanceMatchWinner(null, 't1', { round: 2, matchIndex: 1 }, 'winner-id', 'WinnerName');

    expect(tournamentUpdates).toEqual([]);
  });

  it('proceeds with completion when match.round === tournament.totalRounds (true final)', async () => {

    p.tournamentMatch.findUnique.mockResolvedValueOnce(null);
    p.tournament.findUnique.mockResolvedValueOnce({ totalRounds: 4, status: 'in_progress' });
    p.tournamentParticipant.findFirst.mockResolvedValueOnce(null);
    p.tournamentMatch.findMany.mockResolvedValue([]);
    p.user.update = vi.fn().mockResolvedValue({ tournamentWins: 1 });

    const finishTournament = vi.fn().mockResolvedValue({});
    p.tournament.update = finishTournament;
    p.tournament.findUnique.mockResolvedValueOnce({
      name: 'Test Cup',
      matches: [],
      _count: { participants: 16 },
    });

    await advanceMatchWinner(null, 't1', { round: 4, matchIndex: 0 }, 'winner-id', 'WinnerName');

    const completionCall = finishTournament.mock.calls.find((c: unknown[]) => {
      const arg = c[0] as { data: { status?: string } };
      return arg.data.status === 'completed';
    });
    expect(completionCall).toBeTruthy();
  });

  it('refuses to re-complete when tournament status is already completed', async () => {

    p.tournamentMatch.findUnique.mockResolvedValueOnce(null);
    p.tournament.findUnique.mockResolvedValueOnce({ totalRounds: 4, status: 'completed' });

    const tournamentUpdates: unknown[] = [];
    p.tournament.update = vi.fn().mockImplementation((arg: { data: unknown }) => {
      tournamentUpdates.push(arg.data);
      return Promise.resolve({});
    });

    await advanceMatchWinner(null, 't1', { round: 4, matchIndex: 0 }, 'winner-id', 'WinnerName');

    expect(tournamentUpdates).toEqual([]);
  });

  it('refuses to re-complete when tournament status is already cancelled', async () => {

    p.tournamentMatch.findUnique.mockResolvedValueOnce(null);
    p.tournament.findUnique.mockResolvedValueOnce({ totalRounds: 4, status: 'cancelled' });

    const tournamentUpdates: unknown[] = [];
    p.tournament.update = vi.fn().mockImplementation((arg: { data: unknown }) => {
      tournamentUpdates.push(arg.data);
      return Promise.resolve({});
    });

    await advanceMatchWinner(null, 't1', { round: 4, matchIndex: 0 }, 'winner-id', 'WinnerName');

    expect(tournamentUpdates).toEqual([]);
  });
});
