import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const model = new Proxy({}, { get: () => vi.fn(async () => null) });
  const client = new Proxy({}, { get: () => model });
  return { prisma: client };
});

import { GameEngine } from '@/lib/engine/GameEngine';
import {
  expectedScore,
  calculateNewElo,
  calculateEloChanges,
  calculatePerformanceBonus,
  getMaxLoss,
  getMinWinGain,
  FORFEIT_BONUS,
  type PerformanceBonus,
} from '@/lib/elo/elo';
import {
  createChessClock,
  arm,
  disarm,
  resetIdle,
  idleMs,
  bankEmpty,
  snapshotRemaining,
  snapshotForBroadcast,
  consumeIdleWarning,
  hasIdleWarning,
  CHESS_CLOCK_INITIAL_MS,
  CHESS_CLOCK_IDLE_LIMIT_MS,
  CHESS_CLOCK_IDLE_TOAST_MS,
  CHESS_CLOCK_DISCONNECT_FORFEIT_MS,
  CHESS_CLOCK_MULLIGAN_IDLE_MS,
} from '@/lib/timing/chessClock';
import {
  decideIdleOutcome,
  isPendingEffectDeclinable,
  type IdleStateView,
} from '@/lib/timing/idleDecision';
import {
  resolveSeatBySocket,
  resolveSeatByUserId,
  shouldForfeitForDisconnect,
  shouldClearDisconnectStamp,
  seatActedSince,
  disconnectStampFor,
} from '@/lib/socket/roomSeats';
import {
  onChessClockTick,
  handleChessClockExpiry,
  handleChessClockIdleLimit,
  chessClockExpiryReasonToWinReason,
  buildChessClockBroadcast,
  syncChessClock,
  whoseInputIsAwaited,
  computeAwaitedInputKey,
  noteSeatInput,
  stopChessClockTickLoop,
  isUserInAnotherLiveGame,
  getEvolvingEloField,
  getEvolvingEloType,
  rooms,
  type RoomData,
  type ChessClockExpiryReason,
  type GameEndWinReason,
} from '@/lib/socket/server';
import type { GameState, GameAction, PlayerID } from '@/lib/engine/types';

type EmitRecord = { target: string; event: string; payload: unknown };

function makeIo(): { io: any; emits: EmitRecord[] } {
  const emits: EmitRecord[] = [];
  const io: any = {
    to: (target: string) => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ target, event, payload });
      },
    }),
    sockets: { sockets: new Map() },
  };
  return { io, emits };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'audit-online-elo',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: { hasMulliganed: true, missionPoints: 0, hand: [] },
    player2: { hasMulliganed: true, missionPoints: 0, hand: [] },
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    actionHistory: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    ...overrides,
  } as unknown as GameState;
}

const trackedRooms: RoomData[] = [];

function makeRoom(overrides: Partial<RoomData> = {}): RoomData {
  const room = {
    code: 'AUDIT1',
    hostId: 'user-p1',
    hostSocket: 'sock-p1',
    guestId: 'user-p2',
    guestSocket: 'sock-p2',
    gameState: makeState(),
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
    lastApplyActionAt: Date.now(),
    ...overrides,
  } as unknown as RoomData;
  trackedRooms.push(room);
  return room;
}

function lastActionOf(spy: ReturnType<typeof vi.spyOn>): GameAction | null {
  const calls = spy.mock.calls;
  if (calls.length === 0) return null;
  return calls[calls.length - 1][2] as GameAction;
}

