import { describe, it, expect } from 'vitest';
import { __ReplayChessClockTestables } from '@/components/replay/ReplayChessClockDisplay';
import { createChessClock, arm, snapshotForBroadcast, type ChessClockState } from '@/lib/timing/chessClock';

const { formatRemaining, colorForRemaining, ORANGE_AT_MS, RED_AT_MS, HARD_RED_AT_MS } = __ReplayChessClockTestables;

describe('ReplayChessClockDisplay helpers', () => {
  it('formatRemaining matches the live display helper output', () => {
    expect(formatRemaining(15 * 60_000)).toBe('15:00');
    expect(formatRemaining(9 * 60_000 + 5_000)).toBe('9:05');
    expect(formatRemaining(60_000)).toBe('1:00');
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(59_500)).toBe('0:59');
    expect(formatRemaining(-100)).toBe('0:00');
  });

  it('colorForRemaining uses identical thresholds to the live display', () => {
    expect(colorForRemaining(120_000, true)).toBe('#cccccc');
    expect(colorForRemaining(120_000, false)).toBe('#e0e0e0');
    expect(colorForRemaining(ORANGE_AT_MS, false)).toBe('#cc7a30');
    expect(colorForRemaining(RED_AT_MS, false)).toBe('#b33e3e');
    expect(colorForRemaining(HARD_RED_AT_MS, false)).toBe('#b33e3e');
    expect(colorForRemaining(0, false)).toBe('#b33e3e');
  });

  it('threshold constants match live display constants', () => {
    expect(ORANGE_AT_MS).toBe(60_000);
    expect(RED_AT_MS).toBe(30_000);
    expect(HARD_RED_AT_MS).toBe(10_000);
  });
});

describe('Phase 11 — replay clock snapshot integrity', () => {
  it('snapshotForBroadcast at activeStartedAt returns the persisted remainingMs unchanged', () => {
    let state: ChessClockState = createChessClock();
    state = arm(state, 'player1', 1_000_000);

    const snapshotTime = 1_005_000;
    const snap = snapshotForBroadcast(state, snapshotTime);

    expect(snap.activeStartedAt).toBe(snapshotTime);
    expect(snap.player1.remainingMs).toBe(state.player1.remainingMs - 5_000);

    const replaySnap = snapshotForBroadcast(snap, snap.activeStartedAt ?? 0);
    expect(replaySnap.player1.remainingMs).toBe(snap.player1.remainingMs);
  });

  it('clock snapshot at end of game is preserved across serialization', () => {
    let state: ChessClockState = createChessClock();
    state = arm(state, 'player2', 0);

    const finalTime = 480_000;
    const snap = snapshotForBroadcast(state, finalTime);

    const serialized = JSON.parse(JSON.stringify(snap)) as ChessClockState;
    expect(serialized.active).toBe('player2');
    expect(serialized.player2.remainingMs).toBe(state.player2.remainingMs - 480_000);
    expect(serialized.player1.remainingMs).toBe(state.player1.remainingMs);
  });
});
