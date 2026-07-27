import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    tournamentParticipant: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    tournamentMatch: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    deck: { findUnique: vi.fn() },
    tournamentAdminLog: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn(), update: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/tournament/absenceManager', () => {
  const timers = new Map<string, () => Promise<void>>();
  return {
    startAbsenceTimer: vi.fn((matchId: string, cb: () => Promise<void>) => {
      timers.set(matchId, cb);
      return new Date(Date.now() + 120_000);
    }),
    clearAbsenceTimer: vi.fn((matchId: string) => { timers.delete(matchId); }),
    scheduleAbsenceTimerWithDeadline: vi.fn((matchId: string, _d: Date, cb: () => Promise<void>) => {
      timers.set(matchId, cb);
    }),
    ABSENCE_TIMEOUT_MS: 120_000,
    __timers: timers,
  };
});

import { prisma } from '@/lib/db/prisma';
import { setIO, registerUserSocket, unregisterUserSocket } from '@/lib/socket/io';
import { rooms, type RoomData } from '@/lib/socket/server';
import {
  registerTournamentHandlers,
  reconcileTournamentLaunches,
} from '@/lib/socket/tournamentHandlers';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const CHAR_IDS = getPlayableCharacters()
  .filter((c) => c.set === 'KS' && c.rarity === 'C')
  .slice(0, 30)
  .map((c) => c.id);
const MISSION_IDS = getPlayableMissions()
  .filter((m) => m.set === 'KS')
  .slice(0, 3)
  .map((m) => m.id);

const TOURNAMENT_ID = 'tour-swiss-1';
const MATCH_ID = 'match-abcdef';
const ROOM_CODE = `T-${MATCH_ID.slice(-6)}`;
const P1 = 'user-camissade';
const P2 = 'user-pringles';

interface FakeSocket {
  id: string;
  connected: boolean;
  data: { userId?: string };
  rooms: Set<string>;
  emitted: Array<{ event: string; data: unknown }>;
  handlers: Map<string, (payload: never) => unknown>;
  join(room: string): void;
  leave(room: string): void;
  emit(event: string, data: unknown): void;
  on(event: string, handler: (payload: never) => unknown): void;
  fire(event: string, payload: unknown): Promise<void>;
}

function fakeSocket(id: string, userId: string): FakeSocket {
  return {
    id,
    connected: true,
    data: { userId },
    rooms: new Set<string>(),
    emitted: [],
    handlers: new Map(),
    join(room: string) { this.rooms.add(room); },
    leave(room: string) { this.rooms.delete(room); },
    emit(event: string, data: unknown) { this.emitted.push({ event, data }); },
    on(event: string, handler: (payload: never) => unknown) { this.handlers.set(event, handler); },
    async fire(event: string, payload: unknown) {
      const h = this.handlers.get(event);
      if (!h) throw new Error(`no handler for ${event}`);
      await (h as (x: unknown) => unknown)(payload);
    },
  };
}

interface FakeIo {
  sockets: { sockets: Map<string, FakeSocket> };
  emissions: Array<{ room: string; event: string; data: unknown }>;
  to(room: string): { emit: (event: string, data: unknown) => void };
}

function fakeIo(sockets: FakeSocket[]): FakeIo {
  const registry = new Map<string, FakeSocket>();
  for (const s of sockets) registry.set(s.id, s);
  const emissions: Array<{ room: string; event: string; data: unknown }> = [];
  return {
    sockets: { sockets: registry },
    emissions,
    to(room: string) {
      return {
        emit: (event: string, data: unknown) => {
          emissions.push({ room, event, data });
          const direct = registry.get(room);
          if (direct) direct.emitted.push({ event, data });
        },
      };
    },
  };
}

function matchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MATCH_ID,
    tournamentId: TOURNAMENT_ID,
    status: 'ready',
    roomCode: null as string | null,
    player1Id: P1,
    player2Id: P2,
    absentPlayerId: null as string | null,
    isBye: false,
    ...overrides,
  };
}

function primePrisma(match: Record<string, unknown>): void {
  p.tournamentMatch.findUnique.mockResolvedValue(match);
  p.tournamentMatch.update.mockResolvedValue({});
  p.tournament.findMany.mockResolvedValue([{ id: TOURNAMENT_ID }]);
  p.tournament.findUnique.mockResolvedValue({
    gameMode: 'casual',
    sealedBoosterCount: 5,
    sealedSetChoice: 'KS',
    format: 'swiss',
    isPublic: true,
  });
  p.tournamentParticipant.findFirst.mockImplementation(async ({ where }: { where: { userId: string } }) => ({
    id: `part-${where.userId}`,
    userId: where.userId,
    deckId: `deck-${where.userId}`,
    sealedDeck: null,
    sealedPool: null,
  }));
  p.deck.findUnique.mockResolvedValue({ cardIds: CHAR_IDS, missionIds: MISSION_IDS });
}