describe('ELO core math (K=32, floor 100, universal clamps)', () => {
  it('uses K=32 at every rating band, never a high-elo slowdown', () => {
    expect(calculateNewElo(400, 400, 1.0) - 400).toBe(16);
    expect(calculateNewElo(1000, 1000, 1.0) - 1000).toBe(16);
    expect(calculateNewElo(2000, 2000, 1.0) - 2000).toBe(16);
    expect(calculateNewElo(2800, 2800, 1.0) - 2800).toBe(16);
    expect(calculateNewElo(400, 400, 0.0) - 400).toBe(-16);
    expect(calculateNewElo(2800, 2800, 0.0) - 2800).toBe(-16);
  });

  it('expectedScore matches the FIDE formula and is symmetric', () => {
    expect(expectedScore(1200, 1000)).toBeCloseTo(0.759747, 5);
    expect(expectedScore(1000, 1200)).toBeCloseTo(0.240253, 5);
    expect(expectedScore(1200, 1000) + expectedScore(1000, 1200)).toBeCloseTo(1, 10);
    expect(expectedScore(777, 777)).toBe(0.5);
  });

  it('the +10 minimum win gain engages as soon as the natural gain drops under 10', () => {
    expect(Math.round(32 * (1 - expectedScore(1200, 1000)))).toBe(8);
    expect(calculateNewElo(1200, 1000, 1.0) - 1200).toBe(10);
    expect(calculateNewElo(2500, 100, 1.0) - 2500).toBe(10);
    expect(calculateNewElo(1700, 100, 1.0) - 1700).toBe(10);
  });

  it('the minimum win gain is universal and never scaled by the rating gap', () => {
    expect(getMinWinGain(100, 100)).toBe(10);
    expect(getMinWinGain(2900, 100)).toBe(10);
    expect(getMinWinGain(100, 2900)).toBe(10);
  });

  it('the -32 maximum loss is universal and is exactly the natural K=32 worst case', () => {
    expect(getMaxLoss(100, 100)).toBe(32);
    expect(getMaxLoss(2900, 100)).toBe(32);
    expect(calculateNewElo(2500, 100, 0.0) - 2500).toBe(-32);
    expect(calculateNewElo(2900, 100, 0.0) - 2900).toBe(-32);
  });

  it('never returns below the 100 floor, whatever the inputs', () => {
    expect(calculateNewElo(100, 2500, 0.0)).toBe(100);
    expect(calculateNewElo(100, 100, 0.0)).toBe(100);
    expect(calculateNewElo(110, 110, 0.0)).toBe(100);
    expect(calculateNewElo(90, 90, 0.0)).toBe(100);
  });

  it('applies the clamp before the floor, so the floor can only shrink the effective loss', () => {
    const clampedDelta = -32;
    const raw = 110 + clampedDelta;
    expect(raw).toBeLessThan(100);
    expect(calculateNewElo(110, 2900, 0.0)).toBeGreaterThanOrEqual(100);
    expect(calculateNewElo(110, 110, 0.0) - 110).toBe(-10);
    expect(calculateNewElo(50, 50, 1.0)).toBe(100);
    expect(calculateNewElo(50, 3000, 1.0)).toBe(100);
  });

  it('draws are never clamped by the win or loss clamps', () => {
    expect(calculateNewElo(1000, 1000, 0.5) - 1000).toBe(0);
    expect(calculateNewElo(1000, 1200, 0.5) - 1000).toBe(8);
    expect(calculateNewElo(1200, 1000, 0.5) - 1200).toBe(-8);
  });

  it('the min-gain clamp makes an upset-proof win asymmetric with the opponent loss', () => {
    const winnerDelta = calculateNewElo(1200, 1000, 1.0) - 1200;
    const loserDelta = calculateNewElo(1000, 1200, 0.0) - 1000;
    expect(winnerDelta).toBe(10);
    expect(loserDelta).toBe(-8);
    expect(winnerDelta + loserDelta).toBe(2);
  });

  it('holds the win and loss invariants over a full rating grid', () => {
    const elos = [100, 120, 300, 700, 1000, 1500, 2000, 2500, 3000];
    for (const mine of elos) {
      for (const theirs of elos) {
        const win = calculateNewElo(mine, theirs, 1.0);
        const loss = calculateNewElo(mine, theirs, 0.0);
        expect(win - mine).toBeGreaterThanOrEqual(10);
        expect(win - mine).toBeLessThanOrEqual(32);
        expect(loss - mine).toBeGreaterThanOrEqual(-32);
        expect(loss - mine).toBeLessThanOrEqual(0);
        expect(win).toBeGreaterThanOrEqual(100);
        expect(loss).toBeGreaterThanOrEqual(100);
      }
    }
  });
});

describe('Performance bonus tiers (winner only, two mutually exclusive paths)', () => {
  const normal = (gap: number, board: number) =>
    calculatePerformanceBonus({ winnerScore: gap, loserScore: 0, loserBoardCount: board, isForfeit: false });

  it('score gap boundaries hit exactly at 10, 15, 20 and 25', () => {
    expect(normal(0, 9).scoreBonus).toBe(0);
    expect(normal(9, 9).scoreBonus).toBe(0);
    expect(normal(10, 9).scoreBonus).toBe(2);
    expect(normal(14, 9).scoreBonus).toBe(2);
    expect(normal(15, 9).scoreBonus).toBe(5);
    expect(normal(19, 9).scoreBonus).toBe(5);
    expect(normal(20, 9).scoreBonus).toBe(7);
    expect(normal(24, 9).scoreBonus).toBe(7);
    expect(normal(25, 9).scoreBonus).toBe(9);
    expect(normal(999, 9).scoreBonus).toBe(9);
  });

  it('board pressure boundaries reward 5 or fewer remaining characters only', () => {
    expect(normal(0, 50).boardBonus).toBe(0);
    expect(normal(0, 7).boardBonus).toBe(0);
    expect(normal(0, 6).boardBonus).toBe(0);
    expect(normal(0, 5).boardBonus).toBe(1);
    expect(normal(0, 4).boardBonus).toBe(2);
    expect(normal(0, 3).boardBonus).toBe(3);
    expect(normal(0, 2).boardBonus).toBe(4);
    expect(normal(0, 1).boardBonus).toBe(5);
    expect(normal(0, 0).boardBonus).toBe(6);
  });

  it('the score gap is computed from the two scores, not from the winner score alone', () => {
    const r = calculatePerformanceBonus({ winnerScore: 24, loserScore: 4, loserBoardCount: 8, isForfeit: false });
    expect(r.scoreGap).toBe(20);
    expect(r.scoreBonus).toBe(7);
    expect(r.boardBonus).toBe(0);
    expect(r.total).toBe(7);
  });

  it('clamps a negative score gap and a negative board count', () => {
    const r = calculatePerformanceBonus({ winnerScore: 3, loserScore: 12, loserBoardCount: -4, isForfeit: false });
    expect(r.scoreGap).toBe(0);
    expect(r.scoreBonus).toBe(0);
    expect(r.loserBoardCount).toBe(0);
    expect(r.boardBonus).toBe(6);
    expect(r.total).toBe(6);
  });

  it('caps the combined normal-win bonus at +15 across the whole matrix', () => {
    for (let gap = 0; gap <= 40; gap++) {
      for (let board = 0; board <= 10; board++) {
        const r = normal(gap, board);
        expect(r.total).toBe(r.scoreBonus + r.boardBonus);
        expect(r.total).toBeLessThanOrEqual(15);
        expect(r.forfeitBonus).toBe(0);
        expect(r.isForfeit).toBe(false);
        expect(r.applied).toBe(true);
      }
    }
    expect(normal(25, 0).total).toBe(15);
  });

  it('the bonus is monotonic: a bigger gap and a thinner enemy board never pay less', () => {
    for (let gap = 1; gap <= 40; gap++) {
      expect(normal(gap, 3).scoreBonus).toBeGreaterThanOrEqual(normal(gap - 1, 3).scoreBonus);
    }
    for (let board = 1; board <= 10; board++) {
      expect(normal(12, board - 1).boardBonus).toBeGreaterThanOrEqual(normal(12, board).boardBonus);
    }
  });

  it('the forfeit path is a flat +3 and is mutually exclusive with the score and board path', () => {
    expect(FORFEIT_BONUS).toBe(3);
    const r = calculatePerformanceBonus({ winnerScore: 40, loserScore: 0, loserBoardCount: 0, isForfeit: true });
    expect(r.forfeitBonus).toBe(3);
    expect(r.total).toBe(3);
    expect(r.scoreBonus).toBe(0);
    expect(r.boardBonus).toBe(0);
    expect(r.isForfeit).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.scoreGap).toBe(40);
    expect(r.loserBoardCount).toBe(0);
  });

  it('the forfeit bonus is never zero, even on a 0 to 0 messy board', () => {
    const r = calculatePerformanceBonus({ winnerScore: 0, loserScore: 0, loserBoardCount: 9, isForfeit: true });
    expect(r.total).toBe(3);
  });

  it('every non-score win reason routes to the flat forfeit bonus', () => {
    const reasons: GameEndWinReason[] = ['forfeit', 'timeout', 'clock', 'idle', 'disconnect'];
    for (const winReason of reasons) {
      const r = calculatePerformanceBonus({
        winnerScore: 30,
        loserScore: 0,
        loserBoardCount: 0,
        isForfeit: winReason !== 'score',
        winReason,
      });
      expect(r.isForfeit).toBe(true);
      expect(r.total).toBe(3);
    }
    const scored = calculatePerformanceBonus({
      winnerScore: 30,
      loserScore: 0,
      loserBoardCount: 0,
      isForfeit: false,
      winReason: 'score',
    });
    expect(scored.total).toBe(15);
  });
});

