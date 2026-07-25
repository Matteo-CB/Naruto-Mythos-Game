import { describe, it, expect } from 'vitest';
import { decideIdleOutcome, type IdleStateView } from '@/lib/timing/idleDecision';
import { decideAbsenceOutcome, MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE, type AbsenceEvidence } from '@/lib/tournament/absenceDecision';
import { chessClockExpiryReasonToWinReason, tournamentMatchTimeLimitStillPlaying, TOURNAMENT_MATCH_PROGRESS_WINDOW_MS } from '@/lib/socket/server';
import { createChessClock, arm as armChessClock } from '@/lib/timing/chessClock';

function actionState(overrides: Partial<IdleStateView> = {}): IdleStateView {
  return {
    phase: 'action',
    activePlayer: 'player1',
    pendingForcedResolver: null,
    pendingActions: [],
    pendingEffects: [],
    ...overrides,
  };
}

describe('idle outcome decision', () => {
  it('auto-passes on the first idle in the action phase, never a defeat', () => {
    const d = decideIdleOutcome(actionState(), 'player1', { idleWarningUsed: false, disconnectVerified: false });
    expect(d.kind).toBe('auto-pass');
  });

  it('defeats on the second idle in the action phase', () => {
    const d = decideIdleOutcome(actionState(), 'player1', { idleWarningUsed: true, disconnectVerified: false });
    expect(d).toEqual({ kind: 'defeat', reason: 'idle-second' });
  });

  it('auto-declines a declinable pending effect on the first idle', () => {
    const state = actionState({
      pendingEffects: [{ id: 'e1', resolved: false, selectingPlayer: 'player1', isOptional: true, isMandatory: false }],
    });
    const d = decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false });
    expect(d).toEqual({ kind: 'auto-decline', pendingEffectId: 'e1' });
  });

  it('warns instead of defeating on a FIRST idle stuck on a mandatory choice', () => {
    const state = actionState({
      pendingEffects: [{ id: 'e1', resolved: false, selectingPlayer: 'player1', isOptional: false, isMandatory: true }],
    });
    const d = decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false });
    expect(d).toEqual({ kind: 'warn' });
  });

  it('defeats on the second idle stuck on a mandatory choice', () => {
    const state = actionState({
      pendingEffects: [{ id: 'e1', resolved: false, selectingPlayer: 'player1', isOptional: false, isMandatory: true }],
    });
    const d = decideIdleOutcome(state, 'player1', { idleWarningUsed: true, disconnectVerified: false });
    expect(d).toEqual({ kind: 'defeat', reason: 'idle-mandatory' });
  });

  it('warns rather than defeating on a mandatory pending action on the first idle', () => {
    const state = actionState({
      pendingActions: [{ player: 'player1', sourceEffectId: 'e1' }],
      pendingEffects: [{ id: 'e1', resolved: false, selectingPlayer: 'player1', isOptional: false, isMandatory: true }],
    });
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false })).toEqual({ kind: 'warn' });
  });

  it('never turns an unhandled situation into a defeat, even on the second idle', () => {
    const state = actionState({ phase: 'mission', activePlayer: 'player2' });
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false })).toEqual({ kind: 'unstick' });
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: true, disconnectVerified: false })).toEqual({ kind: 'unstick' });
  });

  it('only defeats for a disconnect when the disconnect was verified', () => {
    expect(decideIdleOutcome(actionState(), 'player1', { idleWarningUsed: false, disconnectVerified: true }))
      .toEqual({ kind: 'defeat', reason: 'disconnect' });
    expect(decideIdleOutcome(actionState(), 'player1', { idleWarningUsed: false, disconnectVerified: false }).kind)
      .not.toBe('defeat');
  });

  it('rootOptional makes a mandatory-flagged effect declinable', () => {
    const state = actionState({
      pendingEffects: [{ id: 'e1', resolved: false, selectingPlayer: 'player1', isOptional: false, isMandatory: true, rootOptional: true }],
    });
    expect(decideIdleOutcome(state, 'player1', { idleWarningUsed: false, disconnectVerified: false }))
      .toEqual({ kind: 'auto-decline', pendingEffectId: 'e1' });
  });
});

describe('disconnect defeat is reported honestly', () => {
  it('does not label a disconnect forfeit as an inactivity forfeit', () => {
    expect(chessClockExpiryReasonToWinReason('disconnect')).toBe('disconnect');
    expect(chessClockExpiryReasonToWinReason('bank-empty')).toBe('clock');
    expect(chessClockExpiryReasonToWinReason('idle-second')).toBe('idle');
    expect(chessClockExpiryReasonToWinReason('idle-mandatory')).toBe('idle');
  });
});

function evidence(overrides: Partial<AbsenceEvidence> = {}): AbsenceEvidence {
  return {
    p1: 'p1',
    p2: 'p2',
    knownAbsentPlayerId: null,
    readySetPresent: false,
    readyP1: false,
    readyP2: false,
    seatBoundP1: false,
    seatBoundP2: false,
    onlineP1: false,
    onlineP2: false,
    gameLive: false,
    cycles: 0,
    maxCycles: 8,
    ...overrides,
  };
}

