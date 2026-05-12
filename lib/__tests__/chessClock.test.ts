import { describe, it, expect } from 'vitest';
import {
  createChessClock,
  arm,
  disarm,
  resetIdle,
  idleMs,
  bankEmpty,
  consumeIdleWarning,
  hasIdleWarning,
  snapshotRemaining,
  snapshotForBroadcast,
  CHESS_CLOCK_INITIAL_MS,
  CHESS_CLOCK_IDLE_LIMIT_MS,
} from '@/lib/socket/chessClock';

describe('chessClock', () => {
  it('creates a fresh clock with full bank and no active player', () => {
    const c = createChessClock();
    expect(c.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(c.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(c.active).toBe(null);
    expect(c.player1.idleWarningUsed).toBe(false);
  });

  it('arms a player and starts the countdown', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    expect(c.active).toBe('player1');
    expect(c.activeStartedAt).toBe(t0);
    expect(c.idleStartedAt).toBe(t0);
  });

  it('disarm deducts the elapsed time from the active player only', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = disarm(c, t0 + 10_000);
    expect(c.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS - 10_000);
    expect(c.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(c.active).toBe(null);
  });

  it('arming a different player while one is active disarms the previous', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = arm(c, 'player2', t0 + 5_000);
    expect(c.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS - 5_000);
    expect(c.active).toBe('player2');
    expect(c.activeStartedAt).toBe(t0 + 5_000);
  });

  it('snapshotRemaining returns the live remaining ms for the active player', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    expect(snapshotRemaining(c, 'player1', t0 + 12_000)).toBe(CHESS_CLOCK_INITIAL_MS - 12_000);
    expect(snapshotRemaining(c, 'player2', t0 + 12_000)).toBe(CHESS_CLOCK_INITIAL_MS);
  });

  it('snapshotRemaining clamps at 0 (never negative)', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    const after = snapshotRemaining(c, 'player1', t0 + CHESS_CLOCK_INITIAL_MS + 30_000);
    expect(after).toBe(0);
  });

  it('snapshotForBroadcast bakes elapsed into the active player bank', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    const snap = snapshotForBroadcast(c, t0 + 7_500);
    expect(snap.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS - 7_500);
    expect(snap.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
  });

  it('idleMs measures time since idleStartedAt', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    expect(idleMs(c, t0 + 45_000)).toBe(45_000);
  });

  it('resetIdle restarts the idle countdown without changing the bank', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = resetIdle(c, t0 + 30_000);
    expect(idleMs(c, t0 + 30_000)).toBe(0);
    expect(snapshotRemaining(c, 'player1', t0 + 30_000)).toBe(CHESS_CLOCK_INITIAL_MS - 30_000);
  });

  it('bankEmpty fires at or past 0 remaining for the active player', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    expect(bankEmpty(c, t0 + CHESS_CLOCK_INITIAL_MS - 1)).toBe(false);
    expect(bankEmpty(c, t0 + CHESS_CLOCK_INITIAL_MS)).toBe(true);
    expect(bankEmpty(c, t0 + CHESS_CLOCK_INITIAL_MS + 5_000)).toBe(true);
  });

  it('bankEmpty is false when no player is active', () => {
    const c = createChessClock();
    expect(bankEmpty(c, Date.now())).toBe(false);
  });

  it('consumeIdleWarning marks the active player as having used their warning', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    expect(hasIdleWarning(c, 'player1')).toBe(false);
    c = consumeIdleWarning(c);
    expect(hasIdleWarning(c, 'player1')).toBe(true);
    expect(hasIdleWarning(c, 'player2')).toBe(false);
  });

  it('idle warning persists across disarm + rearm for the same player', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = consumeIdleWarning(c);
    c = disarm(c, t0 + 10_000);
    expect(hasIdleWarning(c, 'player1')).toBe(true);
    c = arm(c, 'player1', t0 + 20_000);
    expect(hasIdleWarning(c, 'player1')).toBe(true);
  });

  it('round-trip arm -> disarm -> arm same player accumulates time correctly', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = disarm(c, t0 + 10_000);
    c = arm(c, 'player1', t0 + 30_000);
    c = disarm(c, t0 + 35_000);
    expect(c.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS - 15_000);
  });

  it('idle limit constant is 3 minutes', () => {
    expect(CHESS_CLOCK_IDLE_LIMIT_MS).toBe(3 * 60 * 1000);
  });

  it('disarm is a no-op when no player is active', () => {
    const c = createChessClock();
    const after = disarm(c, Date.now());
    expect(after).toBe(c);
  });

  it('resetIdle is a no-op when no player is active', () => {
    const c = createChessClock();
    const after = resetIdle(c, Date.now());
    expect(after).toBe(c);
  });

  it('idleMs returns 0 when no player is active', () => {
    const c = createChessClock();
    expect(idleMs(c, Date.now())).toBe(0);
  });

  it('snapshotForBroadcast returns state unchanged when no player is active', () => {
    const c = createChessClock();
    expect(snapshotForBroadcast(c, Date.now())).toBe(c);
  });

  it('consumeIdleWarning is a no-op when no player is active', () => {
    const c = createChessClock();
    const after = consumeIdleWarning(c);
    expect(after).toBe(c);
  });

  it('arming player1 does not affect player2 bank', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = disarm(c, t0 + 60_000);
    expect(c.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
  });

  it('idle warnings are independent per player', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = consumeIdleWarning(c);
    c = arm(c, 'player2', t0 + 10_000);
    expect(hasIdleWarning(c, 'player1')).toBe(true);
    expect(hasIdleWarning(c, 'player2')).toBe(false);
    c = consumeIdleWarning(c);
    expect(hasIdleWarning(c, 'player1')).toBe(true);
    expect(hasIdleWarning(c, 'player2')).toBe(true);
  });

  it('createChessClock accepts a custom initial bank', () => {
    const c = createChessClock(60_000);
    expect(c.player1.remainingMs).toBe(60_000);
    expect(c.player2.remainingMs).toBe(60_000);
  });

  it('re-arming the same player resets the idle countdown without losing bank time', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    expect(idleMs(c, t0 + 90_000)).toBe(90_000);
    c = arm(c, 'player1', t0 + 90_000);
    expect(idleMs(c, t0 + 90_000)).toBe(0);
    expect(c.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS - 90_000);
  });
});