describe('calculateEloChanges: announced delta equals newElo minus oldElo (bonus included)', () => {
  const base = {
    player1Score: 0,
    player2Score: 0,
    player1ConsecWins: 0,
    player1ConsecLosses: 0,
    player2ConsecWins: 0,
    player2ConsecLosses: 0,
  };

  it('keeps delta consistent with the stored elo across a full scenario matrix', () => {
    const bonuses: Array<PerformanceBonus | null> = [
      null,
      calculatePerformanceBonus({ winnerScore: 0, loserScore: 0, loserBoardCount: 9, isForfeit: false }),
      calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: false }),
      calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: true }),
    ];
    const pairs: Array<[number, number]> = [
      [100, 100],
      [100, 2500],
      [2500, 100],
      [1000, 1000],
      [1005, 995],
      [3000, 105],
    ];
    for (const [p1, p2] of pairs) {
      for (const winner of ['player1', 'player2'] as const) {
        for (const performanceBonus of bonuses) {
          const r = calculateEloChanges({ ...base, player1Elo: p1, player2Elo: p2, winner, performanceBonus });
          expect(r.player1Delta).toBe(r.player1NewElo - p1);
          expect(r.player2Delta).toBe(r.player2NewElo - p2);
          expect(r.player1NewElo).toBeGreaterThanOrEqual(100);
          expect(r.player2NewElo).toBeGreaterThanOrEqual(100);
          const loserDelta = winner === 'player1' ? r.player2Delta : r.player1Delta;
          expect(loserDelta).toBeGreaterThanOrEqual(-32);
        }
      }
    }
  });

  it('adds the bonus to the winner only and leaves the loser untouched', () => {
    const bonus = calculatePerformanceBonus({ winnerScore: 26, loserScore: 0, loserBoardCount: 0, isForfeit: false });
    expect(bonus.total).toBe(15);
    const plain = calculateEloChanges({ ...base, player1Elo: 1000, player2Elo: 1000, winner: 'player2' });
    const boosted = calculateEloChanges({
      ...base,
      player1Elo: 1000,
      player2Elo: 1000,
      winner: 'player2',
      performanceBonus: bonus,
    });
    expect(boosted.player2Delta).toBe(plain.player2Delta + 15);
    expect(boosted.player1Delta).toBe(plain.player1Delta);
    expect(boosted.player1Delta).toBe(-16);
    expect(boosted.performanceBonus).toBe(bonus);
  });

  it('stacks the min-gain clamp with the bonus: worst case win is still 10 plus the bonus', () => {
    const bonus = calculatePerformanceBonus({ winnerScore: 25, loserScore: 0, loserBoardCount: 0, isForfeit: false });
    const r = calculateEloChanges({
      ...base,
      player1Elo: 2500,
      player2Elo: 100,
      winner: 'player1',
      performanceBonus: bonus,
    });
    expect(r.player1Delta).toBe(25);
    expect(r.player1NewElo).toBe(2525);
  });

  it('a forfeit win pays exactly 3 on top of the base delta', () => {
    const bonus = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: true });
    const r = calculateEloChanges({
      ...base,
      player1Elo: 1000,
      player2Elo: 1000,
      winner: 'player1',
      performanceBonus: bonus,
    });
    expect(r.player1Delta).toBe(19);
    expect(r.player2Delta).toBe(-16);
    expect(r.performanceBonus?.isForfeit).toBe(true);
  });

  it('a clock win against a much weaker player is the +10 minimum plus the flat +3', () => {
    const bonus = calculatePerformanceBonus({ winnerScore: 2, loserScore: 0, loserBoardCount: 7, isForfeit: true });
    const r = calculateEloChanges({
      ...base,
      player1Elo: 2500,
      player2Elo: 100,
      winner: 'player1',
      performanceBonus: bonus,
    });
    expect(r.player1Delta).toBe(13);
    expect(r.player2Delta).toBe(0);
    expect(r.player2NewElo).toBe(100);
  });

  it('a zero-total bonus changes nothing', () => {
    const bonus = calculatePerformanceBonus({ winnerScore: 4, loserScore: 0, loserBoardCount: 8, isForfeit: false });
    expect(bonus.total).toBe(0);
    const plain = calculateEloChanges({ ...base, player1Elo: 1000, player2Elo: 1000, winner: 'player1' });
    const withZero = calculateEloChanges({
      ...base,
      player1Elo: 1000,
      player2Elo: 1000,
      winner: 'player1',
      performanceBonus: bonus,
    });
    expect(withZero.player1Delta).toBe(plain.player1Delta);
  });

  it('the floor still wins over the bonus arithmetic for the loser', () => {
    const bonus = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: false });
    const r = calculateEloChanges({
      ...base,
      player1Elo: 108,
      player2Elo: 108,
      winner: 'player2',
      performanceBonus: bonus,
    });
    expect(r.player1NewElo).toBe(100);
    expect(r.player1Delta).toBe(-8);
    expect(r.player2Delta).toBe(r.player2NewElo - 108);
  });

  it('tracks consecutive wins and losses on the right side', () => {
    const r = calculateEloChanges({
      player1Elo: 1000,
      player2Elo: 1000,
      winner: 'player1',
      player1Score: 12,
      player2Score: 3,
      player1ConsecWins: 4,
      player1ConsecLosses: 2,
      player2ConsecWins: 7,
      player2ConsecLosses: 1,
    });
    expect(r.player1NewConsecWins).toBe(5);
    expect(r.player1NewConsecLosses).toBe(0);
    expect(r.player2NewConsecWins).toBe(0);
    expect(r.player2NewConsecLosses).toBe(2);
  });

  it('the legacy three-argument API keeps the same delta invariant', () => {
    const r = calculateEloChanges(1400, 900, 'player1');
    expect(r.player1Delta).toBe(r.player1NewElo - 1400);
    expect(r.player2Delta).toBe(r.player2NewElo - 900);
    const draw = calculateEloChanges(1000, 1000, 'draw');
    expect(draw.player1Delta).toBe(0);
    expect(draw.player2Delta).toBe(0);
  });
});

