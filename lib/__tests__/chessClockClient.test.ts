import { describe, it, expect } from 'vitest';
import {
  computeChessClockRemainingMs,
  computeChessClockIdleMs,
  type ChessClockBroadcast,
} from '@/lib/socket/client';

function makeBroadcast(overrides: Partial<ChessClockBroadcast> = {}): ChessClockBroadcast {
  return {
    player1: { remainingMs: 900_000, idleWarningUsed: false },
    player2: { remainingMs: 900_000, idleWarningUsed: false },
    active: null,
    activeStartedAt: null,
    idleStartedAt: null,
    serverNow: 1_000_000,
    idleToastAtMs: 60_000,
    idleLimitMs: 120_000,
    ...overrides,
  };
}

describe('computeChessClockRemainingMs', () => {
  it('returns 0 when chessClock is null', () => {
    expect(computeChessClockRemainingMs(null, 'player1')).toBe(0);
  });

  it('returns the static remainingMs when player is not active', () => {
    const state = makeBroadcast({
      player1: { remainingMs: 700_000, idleWarningUsed: false },
      active: 'player2',
      activeStartedAt: 1_000_000,
    });
    expect(computeChessClockRemainingMs(state, 'player1', 1_005_000)).toBe(700_000);
  });

  it('returns the static remainingMs when active player matches but activeStartedAt is null', () => {
    const state = makeBroadcast({
      player1: { remainingMs: 500_000, idleWarningUsed: false },
      active: 'player1',
      activeStartedAt: null,
    });
    expect(computeChessClockRemainingMs(state, 'player1', 1_000_000)).toBe(500_000);
  });

  it('interpolates time since activeStartedAt for the active player', () => {
    const state = makeBroadcast({
      player1: { remainingMs: 600_000, idleWarningUsed: false },
      active: 'player1',
      activeStartedAt: 1_000_000,
    });
    expect(computeChessClockRemainingMs(state, 'player1', 1_030_000)).toBe(570_000);
  });

  it('clamps to 0 when elapsed exceeds remainingMs', () => {
    const state = makeBroadcast({
      player1: { remainingMs: 10_000, idleWarningUsed: false },
      active: 'player1',
      activeStartedAt: 1_000_000,
    });
    expect(computeChessClockRemainingMs(state, 'player1', 1_100_000)).toBe(0);
  });

  it('handles "now < activeStartedAt" (clock skew) without going negative-elapsed', () => {
    const state = makeBroadcast({
      player1: { remainingMs: 600_000, idleWarningUsed: false },
      active: 'player1',
      activeStartedAt: 1_000_000,
    });
    expect(computeChessClockRemainingMs(state, 'player1', 900_000)).toBe(600_000);
  });

  it('clamps a negative remainingMs (server bug) to 0', () => {
    const state = makeBroadcast({
      player1: { remainingMs: -5_000, idleWarningUsed: false },
      active: 'player1',
      activeStartedAt: 1_000_000,
    });
    expect(computeChessClockRemainingMs(state, 'player1', 1_000_000)).toBe(0);
  });
});

describe('computeChessClockIdleMs', () => {
  it('returns 0 when chessClock is null', () => {
    expect(computeChessClockIdleMs(null, 'player1')).toBe(0);
  });

  it('returns 0 when player is not the active one', () => {
    const state = makeBroadcast({
      active: 'player2',
      idleStartedAt: 1_000_000,
    });
    expect(computeChessClockIdleMs(state, 'player1', 1_120_000)).toBe(0);
  });

  it('returns 0 when idleStartedAt is null', () => {
    const state = makeBroadcast({
      active: 'player1',
      idleStartedAt: null,
    });
    expect(computeChessClockIdleMs(state, 'player1', 1_000_000)).toBe(0);
  });

  it('returns the elapsed idle time for the active player', () => {
    const state = makeBroadcast({
      active: 'player1',
      idleStartedAt: 1_000_000,
    });
    expect(computeChessClockIdleMs(state, 'player1', 1_125_000)).toBe(125_000);
  });

  it('clamps to 0 when "now < idleStartedAt" (clock skew)', () => {
    const state = makeBroadcast({
      active: 'player1',
      idleStartedAt: 1_000_000,
    });
    expect(computeChessClockIdleMs(state, 'player1', 900_000)).toBe(0);
  });
});

describe('ChessClockBroadcast payload shape', () => {
  it('is JSON-serializable', () => {
    const state = makeBroadcast({
      active: 'player1',
      activeStartedAt: 5_000,
      idleStartedAt: 5_000,
    });
    expect(() => JSON.stringify(state)).not.toThrow();
    const round = JSON.parse(JSON.stringify(state));
    expect(round.active).toBe('player1');
    expect(round.player1.remainingMs).toBe(900_000);
  });

  it('lets the client derive both clocks independently', () => {
    const state = makeBroadcast({
      player1: { remainingMs: 600_000, idleWarningUsed: false },
      player2: { remainingMs: 800_000, idleWarningUsed: true },
      active: 'player1',
      activeStartedAt: 1_000_000,
    });
    const p1 = computeChessClockRemainingMs(state, 'player1', 1_030_000);
    const p2 = computeChessClockRemainingMs(state, 'player2', 1_030_000);
    expect(p1).toBe(570_000);
    expect(p2).toBe(800_000);
  });
});
