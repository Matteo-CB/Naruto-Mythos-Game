import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
vi.mock('@/lib/db/prisma', () => ({
  prisma: { game: { deleteMany: (...a: unknown[]) => deleteMany(...a) } },
}));

import {
  chessClockWatchdog,
  rooms,
  STALEMATE_NO_PROGRESS_MS,
  STALEMATE_CANCEL_MS,
} from '@/lib/socket/server';
import type { RoomData } from '@/lib/socket/server';
import { createChessClock } from '@/lib/timing/chessClock';
import type { GameState, PlayerID } from '@/lib/engine/types';

function makeIO() {
  const emits: Array<{ event: string; payload: unknown }> = [];
  const io = {
    to: vi.fn(() => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ event, payload });
      },
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
    isRanked: false,
    isAnonymous: false,
    gameMode: 'casual',
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
    turn: 1,
    phase: 'action',
    activePlayer,
    edgeHolder: activePlayer,
    player1: { id: 'player1', userId: 'p1', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 0, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: true },
    player2: { id: 'player2', userId: 'p2', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 0, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: true },
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    actionHistory: [],
  } as unknown as GameState;
}

beforeEach(() => {
  for (const code of Array.from(rooms.keys())) rooms.delete(code);
  deleteMany.mockClear();
});

describe('chessClockWatchdog stalemate safety net', () => {
  it('initialises lastApplyActionAt on first tick (no action immediately)', () => {
    const room = makeRoom({ code: 'INIT-1', gameState: actionState('player1') });
    rooms.set(room.code, room);

    const { io } = makeIO();
    chessClockWatchdog(io);

    expect(typeof room.lastApplyActionAt).toBe('number');
    expect(room.finalized).toBe(false);
  });

  it('cancels the game with NO elo impact after STALEMATE_CANCEL_MS of no action and both connected', async () => {
    const room = makeRoom({
      code: 'STALE-CANCEL-1',
      gameState: actionState('player1'),
      lastApplyActionAt: Date.now() - STALEMATE_CANCEL_MS - 1_000,
    });
    rooms.set(room.code, room);

    const { io, emits } = makeIO();
    chessClockWatchdog(io);
    await new Promise((r) => setTimeout(r, 5));

    expect(room.finalized).toBe(true);
    expect(emits.some((e) => e.event === 'game:cancelled')).toBe(true);
    const cancelEvt = emits.find((e) => e.event === 'game:cancelled');
    const payload = cancelEvt?.payload as { reason: string };
    expect(payload.reason).toBe('stalemate');
  });

  it('does NOT cancel as stalemate when one player is disconnected (disconnect path handles it)', () => {
    const room = makeRoom({
      code: 'STALE-WITH-DISC-1',
      gameState: actionState('player1'),
      lastApplyActionAt: Date.now() - STALEMATE_CANCEL_MS - 1_000,
      player2DisconnectedAt: Date.now() - 30_000,
    });
    rooms.set(room.code, room);

    const { io, emits } = makeIO();
    chessClockWatchdog(io);

    expect(room.finalized).toBe(false);
    expect(emits.some((e) => e.event === 'game:cancelled')).toBe(false);
  });

  it('does NOT cancel before STALEMATE_NO_PROGRESS_MS even when both connected', () => {
    const room = makeRoom({
      code: 'STALE-EARLY-1',
      gameState: actionState('player1'),
      lastApplyActionAt: Date.now() - 60_000,
    });
    rooms.set(room.code, room);

    const { io } = makeIO();
    chessClockWatchdog(io);

    expect(room.finalized).toBe(false);
  });

  it('triggers idle resolution at STALEMATE_NO_PROGRESS_MS (auto-pass or notice set)', () => {
    const room = makeRoom({
      code: 'STALE-IDLE-1',
      gameState: actionState('player1'),
      lastApplyActionAt: Date.now() - (STALEMATE_NO_PROGRESS_MS + 30_000),
    });
    rooms.set(room.code, room);

    expect(room.stalemateNoticeAt).toBeFalsy();
    const { io } = makeIO();
    chessClockWatchdog(io);
    const player1Passed = room.gameState?.player1.hasPassed === true;
    const finalized = room.finalized === true;
    const noticeSet = typeof room.stalemateNoticeAt === 'number';
    expect(player1Passed || finalized || noticeSet).toBe(true);
  });
});