describe('Chess clock bank: 15 minutes, online only, drained by the awaited player', () => {
  it('starts both banks at exactly 15 minutes with no idle warning used', () => {
    const clock = createChessClock();
    expect(CHESS_CLOCK_INITIAL_MS).toBe(900_000);
    expect(clock.player1.remainingMs).toBe(900_000);
    expect(clock.player2.remainingMs).toBe(900_000);
    expect(clock.active).toBeNull();
    expect(clock.activeStartedAt).toBeNull();
    expect(hasIdleWarning(clock, 'player1')).toBe(false);
    expect(hasIdleWarning(clock, 'player2')).toBe(false);
  });

  it('falls back to 15 minutes on a nonsense initial value', () => {
    expect(createChessClock(Number.NaN).player1.remainingMs).toBe(900_000);
    expect(createChessClock(-5).player1.remainingMs).toBe(900_000);
    expect(createChessClock(Number.POSITIVE_INFINITY).player2.remainingMs).toBe(900_000);
    expect(createChessClock(60_000).player1.remainingMs).toBe(60_000);
  });

  it('drains only the active player bank', () => {
    const clock = arm(createChessClock(), 'player1', 1_000);
    expect(snapshotRemaining(clock, 'player1', 31_000)).toBe(870_000);
    expect(snapshotRemaining(clock, 'player2', 31_000)).toBe(900_000);
    const committed = disarm(clock, 31_000);
    expect(committed.player1.remainingMs).toBe(870_000);
    expect(committed.player2.remainingMs).toBe(900_000);
    expect(committed.active).toBeNull();
    expect(committed.idleStartedAt).toBeNull();
  });

  it('re-arming to the other player commits the previous player elapsed time', () => {
    let clock = arm(createChessClock(), 'player1', 0);
    clock = arm(clock, 'player2', 120_000);
    expect(clock.player1.remainingMs).toBe(780_000);
    expect(clock.active).toBe('player2');
    expect(snapshotRemaining(clock, 'player2', 150_000)).toBe(870_000);
    expect(snapshotRemaining(clock, 'player1', 150_000)).toBe(780_000);
  });

  it('bank-empty fires exactly when the bank reaches zero, not a millisecond earlier', () => {
    const clock = arm(createChessClock(), 'player1', 0);
    expect(bankEmpty(clock, 899_999)).toBe(false);
    expect(bankEmpty(clock, 900_000)).toBe(true);
    expect(bankEmpty(clock, 900_001)).toBe(true);
    expect(snapshotRemaining(clock, 'player1', 999_999)).toBe(0);
  });

  it('a disarmed clock is never bank-empty and never drains', () => {
    const clock = createChessClock();
    expect(bankEmpty(clock, 10_000_000)).toBe(false);
    expect(snapshotRemaining(clock, 'player1', 10_000_000)).toBe(900_000);
  });

  it('snapshotForBroadcast freezes the active bank and rebases the start marker', () => {
    const clock = arm(createChessClock(), 'player2', 0);
    const snap = snapshotForBroadcast(clock, 45_000);
    expect(snap.player2.remainingMs).toBe(855_000);
    expect(snap.player1.remainingMs).toBe(900_000);
    expect(snap.activeStartedAt).toBe(45_000);
    expect(clock.player2.remainingMs).toBe(900_000);
  });
});