describe('tournament absence decision', () => {
  it('never forfeits while the match game is actually being played', () => {
    const out = decideAbsenceOutcome(evidence({ gameLive: true, cycles: 99 }));
    expect(out).toEqual({ kind: 'noop', reason: 'game-live' });
  });

  it('does not double-forfeit two players whose confirmed readiness is still remembered', () => {
    const out = decideAbsenceOutcome(evidence({
      readySetPresent: true,
      readyP1: true,
      readyP2: true,
      knownAbsentPlayerId: null,
    }));
    expect(out).toEqual({ kind: 'noop', reason: 'no-forfeitable' });
  });

  it('does not double-forfeit two players who are both sitting in the match room', () => {
    const out = decideAbsenceOutcome(evidence({
      readySetPresent: false,
      knownAbsentPlayerId: null,
      seatBoundP1: true,
      seatBoundP2: true,
      cycles: 99,
    }));
    expect(out).toEqual({ kind: 'noop', reason: 'no-forfeitable' });
  });

  it('gives online but unconfirmed players the full grace window before any forfeit', () => {
    for (let cycles = 0; cycles < 8; cycles += 1) {
      const out = decideAbsenceOutcome(evidence({
        readySetPresent: false,
        knownAbsentPlayerId: null,
        onlineP1: true,
        onlineP2: true,
        cycles,
      }));
      expect(out).toEqual({ kind: 'grace' });
    }
  });

  it('never forfeits an online player whose seat is bound, even at the grace cap', () => {
    const out = decideAbsenceOutcome(evidence({
      readySetPresent: false,
      knownAbsentPlayerId: null,
      onlineP1: true,
      onlineP2: true,
      seatBoundP1: true,
      seatBoundP2: true,
      cycles: 8,
    }));
    expect(out).toEqual({ kind: 'noop', reason: 'no-forfeitable' });
  });

  it('forfeits the single player the server positively identified as absent', () => {
    const out = decideAbsenceOutcome(evidence({ knownAbsentPlayerId: 'p2', onlineP1: true }));
    expect(out).toEqual({ kind: 'forfeit', players: ['p2'] });
  });

  it('grants grace to an identified but still-connected absent player', () => {
    const out = decideAbsenceOutcome(evidence({ knownAbsentPlayerId: 'p2', onlineP1: true, onlineP2: true }));
    expect(out).toEqual({ kind: 'grace' });
  });

  it('forfeits an identified connected player only once the grace cap is reached', () => {
    const out = decideAbsenceOutcome(evidence({
      knownAbsentPlayerId: 'p2', onlineP1: true, onlineP2: true, cycles: 8,
    }));
    expect(out).toEqual({ kind: 'forfeit', players: ['p2'] });
  });

  it('treats a player whose seat is bound in the match room as present', () => {
    const out = decideAbsenceOutcome(evidence({ knownAbsentPlayerId: 'p2', seatBoundP2: true }));
    expect(out).toEqual({ kind: 'noop', reason: 'no-forfeitable' });
  });

  it('still forfeits both when both are offline and readiness was recorded', () => {
    const out = decideAbsenceOutcome(evidence({ readySetPresent: true, readyP1: false, readyP2: false }));
    expect(out).toEqual({ kind: 'forfeit', players: ['p1', 'p2'] });
  });

  it('does not forfeit players who both confirmed ready', () => {
    const out = decideAbsenceOutcome(evidence({ readySetPresent: true, readyP1: true, readyP2: true }));
    expect(out).toEqual({ kind: 'noop', reason: 'no-forfeitable' });
  });

  it('never forfeits a player on a single offline sample when nothing positively identified them as absent', () => {
    for (let cycles = 0; cycles < MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE; cycles += 1) {
      const out = decideAbsenceOutcome(evidence({ onlineP1: true, onlineP2: false, cycles }));
      expect(out).toEqual({ kind: 'grace' });
    }
    const decided = decideAbsenceOutcome(evidence({
      onlineP1: true, onlineP2: false, cycles: MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE,
    }));
    expect(decided).toEqual({ kind: 'forfeit', players: ['p2'] });
  });

  it('never double-forfeits both players on the first fire of a freshly armed round match', () => {
    const out = decideAbsenceOutcome(evidence({ onlineP1: false, onlineP2: false, cycles: 0 }));
    expect(out).toEqual({ kind: 'grace' });
  });

  it('still forfeits both once they stayed offline across the confirmation window', () => {
    const out = decideAbsenceOutcome(evidence({
      onlineP1: false, onlineP2: false, cycles: MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE,
    }));
    expect(out).toEqual({ kind: 'forfeit', players: ['p1', 'p2'] });
  });

  it('a player who comes back online during the confirmation window is no longer forfeitable alone', () => {
    const out = decideAbsenceOutcome(evidence({
      onlineP1: true, onlineP2: true, cycles: MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE,
    }));
    expect(out).toEqual({ kind: 'grace' });
  });

  it('handles a match with a single player slot without crashing', () => {
    const out = decideAbsenceOutcome(evidence({ p2: null, readySetPresent: true, readyP1: true }));
    expect(out).toEqual({ kind: 'noop', reason: 'no-forfeitable' });
  });
});

describe('tournament match hard time limit', () => {
  const now = 10_000_000;

  function clockRoom(remainingMs: number, lastApplyAgoMs: number) {
    const clock = armChessClock(createChessClock(remainingMs), 'player1', now - 1_000);
    return { chessClock: clock, lastApplyActionAt: now - lastApplyAgoMs, createdAt: now - 3_600_000 };
  }

  it('does not end a match that is still being actively played', () => {
    expect(tournamentMatchTimeLimitStillPlaying(clockRoom(5 * 60_000, 20_000), now)).toBe(true);
  });

  it('ends a match that has made no progress for longer than the progress window', () => {
    const stalled = clockRoom(5 * 60_000, TOURNAMENT_MATCH_PROGRESS_WINDOW_MS + 1_000);
    expect(tournamentMatchTimeLimitStillPlaying(stalled, now)).toBe(false);
  });

  it('ends a match whose clock bank is already exhausted', () => {
    expect(tournamentMatchTimeLimitStillPlaying(clockRoom(0, 10_000), now)).toBe(false);
  });
});
