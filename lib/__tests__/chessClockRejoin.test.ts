import { describe, it, expect } from 'vitest';
import {
  computeChessClockRemainingMs,
  type ChessClockBroadcast,
} from '@/lib/socket/client';
import { createChessClock, arm, snapshotForBroadcast, type ChessClockState } from '@/lib/timing/chessClock';

function makeBroadcastFromState(state: ChessClockState, now: number): ChessClockBroadcast {
  const snap = snapshotForBroadcast(state, now);
  return {
    player1: { remainingMs: snap.player1.remainingMs, idleWarningUsed: snap.player1.idleWarningUsed },
    player2: { remainingMs: snap.player2.remainingMs, idleWarningUsed: snap.player2.idleWarningUsed },
    active: snap.active,
    activeStartedAt: snap.activeStartedAt,
    idleStartedAt: snap.idleStartedAt,
    serverNow: now,
    idleToastAtMs: 120_000,
    idleLimitMs: 180_000,
  };
}

describe('Phase 10 — rejoin recomputes correct remainingMs after disconnect', () => {
  it('Scenario A: player A disconnects on their turn for 5s, then rejoins. Their clock has decremented by 5s.', () => {
    let state = createChessClock();
    state = arm(state, 'player1', 1_000_000);

    const serverNowAtRejoin = 1_005_000;
    const broadcast = makeBroadcastFromState(state, serverNowAtRejoin);

    expect(broadcast.player1.remainingMs).toBe(state.player1.remainingMs - 5_000);
    expect(broadcast.active).toBe('player1');
    expect(broadcast.activeStartedAt).toBe(serverNowAtRejoin);

    const localRemaining = computeChessClockRemainingMs(broadcast, 'player1', serverNowAtRejoin);
    expect(localRemaining).toBe(broadcast.player1.remainingMs);
  });

  it('Scenario B: player A disconnects while opponent is active. Opponent clock still ticking on rejoin.', () => {
    let state = createChessClock();
    state = arm(state, 'player2', 1_000_000);

    const serverNowAtRejoin = 1_010_000;
    const broadcast = makeBroadcastFromState(state, serverNowAtRejoin);

    expect(broadcast.active).toBe('player2');
    expect(broadcast.player2.remainingMs).toBe(state.player2.remainingMs - 10_000);
    expect(broadcast.player1.remainingMs).toBe(state.player1.remainingMs);

    const myRemaining = computeChessClockRemainingMs(broadcast, 'player1', serverNowAtRejoin);
    const oppRemaining = computeChessClockRemainingMs(broadcast, 'player2', serverNowAtRejoin);
    expect(myRemaining).toBe(state.player1.remainingMs);
    expect(oppRemaining).toBe(broadcast.player2.remainingMs);
  });

  it('Scenario C: both disconnect, tick loop keeps decrementing the active player; first to rejoin sees correct values', () => {
    let state = createChessClock();
    state = arm(state, 'player1', 0);

    const tickAt60s = makeBroadcastFromState(state, 60_000);
    expect(tickAt60s.player1.remainingMs).toBe(state.player1.remainingMs - 60_000);

    const rejoinAt30s = makeBroadcastFromState(state, 30_000);
    expect(rejoinAt30s.player1.remainingMs).toBe(state.player1.remainingMs - 30_000);
  });

  it('Scenario D: player never reconnects; bank decrements toward 0 over their full bank', () => {
    let state = createChessClock();
    state = arm(state, 'player1', 0);
    const initial = state.player1.remainingMs;

    const justBeforeEmpty = makeBroadcastFromState(state, initial - 100);
    expect(justBeforeEmpty.player1.remainingMs).toBe(100);

    const atEmpty = makeBroadcastFromState(state, initial);
    expect(atEmpty.player1.remainingMs).toBe(0);

    const pastEmpty = makeBroadcastFromState(state, initial + 5_000);
    expect(pastEmpty.player1.remainingMs).toBe(0);
  });

  it('rejoining client computes the same remaining as the server snapshot, regardless of clock skew', () => {
    let state = createChessClock();
    state = arm(state, 'player1', 1_000_000);

    const serverNow = 1_007_500;
    const broadcast = makeBroadcastFromState(state, serverNow);

    const serverDerivedRemaining = state.player1.remainingMs - 7_500;
    expect(broadcast.player1.remainingMs).toBe(serverDerivedRemaining);

    const clientLocalAtSameInstant = computeChessClockRemainingMs(broadcast, 'player1', serverNow);
    expect(clientLocalAtSameInstant).toBe(serverDerivedRemaining);

    const clientWithSkew = computeChessClockRemainingMs(broadcast, 'player1', serverNow + 250);
    expect(clientWithSkew).toBe(serverDerivedRemaining - 250);
  });
});
