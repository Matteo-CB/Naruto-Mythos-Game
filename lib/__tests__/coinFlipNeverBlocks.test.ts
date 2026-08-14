import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

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
    expect(MAX_MULLIGAN_CANCELS_PER_MATCH, 'two cancellations, then the match must be decided').toBe(2);

    clearMulliganCancels(matchId);
    expect(mulliganCancelsFor(matchId), 'a finished mulligan clears the record').toBe(0);
  });
});

function serverSource(): string {
  return readFileSync(join(process.cwd(), 'lib/socket/server.ts'), 'utf8');
}

function bodyOf(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  expect(start, `${declaration} still exists`).toBeGreaterThan(-1);
  const openings = source.indexOf('{', start);
  let depth = 0;
  for (let i = openings; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`could not read the body of ${declaration}`);
}

describe('every path that starts a game arms the coin flip fallback', () => {
  it('a tournament match arms it too, it is the one place a stuck flip freezes a bracket', () => {
    const body = bodyOf(serverSource(), 'export async function maybeStartTournamentGame');
    expect(
      body.includes('armCoinFlipFallback('),
      'startTournamentGameIfReady must arm the fallback: a client that never confirms the flip used to hang the match forever',
    ).toBe(true);
  });

  it('no game creation is left without the fallback', () => {
    const source = serverSource();
    let from = 0;
    let sites = 0;
    for (;;) {
      const at = source.indexOf('GameEngine.createGame(', from);
      if (at === -1) break;
      sites++;
      from = at + 1;
      const window = source.slice(at, at + 4000);
      expect(
        window.includes('armCoinFlipFallback('),
        `the game creation at offset ${at} starts a game without arming the coin flip fallback`,
      ).toBe(true);
    }
    expect(sites, 'the guard actually found the game creations').toBeGreaterThan(0);
  });
});

describe('a tournament match is always decided, never left hanging', () => {
  it('once the cancellation budget is spent, the missing seat is forfeited instead of the match stalling', () => {
    const body = bodyOf(serverSource(), 'export async function handleMulliganIdleTimeout');
    expect(body.includes('mulliganBudgetExhausted'), 'the budget decides the outcome').toBe(true);
    expect(
      body.includes('handleMatchForfeit'),
      'the spent budget must forfeit the seat that never answered, otherwise the bracket hangs forever',
    ).toBe(true);
    expect(
      /missingSeatReachable && !mulliganBudgetExhausted/.test(body),
      'reopening is only allowed while the budget lasts',
    ).toBe(true);
  });
});