function cleanupRooms(): void {
  for (const [code, room] of rooms) {
    if (room.tournamentInviteTimer) clearInterval(room.tournamentInviteTimer);
    if (room.tournamentJoinTimer) clearTimeout(room.tournamentJoinTimer);
    if (room.tournamentGameTimer) clearTimeout(room.tournamentGameTimer);
    if (room.chessClockTickTimer) clearInterval(room.chessClockTickTimer);
    if (room.chessClockMulliganTimer) clearTimeout(room.chessClockMulliganTimer);
    rooms.delete(code);
  }
}

async function bothPlayersConfirmReady(s1: FakeSocket, s2: FakeSocket): Promise<void> {
  await s1.fire('tournament:ready', { tournamentId: TOURNAMENT_ID, matchId: MATCH_ID, userId: P1 });
  await s2.fire('tournament:ready', { tournamentId: TOURNAMENT_ID, matchId: MATCH_ID, userId: P2 });
}

describe('tournament match launches without any client-sent room:join', () => {
  let s1: FakeSocket;
  let s2: FakeSocket;
  let io: FakeIo;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupRooms();
    for (const id of ['s1', 's1b', 's1-new', 's2', 's2b']) {
      unregisterUserSocket(P1, id);
      unregisterUserSocket(P2, id);
    }
    s1 = fakeSocket('s1', P1);
    s2 = fakeSocket('s2', P2);
    io = fakeIo([s1, s2]);
    setIO(io as never);
    registerUserSocket(P1, 's1');
    registerUserSocket(P2, 's2');
    registerTournamentHandlers(io as never, s1 as never);
    registerTournamentHandlers(io as never, s2 as never);
    primePrisma(matchRow());
  });

  afterEach(() => {
    cleanupRooms();
  });

  it('starts the game for two players sitting on the tournament page who never join the room', async () => {
    s1.rooms.add(`tournament:${TOURNAMENT_ID}`);
    s2.rooms.add(`tournament:${TOURNAMENT_ID}`);

    await bothPlayersConfirmReady(s1, s2);

    const room = rooms.get(ROOM_CODE) as RoomData | undefined;
    expect(room).toBeDefined();
    expect(room!.hostSocket).toBe('s1');
    expect(room!.guestSocket).toBe('s2');
    expect(room!.gameState).not.toBeNull();
    expect(s1.emitted.some((e) => e.event === 'game:started')).toBe(true);
    expect(s2.emitted.some((e) => e.event === 'game:started')).toBe(true);
  });

  it('never leaves the production fingerprint of a room with no game while both players are online', async () => {
    await bothPlayersConfirmReady(s1, s2);

    const room = rooms.get(ROOM_CODE)!;
    const dbWroteRoomCode = p.tournamentMatch.update.mock.calls.some(
      ([arg]) => (arg as { data?: { roomCode?: string } }).data?.roomCode === ROOM_CODE,
    );
    expect(dbWroteRoomCode).toBe(true);
    expect(room.gameState).not.toBeNull();
  });

  it('starts the game when a player is on a completely different page', async () => {
    s2.rooms.clear();

    await bothPlayersConfirmReady(s1, s2);

    const room = rooms.get(ROOM_CODE)!;
    expect(room.gameState).not.toBeNull();
    expect(s2.emitted.some((e) => e.event === 'match:enter')).toBe(true);
  });

  it('re-seats a player who refreshed between the room creation and the launch', async () => {
    p.tournamentParticipant.findFirst.mockImplementationOnce(async () => ({ deckId: null, sealedDeck: null }));
    await bothPlayersConfirmReady(s1, s2);
    const room = rooms.get(ROOM_CODE)!;
    expect(room.gameState).toBeNull();

    s1.connected = false;
    room.hostSocket = '';
    unregisterUserSocket(P1, 's1');

    const s1New = fakeSocket('s1-new', P1);
    io.sockets.sockets.set('s1-new', s1New);
    registerUserSocket(P1, 's1-new');

    p.deck.findUnique.mockResolvedValue({ cardIds: CHAR_IDS, missionIds: MISSION_IDS });
    p.tournamentParticipant.findMany.mockResolvedValue([
      { userId: P1, deckId: `deck-${P1}` },
      { userId: P2, deckId: `deck-${P2}` },
    ]);
    p.tournamentMatch.findMany.mockResolvedValue([
      { id: MATCH_ID, tournamentId: TOURNAMENT_ID, roomCode: ROOM_CODE, player1Id: P1, player2Id: P2 },
    ]);

    await reconcileTournamentLaunches(io as never);

    expect(room.hostSocket).toBe('s1-new');
    expect(room.gameState).not.toBeNull();
  });

  it('creates exactly one room and one game when both readies land at the same instant', async () => {
    await Promise.all([
      s1.fire('tournament:ready', { tournamentId: TOURNAMENT_ID, matchId: MATCH_ID, userId: P1 }),
      s2.fire('tournament:ready', { tournamentId: TOURNAMENT_ID, matchId: MATCH_ID, userId: P2 }),
    ]);

    const tournamentRooms = [...rooms.values()].filter((r) => r.tournamentMatchId === MATCH_ID);
    expect(tournamentRooms).toHaveLength(1);
    expect(tournamentRooms[0].gameState).not.toBeNull();
    const startedEmits = s1.emitted.filter((e) => e.event === 'game:started');
    expect(startedEmits.length).toBeGreaterThanOrEqual(1);
  });

  it('never pings a match whose game just ended and is waiting for its result', async () => {
    await bothPlayersConfirmReady(s1, s2);
    const room = rooms.get(ROOM_CODE)!;
    expect(room.gameState).not.toBeNull();
    room.finalized = true;
    s1.emitted.length = 0;
    s2.emitted.length = 0;

    p.tournamentMatch.findMany.mockResolvedValue([
      { id: MATCH_ID, tournamentId: TOURNAMENT_ID, roomCode: ROOM_CODE, player1Id: P1, player2Id: P2 },
    ]);
    await reconcileTournamentLaunches(io as never);

    const pings = [...s1.emitted, ...s2.emitted].filter((e) => e.event === 'tournament:please-confirm-ready');
    expect(pings).toHaveLength(0);
  });

  it('never resurrects a finished match into a second game when a late ready arrives', async () => {
    await bothPlayersConfirmReady(s1, s2);
    const room = rooms.get(ROOM_CODE)!;
    room.finalized = true;
    const updatesBefore = p.tournamentMatch.update.mock.calls.length;

    primePrisma(matchRow({ status: 'in_progress', roomCode: ROOM_CODE }));
    await bothPlayersConfirmReady(s1, s2);

    expect(rooms.get(ROOM_CODE)).toBe(room);
    expect(p.tournamentMatch.update.mock.calls.length).toBe(updatesBefore);
  });

  it('recovers a match whose room was lost to a server restart', async () => {
    primePrisma(matchRow({ status: 'in_progress', roomCode: ROOM_CODE, absentPlayerId: null }));
    p.tournamentMatch.findMany.mockResolvedValue([
      { id: MATCH_ID, tournamentId: TOURNAMENT_ID, roomCode: ROOM_CODE, player1Id: P1, player2Id: P2 },
    ]);

    expect(rooms.get(ROOM_CODE)).toBeUndefined();

    await reconcileTournamentLaunches(io as never);

    const pinged = [s1, s2].map((s) => s.emitted.filter((e) => e.event === 'tournament:please-confirm-ready').length);
    expect(pinged[0]).toBeGreaterThan(0);
    expect(pinged[1]).toBeGreaterThan(0);

    await bothPlayersConfirmReady(s1, s2);

    const room = rooms.get(ROOM_CODE);
    expect(room).toBeDefined();
    expect(room!.gameState).not.toBeNull();
  });
  it('never queries the matches when no tournament is in progress', async () => {
    p.tournament.findMany.mockResolvedValue([]);
    p.tournamentMatch.findMany.mockClear();

    await reconcileTournamentLaunches(io as never);

    expect(p.tournamentMatch.findMany).not.toHaveBeenCalled();
  });

  it('scopes the match lookup to the tournaments that are actually running', async () => {
    p.tournament.findMany.mockResolvedValue([{ id: TOURNAMENT_ID }]);
    p.tournamentMatch.findMany.mockClear().mockResolvedValue([]);

    await reconcileTournamentLaunches(io as never);

    expect(p.tournamentMatch.findMany).toHaveBeenCalledTimes(1);
    const where = p.tournamentMatch.findMany.mock.calls[0][0].where;
    expect(where.tournamentId).toEqual({ in: [TOURNAMENT_ID] });
    expect(where.isBye).toBe(false);
  });
});
