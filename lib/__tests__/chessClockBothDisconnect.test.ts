import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
vi.mock('@/lib/db/prisma', () => ({
  prisma: { game: { deleteMany: (...a: unknown[]) => deleteMany(...a) } },
}));

import { chessClockWatchdog, rooms, onChessClockTick } from '@/lib/socket/server';
import type { RoomData } from '@/lib/socket/server';
import { createChessClock, arm as armChessClock } from '@/lib/timing/chessClock';
import type { GameState, PlayerID } from '@/lib/engine/types';

function makeIO() {
  const emits: Array<{ event: string; payload: unknown }> = [];
  const io = {
    to: vi.fn(() => ({
      emit: (event: string, payload: unknown) => emits.push({ event, payload }),
    })),
    sockets: { sockets: new Map() },
  } as unknown as Parameters<typeof chessClockWatchdog>[0];
  return { io, emits };
}

function makeRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    code: 'TEST',
    hostId: 'p1',
    hostSocket: 'sock1',
    guestId: 'p2',
    guestSocket: 'sock2',
    gameState: null,
    hostDeck: null,
    guestDeck: null,
    isPrivate: false,
    isRanked: true,
    isAnonymous: false,
    gameMode: 'ranked',
    isEvolving: false,
    holoHue: null,
    hostEvolvingPoints: 0,
    guestEvolvingPoints: 0,
    createdAt: Date.now(),
    replayInitialState: null,
    replayStateSnapshots: null,
    replaySnapshotLogLengths: null,
    replayClockSnapshots: null,
    finalized: false,
    isSealed: false,
    sealedBoosterCount: 5,
    sealedTimer: null,
    sealedDeadline: null,
    coinFlipDone: { player1: false, player2: false },
    spectators: new Map(),
    hostAllowSpectatorHand: false,
    guestAllowSpectatorHand: false,
    chatMessages: [],
    chatLastCleanup: Date.now(),
    chessClock: createChessClock(),
    chessClockTickTimer: null,
    chessClockMulliganTimer: null,
    chessClockLastInputKey: null,
    ...overrides,
  } as RoomData;
}

function actionState(activePlayer: PlayerID = 'player1'): GameState {
  return {
    turn: 2, phase: 'action', activePlayer, edgeHolder: activePlayer,
    player1: { id: 'player1', userId: 'p1', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 0, missionPoints: 18, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: true },
    player2: { id: 'player2', userId: 'p2', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 0, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: true },
    missionDeck: [], activeMissions: [],
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
  } as unknown as GameState;
}

beforeEach(() => {
  for (const code of Array.from(rooms.keys())) rooms.delete(code);
  deleteMany.mockClear();
});

describe('both-players-disconnected does NOT forfeit one player (server outage protection)', () => {
  it('onChessClockTick: skips single-side forfeit when both are disconnected', () => {
    const longAgo = Date.now() - 5 * 60_000;
    const room = makeRoom({
      code: 'BOTH-DISC-1',
      gameState: actionState('player1'),
      chessClock: armChessClock(createChessClock(), 'player1', Date.now()),
      player1DisconnectedAt: longAgo,
      player2DisconnectedAt: longAgo - 5_000,
      lastApplyActionAt: Date.now(),
    });
    rooms.set(room.code, room);
    const { io, emits } = makeIO();

    onChessClockTick(room, io);

    expect(room.finalized).toBe(true);
    const cancelEvt = emits.find((e) => e.event === 'game:cancelled');
    expect(cancelEvt).toBeTruthy();
    const payload = cancelEvt!.payload as { reason: string };
    expect(payload.reason).toBe('stalemate');
    expect(room.gameState?.forfeitedBy).toBeFalsy();
  });

  it('watchdog: cancels game with no ELO impact when both disconnected long enough', () => {
    const longAgo = Date.now() - 5 * 60_000;
    const room = makeRoom({
      code: 'BOTH-DISC-2',
      gameState: actionState('player1'),
      player1DisconnectedAt: longAgo,
      player2DisconnectedAt: longAgo,
      lastApplyActionAt: Date.now(),
    });
    rooms.set(room.code, room);
    const { io, emits } = makeIO();

    chessClockWatchdog(io);

    expect(room.finalized).toBe(true);
    const cancelEvt = emits.find((e) => e.event === 'game:cancelled');
    expect(cancelEvt).toBeTruthy();
    expect(room.gameState?.forfeitedBy).toBeFalsy();
  });

  it('single disconnect still forfeits that player (other path unchanged)', () => {
    const room = makeRoom({
      code: 'SINGLE-DISC-1',
      gameState: actionState('player1'),
      chessClock: armChessClock(createChessClock(), 'player1', Date.now()),
      player1DisconnectedAt: Date.now() - 5 * 60_000,
      lastApplyActionAt: Date.now(),
    });
    rooms.set(room.code, room);
    const { io } = makeIO();

    onChessClockTick(room, io);

    expect(room.gameState?.forfeitedBy === 'player1' || room.finalized).toBe(true);
  });

  it('does NOT cancel right away if both disconnected but not over the threshold yet', () => {
    const recent = Date.now() - 10_000;
    const room = makeRoom({
      code: 'BOTH-DISC-EARLY',
      gameState: actionState('player1'),
      chessClock: armChessClock(createChessClock(), 'player1', Date.now()),
      player1DisconnectedAt: recent,
      player2DisconnectedAt: recent,
      lastApplyActionAt: Date.now(),
    });
    rooms.set(room.code, room);
    const { io, emits } = makeIO();

    onChessClockTick(room, io);

    expect(room.finalized).toBe(false);
    expect(emits.some((e) => e.event === 'game:cancelled')).toBe(false);
  });

  it('disconnect forfeit ABORTS if the disconnected player was leading by 5+ mission points (KingsleyComar case)', () => {
    const room = makeRoom({
      code: 'LEAD-DISC-1',
      gameState: actionState('player1'),
      chessClock: armChessClock(createChessClock(), 'player2', Date.now()),
      player1DisconnectedAt: Date.now() - 5 * 60_000,
      lastApplyActionAt: Date.now(),
    });
    rooms.set(room.code, room);
    const { io, emits } = makeIO();

    onChessClockTick(room, io);

    expect(room.finalized).toBe(true);
    const cancelEvt = emits.find((e) => e.event === 'game:cancelled');
    expect(cancelEvt).toBeTruthy();
    expect(room.gameState?.forfeitedBy).toBeFalsy();
  });
});
