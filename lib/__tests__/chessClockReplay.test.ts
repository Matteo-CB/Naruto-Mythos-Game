import { describe, it, expect } from 'vitest';
import { createChessClock, arm, snapshotForBroadcast, type ChessClockState } from '@/lib/timing/chessClock';

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
