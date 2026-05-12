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
  CHESS_CLOCK_IDLE_TOAST_MS,
  CHESS_CLOCK_MULLIGAN_IDLE_MS,
  CHESS_CLOCK_DISPLAY_ORANGE_MS,
  CHESS_CLOCK_DISPLAY_RED_MS,
  CHESS_CLOCK_SOUND_TICK_MS,
  CHESS_CLOCK_SOUND_ALARM_MS,
} from '@/lib/timing/chessClock';

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

  it('snapshotForBroadcast resets activeStartedAt so client interpolation does not double-count', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    const snap = snapshotForBroadcast(c, t0 + 7_500);
    expect(snap.activeStartedAt).toBe(t0 + 7_500);
    const clientNow = t0 + 7_500;
    const liveRemaining = snap.player1.remainingMs - (clientNow - snap.activeStartedAt!);
    expect(liveRemaining).toBe(CHESS_CLOCK_INITIAL_MS - 7_500);
  });

  it('snapshotForBroadcast at a later client tick still reads correctly', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    const snap = snapshotForBroadcast(c, t0 + 7_500);
    const clientNow = t0 + 10_000;
    const liveRemaining = snap.player1.remainingMs - (clientNow - snap.activeStartedAt!);
    expect(liveRemaining).toBe(CHESS_CLOCK_INITIAL_MS - 10_000);
  });

  it('snapshotForBroadcast PRESERVES idleStartedAt as the original server timestamp', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    const snap = snapshotForBroadcast(c, t0 + 90_000);
    expect(snap.idleStartedAt).toBe(t0);
    expect(idleMs(snap, t0 + 90_000)).toBe(90_000);
  });

  it('snapshot then live idle measurement reflects total idle, not just the post-snapshot delta', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(), 'player1', t0);
    const snap = snapshotForBroadcast(c, t0 + 90_000);
    const clientNow = t0 + 120_000;
    const idle = clientNow - snap.idleStartedAt!;
    expect(idle).toBe(120_000);
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

  it('idle toast constant is 2 minutes (1 min before auto-action triggers)', () => {
    expect(CHESS_CLOCK_IDLE_TOAST_MS).toBe(2 * 60 * 1000);
    expect(CHESS_CLOCK_IDLE_TOAST_MS).toBeLessThan(CHESS_CLOCK_IDLE_LIMIT_MS);
  });

  it('mulligan idle cancel constant is 1 minute', () => {
    expect(CHESS_CLOCK_MULLIGAN_IDLE_MS).toBe(60 * 1000);
  });

  it('initial bank constant is 15 minutes', () => {
    expect(CHESS_CLOCK_INITIAL_MS).toBe(15 * 60 * 1000);
  });

  it('display threshold constants match spec (orange 60s, red 30s)', () => {
    expect(CHESS_CLOCK_DISPLAY_ORANGE_MS).toBe(60 * 1000);
    expect(CHESS_CLOCK_DISPLAY_RED_MS).toBe(30 * 1000);
    expect(CHESS_CLOCK_DISPLAY_RED_MS).toBeLessThan(CHESS_CLOCK_DISPLAY_ORANGE_MS);
  });

  it('sound threshold constants match spec (tick 30s, alarm 10s)', () => {
    expect(CHESS_CLOCK_SOUND_TICK_MS).toBe(30 * 1000);
    expect(CHESS_CLOCK_SOUND_ALARM_MS).toBe(10 * 1000);
    expect(CHESS_CLOCK_SOUND_ALARM_MS).toBeLessThan(CHESS_CLOCK_SOUND_TICK_MS);
  });

  it('display orange and sound tick happen at the same threshold (30s)', () => {
    expect(CHESS_CLOCK_SOUND_TICK_MS).toBe(CHESS_CLOCK_DISPLAY_RED_MS);
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

  it('arm does not mutate the input state', () => {
    const t0 = 1_000_000;
    const original = createChessClock();
    const snapshot = JSON.stringify(original);
    arm(original, 'player1', t0);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('disarm does not mutate the input state', () => {
    const t0 = 1_000_000;
    const armed = arm(createChessClock(), 'player1', t0);
    const snapshot = JSON.stringify(armed);
    disarm(armed, t0 + 5_000);
    expect(JSON.stringify(armed)).toBe(snapshot);
  });

  it('consumeIdleWarning does not mutate the input state', () => {
    const t0 = 1_000_000;
    const armed = arm(createChessClock(), 'player1', t0);
    const snapshot = JSON.stringify(armed);
    consumeIdleWarning(armed);
    expect(JSON.stringify(armed)).toBe(snapshot);
  });

  it('resetIdle does not mutate the input state', () => {
    const t0 = 1_000_000;
    const armed = arm(createChessClock(), 'player1', t0);
    const snapshot = JSON.stringify(armed);
    resetIdle(armed, t0 + 30_000);
    expect(JSON.stringify(armed)).toBe(snapshot);
  });

  it('snapshotForBroadcast does not mutate the input state', () => {
    const t0 = 1_000_000;
    const armed = arm(createChessClock(), 'player1', t0);
    const snapshot = JSON.stringify(armed);
    snapshotForBroadcast(armed, t0 + 15_000);
    expect(JSON.stringify(armed)).toBe(snapshot);
  });

  it('snapshotForBroadcast does not mutate the active player nested object', () => {
    const t0 = 1_000_000;
    const armed = arm(createChessClock(), 'player1', t0);
    const originalPlayer1Ref = armed.player1;
    snapshotForBroadcast(armed, t0 + 15_000);
    expect(armed.player1).toBe(originalPlayer1Ref);
    expect(armed.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
  });

  it('createChessClock rejects negative or non-finite initial bank and falls back to default', () => {
    expect(createChessClock(-1000).player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(createChessClock(Number.NaN).player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(createChessClock(Number.POSITIVE_INFINITY).player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(createChessClock(0).player1.remainingMs).toBe(0);
  });

  it('bankEmpty correctly identifies an empty bank on a freshly snapshotted state', () => {
    const t0 = 1_000_000;
    const c = arm(createChessClock(1_000), 'player1', t0);
    const snap = snapshotForBroadcast(c, t0 + 1_000);
    expect(snap.player1.remainingMs).toBe(0);
    expect(bankEmpty(snap, t0 + 1_000)).toBe(true);
    expect(bankEmpty(snap, t0 + 5_000)).toBe(true);
  });

  it('handles server clock going backwards without granting negative time', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = disarm(c, t0 - 5_000);
    expect(c.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    c = arm(c, 'player1', t0);
    expect(idleMs(c, t0 - 1_000)).toBe(0);
    expect(snapshotRemaining(c, 'player1', t0 - 1_000)).toBe(CHESS_CLOCK_INITIAL_MS);
  });

  it('consumeIdleWarning is idempotent when already consumed', () => {
    const t0 = 1_000_000;
    let c = arm(createChessClock(), 'player1', t0);
    c = consumeIdleWarning(c);
    c = consumeIdleWarning(c);
    c = consumeIdleWarning(c);
    expect(hasIdleWarning(c, 'player1')).toBe(true);
    expect(hasIdleWarning(c, 'player2')).toBe(false);
  });
});