describe('Chess clock idle rule: 2 minutes, one warning per game', () => {
  it('exposes the documented durations', () => {
    expect(CHESS_CLOCK_IDLE_LIMIT_MS).toBe(120_000);
    expect(CHESS_CLOCK_IDLE_TOAST_MS).toBe(60_000);
    expect(CHESS_CLOCK_DISCONNECT_FORFEIT_MS).toBe(120_000);
    expect(CHESS_CLOCK_MULLIGAN_IDLE_MS).toBe(60_000);
  });

  it('resets the idle countdown without refunding the bank', () => {
    let clock = arm(createChessClock(), 'player1', 0);
    expect(idleMs(clock, 60_000)).toBe(60_000);
    clock = resetIdle(clock, 60_000);
    expect(idleMs(clock, 90_000)).toBe(30_000);
    expect(snapshotRemaining(clock, 'player1', 90_000)).toBe(810_000);
  });

  it('ignores backwards clock skew when resetting the idle marker', () => {
    const clock = resetIdle(arm(createChessClock(), 'player1', 10_000), 5_000);
    expect(clock.idleStartedAt).toBe(10_000);
    expect(idleMs(clock, 4_000)).toBe(0);
  });

  it('consumes the warning for the active player only', () => {
    const clock = consumeIdleWarning(arm(createChessClock(), 'player2', 0));
    expect(hasIdleWarning(clock, 'player2')).toBe(true);
    expect(hasIdleWarning(clock, 'player1')).toBe(false);
  });

  it('first idle auto-passes on the action phase, second idle is an instant defeat', () => {
    const state: IdleStateView = {
      phase: 'action',
      activePlayer: 'player1',
      pendingForcedResolver: null,
      pendingActions: [],
      pendingEffects: [],
    };
    const first = decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false });
    expect(first).toEqual({ kind: 'auto-pass' });
    const second = decideIdleOutcome(state, 'player1', { idleWarningUsed: true, disconnectVerified: false });
    expect(second).toEqual({ kind: 'defeat', reason: 'idle-second' });
  });

  it('first idle auto-declines an optional choice, second idle is a defeat', () => {
    const state: IdleStateView = {
      phase: 'action',
      activePlayer: 'player2',
      pendingForcedResolver: null,
      pendingActions: [],
      pendingEffects: [
        { id: 'pe-opt', resolved: false, selectingPlayer: 'player1', isOptional: true, isMandatory: false },
      ],
    };
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false })).toEqual({
      kind: 'auto-decline',
      pendingEffectId: 'pe-opt',
    });
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: true, disconnectVerified: false })).toEqual({
      kind: 'defeat',
      reason: 'idle-second',
    });
  });

  it('first idle on a mandatory choice only warns, second idle defeats', () => {
    const state: IdleStateView = {
      phase: 'action',
      activePlayer: 'player1',
      pendingForcedResolver: null,
      pendingActions: [{ player: 'player1', sourceEffectId: 'pe-must' }],
      pendingEffects: [
        { id: 'pe-must', resolved: false, selectingPlayer: 'player1', isOptional: false, isMandatory: true },
      ],
    };
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false })).toEqual({
      kind: 'warn',
    });
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: true, disconnectVerified: false })).toEqual({
      kind: 'defeat',
      reason: 'idle-mandatory',
    });
  });

  it('a rootOptional chain is still declinable even when the leaf is flagged mandatory', () => {
    expect(isPendingEffectDeclinable({ isOptional: false, isMandatory: true, rootOptional: true })).toBe(true);
    expect(isPendingEffectDeclinable({ isOptional: false, isMandatory: true })).toBe(false);
    expect(isPendingEffectDeclinable({ isOptional: false, isMandatory: false })).toBe(true);
  });

  it('never defeats a player who has no input awaited, warning used or not', () => {
    const state: IdleStateView = {
      phase: 'mission',
      activePlayer: 'player2',
      pendingForcedResolver: null,
      pendingActions: [],
      pendingEffects: [],
    };
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false })).toEqual({
      kind: 'unstick',
    });
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: true, disconnectVerified: false })).toEqual({
      kind: 'unstick',
    });
  });

  it('a verified disconnect defeats on the very first check, with no first-time grace', () => {
    const state: IdleStateView = {
      phase: 'action',
      activePlayer: 'player1',
      pendingForcedResolver: null,
      pendingActions: [],
      pendingEffects: [],
    };
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: true })).toEqual({
      kind: 'defeat',
      reason: 'disconnect',
    });
  });
});

