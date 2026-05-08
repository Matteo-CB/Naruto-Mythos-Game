import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn() },
    tournamentMatch: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    deck: { findUnique: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/socket/server', () => ({
  rooms: new Map(),
  getSocketIO: vi.fn(() => null),
}));

vi.mock('@/lib/tournament/absenceManager', () => ({
  startAbsenceTimer: vi.fn(() => new Date()),
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
import { registerTournamentHandlers } from '../socket/tournamentHandlers';

const p = prisma as never as {
  tournament: { findUnique: ReturnType<typeof vi.fn> };
  tournamentParticipant: { findFirst: ReturnType<typeof vi.fn> };
  tournamentMatch: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
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
    on(event: string, handler: (...args: unknown[]) => unknown) {
      this.handlers[event] = handler;
    },
    join(room: string) {
      this.joined.push(room);
    },
    leave(room: string) {
      this.joined = this.joined.filter(r => r !== room);
    },
    emit(event: string, data: unknown) {
      this.emitted.push({ event, data });
    },
  };
  return sock;
}

function fakeIO() {
  return {
    to: vi.fn(() => ({ emit: vi.fn() })),
    sockets: { sockets: new Map() },
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
});

describe('tournament:subscribe socket handler (privacy gate from pass 40)', () => {
  it('joins room when tournament is public', async () => {
    const io = fakeIO();
    const sock = fakeSocket('u1');
    p.tournament.findUnique.mockResolvedValue({ isPublic: true, creatorId: 'someone' });
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:subscribe']({ tournamentId: 't1' });
    expect(sock.joined).toContain('tournament:t1');
  });

  it('does not join when tournament not found', async () => {
    const io = fakeIO();
    const sock = fakeSocket('u1');
    p.tournament.findUnique.mockResolvedValue(null);
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:subscribe']({ tournamentId: 'ghost' });
    expect(sock.joined).toEqual([]);
  });

  it('does not join private tournament when socket is not authenticated', async () => {
    const io = fakeIO();
    const sock = fakeSocket();
    p.tournament.findUnique.mockResolvedValue({ isPublic: false, creatorId: 'someone' });
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:subscribe']({ tournamentId: 't1' });
    expect(sock.joined).toEqual([]);
  });

  it('does not join private tournament for non-participant non-creator', async () => {
    const io = fakeIO();
    const sock = fakeSocket('random');
    p.tournament.findUnique.mockResolvedValue({ isPublic: false, creatorId: 'someone' });
    p.tournamentParticipant.findFirst.mockResolvedValue(null);
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:subscribe']({ tournamentId: 't1' });
    expect(sock.joined).toEqual([]);
  });

  it('joins private tournament when socket is the creator', async () => {
    const io = fakeIO();
    const sock = fakeSocket('creator');
    p.tournament.findUnique.mockResolvedValue({ isPublic: false, creatorId: 'creator' });
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:subscribe']({ tournamentId: 't1' });
    expect(sock.joined).toContain('tournament:t1');
  });

  it('joins private tournament when socket user is a participant', async () => {
    const io = fakeIO();
    const sock = fakeSocket('partUser');
    p.tournament.findUnique.mockResolvedValue({ isPublic: false, creatorId: 'someone' });
    p.tournamentParticipant.findFirst.mockResolvedValue({ id: 'p1' });
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:subscribe']({ tournamentId: 't1' });
    expect(sock.joined).toContain('tournament:t1');
  });
});

describe('tournament:unsubscribe socket handler', () => {
  it('leaves the room', async () => {
    const io = fakeIO();
    const sock = fakeSocket('u1');
    sock.joined.push('tournament:t1');
    registerTournamentHandlers(io as never, sock as never);
    sock.handlers['tournament:unsubscribe']({ tournamentId: 't1' });
    expect(sock.joined).not.toContain('tournament:t1');
  });
});

describe('tournament:ready socket handler (auth from pass 11)', () => {
  it('rejects when socket has no authenticated user', async () => {
    const io = fakeIO();
    const sock = fakeSocket();
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm1', userId: 'claimed' });
    expect(p.tournamentMatch.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when claimed userId does not match socket userId', async () => {
    const io = fakeIO();
    const sock = fakeSocket('actual-user');
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm1', userId: 'other-user' });
    expect(p.tournamentMatch.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when match does not belong to claimed tournament', async () => {
    const io = fakeIO();
    const sock = fakeSocket('u1');
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 'OTHER', player1Id: 'u1', player2Id: 'u2', status: 'ready',
    });
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm1', userId: 'u1' });
    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
  });

  it('rejects when user is not in the match', async () => {
    const io = fakeIO();
    const sock = fakeSocket('outsider');
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', player1Id: 'u1', player2Id: 'u2', status: 'ready',
    });
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm1', userId: 'outsider' });
    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
  });

  it('rejects when match status is not ready/pending/in_progress', async () => {
    const io = fakeIO();
    const sock = fakeSocket('u1');
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', player1Id: 'u1', player2Id: 'u2', status: 'completed',
    });
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm1', userId: 'u1' });
    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
  });

  it('happy path: first ready triggers absence-timer setup + DB update for waiting opponent', async () => {
    const { startAbsenceTimer } = await import('@/lib/tournament/absenceManager');
    (startAbsenceTimer as ReturnType<typeof vi.fn>).mockClear();
    const io = fakeIO();
    const sock = fakeSocket('u1');
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', player1Id: 'u1', player2Id: 'u2',
      status: 'ready', roomCode: null,
    });
    p.tournamentMatch.update.mockResolvedValue({});
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm1', userId: 'u1' });
    expect(startAbsenceTimer).toHaveBeenCalledWith('m1', expect.any(Function));
    expect(p.tournamentMatch.update).toHaveBeenCalled();
    const updateArgs = p.tournamentMatch.update.mock.calls[0][0] as { data: { absentPlayerId: string } };
    expect(updateArgs.data.absentPlayerId).toBe('u2');
  });

  it('returns silently when room already exists for the match', async () => {
    const { rooms } = await import('@/lib/socket/server');
    (rooms as Map<string, unknown>).set('T-existing', { code: 'T-existing' });
    const io = fakeIO();
    const sock = fakeSocket('u1');
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', player1Id: 'u1', player2Id: 'u2',
      status: 'ready', roomCode: 'T-existing',
    });
    registerTournamentHandlers(io as never, sock as never);
    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm1', userId: 'u1' });
    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
    (rooms as Map<string, unknown>).delete('T-existing');
  });
});
