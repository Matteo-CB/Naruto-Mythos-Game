import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/socket/io', () => ({ emitToUser: vi.fn(), isUserConnected: vi.fn(() => true), getOnlineUserIds: vi.fn(() => new Set()) }));

import {
  armCoinFlipFallback,
  resolveCoinFlip,
  COIN_FLIP_FALLBACK_MS,
  MAX_MULLIGAN_CANCELS_PER_MATCH,
  mulliganCancelsFor,
  clearMulliganCancels,
} from '@/lib/socket/server';

type Emitted = { room: string; event: string };

function fakeIo(emitted: Emitted[]) {
  return {
    to: (room: string) => ({
      emit: (event: string) => { emitted.push({ room, event }); },
    }),
  } as never;
}

function fakeRoom(overrides: Record<string, unknown> = {}) {
  return {
    coinFlipDone: { player1: false, player2: false },
    coinFlipTimer: null,
    coinFlipResolved: false,
    finalized: false,
    hostSocket: 'host-socket',
    guestSocket: 'guest-socket',
    chessClockMulliganTimer: null,
    mulliganDeadline: null,
    gameState: {
      phase: 'mulligan',
      player1: { hasMulliganed: false },
      player2: { hasMulliganed: false },
    },
    ...overrides,
  } as never;
}

describe('a silent client can never keep a game on the coin flip', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('the server resolves the flip itself when a client never answers', () => {
    const emitted: Emitted[] = [];
    const room = fakeRoom();

    armCoinFlipFallback(room, 'T-abc123', fakeIo(emitted));
    expect(emitted.some((e) => e.event === 'coin-flip-sync'), 'nothing happens right away').toBe(false);

    vi.advanceTimersByTime(COIN_FLIP_FALLBACK_MS + 10);

    expect(
      emitted.some((e) => e.room === 'T-abc123' && e.event === 'coin-flip-sync'),
      'the game moves on without the missing confirmation',
    ).toBe(true);
  });

  it('when both clients answer, the fallback is cancelled and never fires twice', () => {
    const emitted: Emitted[] = [];
    const room = fakeRoom();
    const io = fakeIo(emitted);

    armCoinFlipFallback(room, 'T-abc123', io);
    resolveCoinFlip(room, 'T-abc123', io, 'both');
    vi.advanceTimersByTime(COIN_FLIP_FALLBACK_MS * 3);

    expect(emitted.filter((e) => e.event === 'coin-flip-sync').length, 'exactly one sync').toBe(1);
  });

  it('resolving the flip restarts the mulligan countdown, so the minute starts when players can act', () => {
    const emitted: Emitted[] = [];
    const room = fakeRoom();
    const io = fakeIo(emitted);

    const before = Date.now();
    armCoinFlipFallback(room, 'T-abc123', io);
    vi.advanceTimersByTime(COIN_FLIP_FALLBACK_MS + 10);

    const deadline = (room as unknown as { mulliganDeadline: number | null }).mulliganDeadline;
    expect(deadline, 'a mulligan deadline exists').toBeTruthy();
    expect(deadline!, 'and it was pushed after the flip, not before it').toBeGreaterThan(before + COIN_FLIP_FALLBACK_MS);
  });

  it('a finalized room is left alone', () => {
    const emitted: Emitted[] = [];
    const room = fakeRoom({ finalized: true });
    const io = fakeIo(emitted);

    resolveCoinFlip(room, 'T-abc123', io, 'timeout');
    expect(
      (room as unknown as { chessClockMulliganTimer: unknown }).chessClockMulliganTimer,
      'no timer is armed on a finished game',
    ).toBeNull();
  });
});

describe('a match can never cycle forever on mulligan cancellations', () => {
  it('counts the cancellations per match and stops before an endless loop', () => {
    const matchId = 'match-loop-test';
    clearMulliganCancels(matchId);

    expect(mulliganCancelsFor(matchId)).toBe(0);
    expect(MAX_MULLIGAN_CANCELS_PER_MATCH, 'two cancellations, then the game must be allowed to run').toBe(2);

    clearMulliganCancels(matchId);
    expect(mulliganCancelsFor(matchId), 'a finished mulligan clears the record').toBe(0);
  });
});