describe('Flat 2-minute disconnect forfeit (no grace, no warning consumed)', () => {
  const dead = { seatSocketAlive: false, userHasLiveSocket: false };

  it('does not forfeit a seat with no disconnect stamp', () => {
    expect(shouldForfeitForDisconnect({}, 'player1', 1_000_000, 120_000, dead)).toBe(false);
    expect(disconnectStampFor({}, 'player1')).toBeNull();
  });

  it('fires exactly at 2 minutes, not before', () => {
    const room = { player1DisconnectedAt: 1_000_000 };
    expect(shouldForfeitForDisconnect(room, 'player1', 1_119_999, 120_000, dead)).toBe(false);
    expect(shouldForfeitForDisconnect(room, 'player1', 1_120_000, 120_000, dead)).toBe(true);
    expect(shouldForfeitForDisconnect(room, 'player1', 1_600_000, 120_000, dead)).toBe(true);
  });

  it('is cancelled by any sign of life on the seat', () => {
    const room = { player2DisconnectedAt: 1_000_000 };
    const now = 1_500_000;
    expect(shouldForfeitForDisconnect(room, 'player2', now, 120_000, { seatSocketAlive: true, userHasLiveSocket: false })).toBe(false);
    expect(shouldForfeitForDisconnect(room, 'player2', now, 120_000, { seatSocketAlive: false, userHasLiveSocket: true })).toBe(false);
    expect(shouldForfeitForDisconnect(room, 'player2', now, 120_000, dead)).toBe(true);
  });

  it('is cancelled when the seat acted after the stamp', () => {
    const room = {
      player1DisconnectedAt: 1_000_000,
      lastSeatInputAt: { player1: 1_000_001, player2: 0 },
    };
    expect(seatActedSince(room, 'player1', 1_000_000)).toBe(true);
    expect(shouldForfeitForDisconnect(room, 'player1', 1_500_000, 120_000, dead)).toBe(false);
    const stale = {
      player1DisconnectedAt: 1_000_000,
      lastSeatInputAt: { player1: 999_999, player2: 0 },
    };
    expect(seatActedSince(stale, 'player1', 1_000_000)).toBe(false);
    expect(shouldForfeitForDisconnect(stale, 'player1', 1_500_000, 120_000, dead)).toBe(true);
  });

  it('clears a stale stamp as soon as the player is reachable again', () => {
    const room = { player2DisconnectedAt: 1_000_000 };
    expect(shouldClearDisconnectStamp(room, 'player2', dead)).toBe(false);
    expect(shouldClearDisconnectStamp(room, 'player2', { seatSocketAlive: true, userHasLiveSocket: false })).toBe(true);
    expect(shouldClearDisconnectStamp(room, 'player2', { seatSocketAlive: false, userHasLiveSocket: true })).toBe(true);
    expect(shouldClearDisconnectStamp({}, 'player2', dead)).toBe(false);
  });

  it('noteSeatInput clears the stamp and refreshes the idle marker of the active seat only', () => {
    const room = makeRoom({
      chessClock: arm(createChessClock(), 'player1', 0),
      player1DisconnectedAt: 500,
      player2DisconnectedAt: 500,
    });
    noteSeatInput(room, 'player1', 60_000);
    expect(room.player1DisconnectedAt).toBeNull();
    expect(room.player2DisconnectedAt).toBe(500);
    expect(idleMs(room.chessClock, 60_000)).toBe(0);
    expect(room.lastSeatInputAt?.player1).toBe(60_000);
    noteSeatInput(room, 'player2', 90_000);
    expect(room.player2DisconnectedAt).toBeNull();
    expect(idleMs(room.chessClock, 90_000)).toBe(30_000);
  });
});

describe('Clock arming follows the awaited input (mulligan is out of the bank)', () => {
  it('never arms the clock during setup, mulligan or gameOver', () => {
    for (const phase of ['setup', 'mulligan', 'gameOver'] as const) {
      const state = makeState({ phase });
      expect(whoseInputIsAwaited(state)).toBeNull();
      const room = makeRoom({ gameState: state });
      syncChessClock(room, 5_000);
      expect(room.chessClock.active).toBeNull();
      expect(room.chessClock.player1.remainingMs).toBe(900_000);
      expect(room.chessClock.player2.remainingMs).toBe(900_000);
      expect(room.chessClockLastInputKey).toBeNull();
    }
  });

  it('stops the clock the moment the game is forfeited', () => {
    const state = makeState({ forfeitedBy: 'player1' } as Partial<GameState>);
    expect(whoseInputIsAwaited(state)).toBeNull();
    expect(computeAwaitedInputKey(state)).toBeNull();
    const room = makeRoom({ gameState: state, chessClock: arm(createChessClock(), 'player1', 0) });
    syncChessClock(room, 30_000);
    expect(room.chessClock.active).toBeNull();
    expect(room.chessClock.player1.remainingMs).toBe(870_000);
  });

  it('keeps the same idle countdown while the same choice stays open', () => {
    const room = makeRoom({ gameState: makeState({ phase: 'action', activePlayer: 'player1', turn: 2 }) });
    syncChessClock(room, 0);
    expect(room.chessClock.active).toBe('player1');
    expect(room.chessClockLastInputKey).toBe('action:player1:2');
    syncChessClock(room, 90_000);
    expect(idleMs(room.chessClock, 90_000)).toBe(90_000);
    expect(snapshotRemaining(room.chessClock, 'player1', 90_000)).toBe(810_000);
  });

  it('resets the idle countdown when a new input is requested to the same player', () => {
    const room = makeRoom({ gameState: makeState({ phase: 'action', activePlayer: 'player1', turn: 2 }) });
    syncChessClock(room, 0);
    room.gameState = makeState({
      phase: 'action',
      activePlayer: 'player1',
      turn: 2,
      pendingActions: [{ id: 'pa-new', player: 'player1' }],
    } as unknown as Partial<GameState>);
    syncChessClock(room, 90_000);
    expect(room.chessClockLastInputKey).toBe('pa:pa-new');
    expect(idleMs(room.chessClock, 90_000)).toBe(0);
    expect(snapshotRemaining(room.chessClock, 'player1', 90_000)).toBe(810_000);
  });

  it('hands the clock over when the awaited player changes', () => {
    const room = makeRoom({ gameState: makeState({ phase: 'action', activePlayer: 'player1', turn: 1 }) });
    syncChessClock(room, 0);
    room.gameState = makeState({ phase: 'action', activePlayer: 'player2', turn: 1 });
    syncChessClock(room, 60_000);
    expect(room.chessClock.active).toBe('player2');
    expect(room.chessClock.player1.remainingMs).toBe(840_000);
    expect(snapshotRemaining(room.chessClock, 'player2', 60_000)).toBe(900_000);
  });

  it('routes the clock to the forced resolver and to the mission scoring decider', () => {
    const forced = makeState({
      phase: 'action',
      activePlayer: 'player1',
      pendingForcedResolver: 'player2',
      pendingActions: [{ id: 'pa-forced', type: 'SELECT_TARGET', player: 'player2', description: 'forced' }],
    } as unknown as Partial<GameState>);
    expect(whoseInputIsAwaited(forced)).toBe('player2');
    expect(computeAwaitedInputKey(forced)).toBe('forced:player2');
    const scoring = makeState({
      phase: 'mission',
      missionScoringProgress: {
        winner: 'player2',
        currentRankIndex: 1,
        missionCardScoreDone: false,
        processedCharacterIds: [],
      },
    } as unknown as Partial<GameState>);
    expect(whoseInputIsAwaited(scoring)).toBe('player2');
    expect(computeAwaitedInputKey(scoring)).toBe('mission:player2:1:0:0');
  });

  it('freezes both clocks during the passive start and end phases', () => {
    for (const phase of ['start', 'end'] as const) {
      expect(whoseInputIsAwaited(makeState({ phase }))).toBeNull();
    }
  });
});

