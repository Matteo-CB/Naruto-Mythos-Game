import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import {
  chessClockWatchdog,
  rooms,
  startChessClockTickLoop,
  syncChessClock,
  handleChessClockExpiry,
} from '@/lib/socket/server';
import type { RoomData } from '@/lib/socket/server';
import { createChessClock, arm as armChessClock, type ChessClockState } from '@/lib/timing/chessClock';
import type { GameState, PlayerID } from '@/lib/engine/types';

function makeIO() {
  const emitSpy = vi.fn();
  return {
    to: vi.fn(() => ({ emit: emitSpy })),
    sockets: { sockets: new Map() },
    _emit: emitSpy,
  } as never;
}

function makeRoom(overrides: Partial<RoomData> = {}): RoomData {
  return {
    code: 'TEST-1',
    hostId: 'p1-id',
    hostSocket: 'sock-1',
    guestId: 'p2-id',
    guestSocket: 'sock-2',
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

function fakeActionState(activePlayer: PlayerID = 'player1'): GameState {
  return {
    turn: 1, phase: 'action', activePlayer, edgeHolder: activePlayer,
    player1: { id: 'player1', userId: 'p1-id', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 0, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: false },
    player2: { id: 'player2', userId: 'p2-id', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 0, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: false },
    missionDeck: [], activeMissions: [],
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
  } as unknown as GameState;
}

beforeEach(() => {
  for (const code of Array.from(rooms.keys())) rooms.delete(code);
});

describe('chessClockWatchdog: heals desync + force-forfeits long disconnect', () => {
  it('re-syncs the clock when active=null but input is awaited', () => {
    const room = makeRoom({
      code: 'DESYNC-1',
      gameState: fakeActionState('player1'),
    });
    rooms.set(room.code, room);
    expect(room.chessClock.active).toBe(null);

    chessClockWatchdog(makeIO());

    expect(room.chessClock.active).toBe('player1');
  });

  it('restarts the per-room tick timer when missing while clock is armed', () => {
    const baseClock: ChessClockState = armChessClock(createChessClock(), 'player1', Date.now());
    const room = makeRoom({
      code: 'TIMER-MISSING-1',
      gameState: fakeActionState('player1'),
      chessClock: baseClock,
      chessClockTickTimer: null,
    });
    rooms.set(room.code, room);

    chessClockWatchdog(makeIO() as never);

    expect(room.chessClockTickTimer).not.toBeNull();
    if (room.chessClockTickTimer) clearInterval(room.chessClockTickTimer);
  });

  it('force-forfeits player1 when disconnected longer than the failsafe threshold', () => {
    const longAgo = Date.now() - (16 * 60 * 1000);
    const room = makeRoom({
      code: 'FORFEIT-LONG-DISC-1',
      gameState: fakeActionState('player1'),
      player1DisconnectedAt: longAgo,
    });
    rooms.set(room.code, room);

    chessClockWatchdog(makeIO() as never);

    expect(room.gameState?.phase === 'gameOver' || room.finalized || (room.gameState?.forfeitedBy === 'player1')).toBe(true);
  });

  it('does not force-forfeit when disconnect is recent (within failsafe window)', () => {
    const recent = Date.now() - 60_000;
    const room = makeRoom({
      code: 'FORFEIT-RECENT-DISC-1',
      gameState: fakeActionState('player1'),
      player2DisconnectedAt: recent,
    });
    rooms.set(room.code, room);

    chessClockWatchdog(makeIO() as never);

    expect(room.finalized).toBe(false);
    expect(room.gameState?.phase).toBe('action');
    expect(room.gameState?.forfeitedBy).toBeFalsy();
  });

  it('skips rooms that are finalized, gameOver, or in mulligan', () => {
    const finalized = makeRoom({ code: 'F-1', finalized: true, gameState: fakeActionState('player1') });
    const gameOver = makeRoom({ code: 'GO-1', gameState: { ...fakeActionState('player1'), phase: 'gameOver' } });
    const mulligan = makeRoom({ code: 'MUL-1', gameState: { ...fakeActionState('player1'), phase: 'mulligan' } });
    rooms.set(finalized.code, finalized);
    rooms.set(gameOver.code, gameOver);
    rooms.set(mulligan.code, mulligan);

    chessClockWatchdog(makeIO() as never);


    expect(finalized.chessClock.active).toBe(null);
    expect(gameOver.chessClock.active).toBe(null);
    expect(mulligan.chessClock.active).toBe(null);
  });

  void startChessClockTickLoop;
  void syncChessClock;
  void handleChessClockExpiry;
});
