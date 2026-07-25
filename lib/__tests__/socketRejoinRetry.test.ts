import { describe, it, expect } from 'vitest';
import {
  decideRejoinRetry,
  deriveConnectionPhase,
  isTerminalRejoinFailure,
  nextRejoinDelayMs,
  rejoinFailureErrorKey,
  shouldAttemptRejoin,
  REJOIN_RETRY_DELAYS_MS,
} from '@/lib/socket/rejoinRetry';

describe('nextRejoinDelayMs', () => {
  it('walks the backoff ladder and then caps at the last delay', () => {
    expect(nextRejoinDelayMs(0)).toBe(500);
    expect(nextRejoinDelayMs(1)).toBe(1000);
    expect(nextRejoinDelayMs(2)).toBe(2000);
    expect(nextRejoinDelayMs(3)).toBe(4000);
    expect(nextRejoinDelayMs(4)).toBe(8000);
    expect(nextRejoinDelayMs(50)).toBe(REJOIN_RETRY_DELAYS_MS[REJOIN_RETRY_DELAYS_MS.length - 1]);
  });

  it('is defensive about a negative attempt counter', () => {
    expect(nextRejoinDelayMs(-3)).toBe(500);
  });
});

describe('decideRejoinRetry', () => {
  it('retries a recoverable failure with backoff', () => {
    expect(decideRejoinRetry(0, 'not-authed')).toEqual({ kind: 'retry', delayMs: 500 });
    expect(decideRejoinRetry(2, 'no-response')).toEqual({ kind: 'retry', delayMs: 2000 });
  });

  it('stops for good when the room no longer exists', () => {
    expect(decideRejoinRetry(0, 'room-gone')).toEqual({ kind: 'stop', terminal: true });
    expect(decideRejoinRetry(0, 'not-in-room')).toEqual({ kind: 'stop', terminal: true });
  });

  it('classifies terminal reasons consistently', () => {
    expect(isTerminalRejoinFailure('room-gone')).toBe(true);
    expect(isTerminalRejoinFailure('not-in-room')).toBe(true);
    expect(isTerminalRejoinFailure('not-authed')).toBe(false);
    expect(isTerminalRejoinFailure('no-response')).toBe(false);
  });

  it('never loops silently: a retryable failure always yields a positive delay', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const plan = decideRejoinRetry(attempt, 'no-response');
      expect(plan.kind).toBe('retry');
      if (plan.kind === 'retry') expect(plan.delayMs).toBeGreaterThan(0);
    }
  });
});

describe('rejoinFailureErrorKey', () => {
  it('maps every reason to a translatable key', () => {
    expect(rejoinFailureErrorKey('room-gone')).toBe('game.error.rejoinRoomGone');
    expect(rejoinFailureErrorKey('not-in-room')).toBe('game.error.rejoinRoomGone');
    expect(rejoinFailureErrorKey('not-authed')).toBe('game.error.rejoinFailed');
    expect(rejoinFailureErrorKey('no-response')).toBe('game.error.rejoinFailed');
  });
});

describe('deriveConnectionPhase', () => {
  it('is offline whenever the transport is down', () => {
    expect(deriveConnectionPhase({ transportConnected: false, hasMatchContext: true, seatBound: true })).toBe('offline');
    expect(deriveConnectionPhase({ transportConnected: false, hasMatchContext: false, seatBound: false })).toBe('offline');
  });

  it('is online outside of a match even when no seat is bound', () => {
    expect(deriveConnectionPhase({ transportConnected: true, hasMatchContext: false, seatBound: false })).toBe('online');
  });

  it('is resyncing when the transport is up but the seat is not bound (the frozen-board case)', () => {
    expect(deriveConnectionPhase({ transportConnected: true, hasMatchContext: true, seatBound: false })).toBe('resyncing');
  });

  it('is online once the seat is confirmed', () => {
    expect(deriveConnectionPhase({ transportConnected: true, hasMatchContext: true, seatBound: true })).toBe('online');
  });
});

describe('shouldAttemptRejoin', () => {
  const base = {
    transportConnected: true,
    roomCode: 'ABCDEF',
    userId: 'user-1',
    seatBound: false,
    gameEnded: false,
  };

  it('rejoins as soon as the transport is up and the seat is not bound', () => {
    expect(shouldAttemptRejoin(base)).toBe(true);
  });

  it('does not rejoin while the transport is down', () => {
    expect(shouldAttemptRejoin({ ...base, transportConnected: false })).toBe(false);
  });

  it('does not rejoin without a match context', () => {
    expect(shouldAttemptRejoin({ ...base, roomCode: null })).toBe(false);
    expect(shouldAttemptRejoin({ ...base, userId: null })).toBe(false);
  });

  it('does not rejoin a finished game', () => {
    expect(shouldAttemptRejoin({ ...base, gameEnded: true })).toBe(false);
  });

  it('does not rejoin when the seat is already bound', () => {
    expect(shouldAttemptRejoin({ ...base, seatBound: true })).toBe(false);
  });

  it('does not depend on whether this was the first connect of the socket', () => {
    expect(shouldAttemptRejoin(base)).toBe(shouldAttemptRejoin({ ...base }));
  });
});