describe('Clock broadcast to players and spectators', () => {
  it('exposes both banks, the active side and the idle thresholds', () => {
    const clock = consumeIdleWarning(arm(createChessClock(), 'player1', 1_000));
    const payload = buildChessClockBroadcast(clock, 61_000);
    expect(payload.player1.remainingMs).toBe(840_000);
    expect(payload.player1.idleWarningUsed).toBe(true);
    expect(payload.player2.remainingMs).toBe(900_000);
    expect(payload.player2.idleWarningUsed).toBe(false);
    expect(payload.active).toBe('player1');
    expect(payload.serverNow).toBe(61_000);
    expect(payload.idleToastAtMs).toBe(60_000);
    expect(payload.idleLimitMs).toBe(120_000);
    expect(payload.activeStartedAt).toBe(61_000);
  });

  it('maps every expiry reason to the right win reason', () => {
    const map: Array<[ChessClockExpiryReason, string]> = [
      ['bank-empty', 'clock'],
      ['disconnect', 'disconnect'],
      ['idle-mandatory', 'idle'],
      ['idle-second', 'idle'],
      ['idle-unhandled', 'idle'],
    ];
    for (const [reason, expected] of map) {
      expect(chessClockExpiryReasonToWinReason(reason)).toBe(expected);
      expect(calculatePerformanceBonus({
        winnerScore: 20,
        loserScore: 0,
        loserBoardCount: 0,
        isForfeit: expected !== 'score',
      }).total).toBe(3);
    }
  });
});

