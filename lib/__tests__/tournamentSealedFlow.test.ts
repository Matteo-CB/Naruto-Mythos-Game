import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
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

vi.mock('@/lib/discord/tournamentRoles', () => ({ assignTournamentWinnerRole: vi.fn() }));
vi.mock('@/lib/discord/tournamentWebhook', () => ({ sendTournamentResults: vi.fn() }));
vi.mock('@/lib/discord/tournamentCreatedWebhook', () => ({ sendTournamentCreated: vi.fn() }));

vi.mock('@/lib/data/cardIndex', () => ({
  getCharacterById: vi.fn((id: string) => ({ id, name_en: `CARD_${id}`, name_fr: `CARD_${id}` })),
  getMissionById: vi.fn((id: string) => ({ id, name_en: `MISSION_${id}`, name_fr: `MISSION_${id}` })),
}));

vi.mock('@/lib/tournament/matchRoomCleanup', () => ({
  finalizeAndScheduleRoomDeletion: vi.fn(),
}));

vi.mock('@/lib/tournament/matchEventLog', () => ({
  logMatchEvent: vi.fn(),
}));

vi.mock('@/lib/timing/chessClock', () => ({
  createChessClock: vi.fn(() => ({ player1: 0, player2: 0 })),
}));

vi.mock('@/lib/evolving/computePoints', () => ({
  computeDeckEvolvingPoints: vi.fn(() => 0),
}));

import { prisma } from '@/lib/db/prisma';
import { rooms } from '@/lib/socket/server';
import { registerTournamentHandlers } from '../socket/tournamentHandlers';

const p = prisma as never as {
  tournament: { findUnique: ReturnType<typeof vi.fn> };
  tournamentParticipant: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
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
  id: string;
}

function fakeSocket(userId: string | undefined, id: string = 'sock-' + Math.random().toString(36).slice(2)): FakeSocket {
  return {
    data: userId ? { userId } : {},
    joined: [],
    emitted: [],
    handlers: {},
    id,
    on(event, handler) { this.handlers[event] = handler; },
    join(room) { this.joined.push(room); },
    leave(room) { this.joined = this.joined.filter(r => r !== room); },
    emit(event, data) { this.emitted.push({ event, data }); },
  };
}

interface FakeIO {
  toRooms: string[];
  emissions: Array<{ room: string; event: string; data: unknown }>;
  to: (room: string) => { emit: (event: string, data: unknown) => void };
  sockets: { sockets: Map<string, FakeSocket> };
}

function fakeIO(connectedSockets: FakeSocket[] = []): FakeIO {
  const sockMap = new Map<string, FakeSocket>();
  for (const s of connectedSockets) sockMap.set(s.id, s);
  const emissions: Array<{ room: string; event: string; data: unknown }> = [];
  return {
    toRooms: [],
    emissions,
    to(room) {
      this.toRooms.push(room);
      return { emit: (event, data) => emissions.push({ room, event, data }) };
    },
    sockets: { sockets: sockMap },
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
  (rooms as Map<string, unknown>).clear();
});

afterEach(() => {
  (rooms as Map<string, unknown>).clear();
  vi.useRealTimers();
});

function sealedPool(prefix: string) {
  return {
    boosters: [{ id: 'b1', cards: [] }],
    allCards: Array.from({ length: 30 }, (_, i) => ({ id: `${prefix}-card-${i}` })),
  };
}

function sealedDeckJson(prefix: string) {
  return {
    cardIds: Array.from({ length: 30 }, (_, i) => `${prefix}-card-${i}`),
    missionIds: ['m1', 'm2', 'm3'],
  };
}

describe('sealed tournament — match ready', () => {
  it('loads pre-built sealedDeck into hostDeck/guestDeck and does not emit boosters', async () => {
    const sockHost = fakeSocket('p1');
    const sockGuest = fakeSocket('p2');
    const io = fakeIO([sockHost, sockGuest]);

    p.tournament.findUnique.mockResolvedValue({
      gameMode: 'sealed',
      sealedBoosterCount: 5,
      sealedSetChoice: 'random',
      format: 'swiss',
    });
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm1', tournamentId: 't1', player1Id: 'p1', player2Id: 'p2',
      status: 'ready', roomCode: null, absentPlayerId: 'p1',
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.findFirst
      .mockResolvedValueOnce({ sealedPool: sealedPool('p1'), sealedDeck: sealedDeckJson('p1') })
      .mockResolvedValueOnce({ sealedPool: sealedPool('p2'), sealedDeck: sealedDeckJson('p2') });

    const sock = fakeSocket('p1');
    registerTournamentHandlers(io as never, sock as never);

    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm1', userId: 'p1' });

    const boosterEmissions = io.emissions.filter(e => e.event === 'sealed:boosters');
    expect(boosterEmissions.length).toBe(0);

    const timerEmissions = io.emissions.filter(e => e.event === 'sealed:timer-start');
    expect(timerEmissions.length).toBe(0);

    const room = (rooms as Map<string, unknown>).get('T-m1') as { hostDeck: unknown; guestDeck: unknown; isSealed: boolean; hostSealedPoolIds?: string[]; guestSealedPoolIds?: string[] };
    expect(room).toBeTruthy();
    expect(room.isSealed).toBe(true);
    expect(room.hostDeck).toBeTruthy();
    expect(room.guestDeck).toBeTruthy();
    expect(room.hostSealedPoolIds?.length).toBe(30);
    expect(room.guestSealedPoolIds?.length).toBe(30);
  });

  it('non-sealed tournament rooms do not get sealed flags', async () => {
    const sockHost = fakeSocket('p1');
    const sockGuest = fakeSocket('p2');
    const io = fakeIO([sockHost, sockGuest]);

    p.tournament.findUnique.mockResolvedValue({
      gameMode: 'casual',
      sealedBoosterCount: 5,
      sealedSetChoice: null,
      format: 'swiss',
    });
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: 'm2', tournamentId: 't1', player1Id: 'p1', player2Id: 'p2',
      status: 'ready', roomCode: null, absentPlayerId: 'p1',
      player1Username: 'A', player2Username: 'B',
    });
    p.tournamentMatch.update.mockResolvedValue({});
    p.tournamentParticipant.findFirst
      .mockResolvedValueOnce({ sealedPool: null, sealedDeck: null, deckId: null })
      .mockResolvedValueOnce({ sealedPool: null, sealedDeck: null, deckId: null });

    const sock = fakeSocket('p1');
    registerTournamentHandlers(io as never, sock as never);

    await sock.handlers['tournament:ready']({ tournamentId: 't1', matchId: 'm2', userId: 'p1' });

    const room = (rooms as Map<string, unknown>).get('T-m2') as { isSealed: boolean };
    expect(room).toBeTruthy();
    expect(room.isSealed).toBe(false);
  });
});