describe('onChessClockTick: disconnect pauses anti-AFK but never the bank', () => {
  let applySpy: ReturnType<typeof vi.spyOn>;
  let winnerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const code of Array.from(rooms.keys())) rooms.delete(code);
    applySpy = vi.spyOn(GameEngine, 'applyAction').mockImplementation((state: any, player: any, action: any) => (
      action?.type === 'FORFEIT'
        ? { ...state, phase: 'gameOver', forfeitedBy: player }
        : { ...state, log: [...(state.log ?? []), { applied: action?.type }] }
    ));
    winnerSpy = vi.spyOn(GameEngine, 'getWinner').mockReturnValue(null);
  });

  afterEach(() => {
    for (const room of trackedRooms) stopChessClockTickLoop(room);
    trackedRooms.length = 0;
    applySpy.mockRestore();
    winnerSpy.mockRestore();
  });

  it('a 5-minute idle while the opponent is disconnected does not forfeit and does not burn the warning', () => {
    const now = Date.now();
    const { io } = makeIo();
    const room = makeRoom({
      code: 'DISC-PAUSE',
      chessClock: arm(createChessClock(), 'player1', now - 300_000),
      guestSocket: null,
      player2DisconnectedAt: now - 10_000,
    });
    onChessClockTick(room, io);
    expect(applySpy).not.toHaveBeenCalled();
    expect(room.finalized).toBe(false);
    expect(room.chessClock.player1.idleWarningUsed).toBe(false);
    expect(idleMs(room.chessClock, Date.now())).toBeLessThan(2_000);
    expect(snapshotRemaining(room.chessClock, 'player1', now)).toBe(600_000);
  });

  it('the very same idle auto-passes when the opponent is connected', () => {
    const now = Date.now();
    const { io } = makeIo();
    const room = makeRoom({
      code: 'DISC-NONE',
      chessClock: arm(createChessClock(), 'player1', now - 300_000),
    });
    onChessClockTick(room, io);
    expect(applySpy).toHaveBeenCalled();
    expect(lastActionOf(applySpy)?.type).toBe('PASS');
    expect(room.chessClock.player1.idleWarningUsed).toBe(true);
  });

  it('the 15-minute bank keeps draining while the opponent is disconnected', () => {
    const now = Date.now();
    const { io } = makeIo();
    const room = makeRoom({
      code: 'DISC-BANK',
      chessClock: arm(createChessClock(), 'player1', now - (CHESS_CLOCK_INITIAL_MS + 5_000)),
      guestSocket: null,
      player2DisconnectedAt: now - 10_000,
    });
    onChessClockTick(room, io);
    const action = lastActionOf(applySpy);
    expect(action?.type).toBe('FORFEIT');
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('clock');
  });

  it('forfeits a disconnected player at exactly 2 minutes with no prior warning', () => {
    const now = Date.now();
    const { io } = makeIo();
    const room = makeRoom({
      code: 'DISC-FORFEIT',
      hostSocket: '',
      chessClock: arm(createChessClock(), 'player2', now),
      player1DisconnectedAt: now - CHESS_CLOCK_DISCONNECT_FORFEIT_MS,
    });
    expect(room.chessClock.player1.idleWarningUsed).toBe(false);
    onChessClockTick(room, io);
    const action = lastActionOf(applySpy);
    expect(action?.type).toBe('FORFEIT');
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('disconnect');
    expect(applySpy.mock.calls[applySpy.mock.calls.length - 1][1]).toBe('player1' as PlayerID);
  });

  it('does not forfeit one millisecond before the 2-minute disconnect deadline', () => {
    const now = Date.now();
    const { io } = makeIo();
    const room = makeRoom({
      code: 'DISC-EARLY',
      hostSocket: '',
      chessClock: arm(createChessClock(), 'player2', now),
      player1DisconnectedAt: now - (CHESS_CLOCK_DISCONNECT_FORFEIT_MS - 1_000),
    });
    onChessClockTick(room, io);
    expect(applySpy).not.toHaveBeenCalled();
    expect(room.finalized).toBe(false);
  });

  it('an expiry ends the game once and disarms the clock', () => {
    const { io, emits } = makeIo();
    winnerSpy.mockReturnValue('player2');
    const room = makeRoom({
      code: 'EXPIRY-1',
      chessClock: arm(createChessClock(), 'player1', Date.now()),
    });
    handleChessClockExpiry(room, 'player1', io, 'idle-second');
    const action = lastActionOf(applySpy);
    expect(action?.type).toBe('FORFEIT');
    expect((action as Extract<GameAction, { type: 'FORFEIT' }>).reason).toBe('idle');
    expect(room.chessClock.active).toBeNull();
    expect(room.finalized).toBe(true);
    expect(emits.length).toBeGreaterThan(0);
    const callsAfterFirst = applySpy.mock.calls.length;
    handleChessClockExpiry(room, 'player1', io, 'idle-second');
    expect(applySpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('never touches a finalized room or a room with no game state', () => {
    const { io } = makeIo();
    const finalized = makeRoom({ code: 'FINAL-1', finalized: true });
    handleChessClockIdleLimit(finalized, 'player1', io);
    const empty = makeRoom({ code: 'EMPTY-1', gameState: null });
    handleChessClockIdleLimit(empty, 'player1', io);
    onChessClockTick(empty, io);
    expect(applySpy).not.toHaveBeenCalled();
  });
});

describe('Online room plumbing: seats, casual vs ranked, one live game per player', () => {
  beforeEach(() => {
    for (const code of Array.from(rooms.keys())) rooms.delete(code);
  });

  afterEach(() => {
    for (const code of Array.from(rooms.keys())) rooms.delete(code);
    trackedRooms.length = 0;
  });

  it('resolves the seat from the socket and from the user id', () => {
    const room = { hostSocket: 'a', guestSocket: 'b', hostId: 'u1', guestId: 'u2' };
    expect(resolveSeatBySocket(room, 'a')).toBe('player1');
    expect(resolveSeatBySocket(room, 'b')).toBe('player2');
    expect(resolveSeatBySocket(room, 'c')).toBeNull();
    expect(resolveSeatByUserId(room, 'u1')).toBe('player1');
    expect(resolveSeatByUserId(room, 'u2')).toBe('player2');
    expect(resolveSeatByUserId(room, 'u3')).toBeNull();
    expect(resolveSeatBySocket({ hostSocket: '', guestSocket: null }, '')).toBeNull();
  });

  it('blocks a player already sitting in another live game', () => {
    const live = makeRoom({ code: 'LIVE-1', hostId: 'busy', guestId: 'other' });
    rooms.set(live.code, live);
    expect(isUserInAnotherLiveGame('busy', null)).toBe(true);
    expect(isUserInAnotherLiveGame('other', null)).toBe(true);
    expect(isUserInAnotherLiveGame('free', null)).toBe(false);
    expect(isUserInAnotherLiveGame(null, null)).toBe(false);
    live.finalized = true;
    expect(isUserInAnotherLiveGame('busy', null)).toBe(false);
    live.finalized = false;
    live.gameState = makeState({ phase: 'gameOver' });
    expect(isUserInAnotherLiveGame('busy', null)).toBe(false);
  });

  it('ignores the room of the tournament match the player is being sent to', () => {
    const live = makeRoom({ code: 'LIVE-2', hostId: 'busy', tournamentMatchId: 'match-9' });
    rooms.set(live.code, live);
    expect(isUserInAnotherLiveGame('busy', 'match-9')).toBe(false);
    expect(isUserInAnotherLiveGame('busy', 'match-10')).toBe(true);
  });

  it('ranked online games write the standard elo fields, evolving writes its own', () => {
    expect(getEvolvingEloField(false)).toBe('elo');
    expect(getEvolvingEloType(false)).toBe('ranked');
    expect(getEvolvingEloField(true)).toBe('evolvingElo');
    expect(getEvolvingEloType(true)).toBe('evolving');
  });
});
