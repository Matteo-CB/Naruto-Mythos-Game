import { describe, it, expect } from 'vitest';
import {
  decideAbsenceOutcome,
  decideJoinCheckOutcome,
  type AbsenceEvidence,
  type JoinCheckEvidence,
} from '@/lib/tournament/absenceDecision';

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
    aAgiP1: false,
    aAgiP2: false,
    cycles: 0,
    maxCycles: 8,
    ...overrides,
  };
}

function joinEvidence(overrides: Partial<JoinCheckEvidence> = {}): JoinCheckEvidence {
  return {
    hostJoined: false,
    guestJoined: false,
    hostOnline: false,
    guestOnline: false,
    attempt: 0,
    maxRechecks: 2,
    ...overrides,
  };
}

describe('a present player can never be forfeited before the game starts', () => {
  it('never returns a forfeit for a player who has a live socket, at any cycle count', () => {
    for (let cycles = 0; cycles <= 40; cycles += 1) {
      const out = decideAbsenceOutcome(evidence({
        knownAbsentPlayerId: 'p2',
        onlineP1: true,
        onlineP2: true,
        cycles,
      }));
      expect(out.kind).not.toBe('forfeit');
    }
  });

  it('turns a stalled launch between two online players into a no-contest, not a win for either', () => {
    const out = decideAbsenceOutcome(evidence({
      readySetPresent: true,
      readyP1: false,
      readyP2: false,
      onlineP1: true,
      onlineP2: true,
      cycles: 8,
    }));
    expect(out).toEqual({ kind: 'no-contest', reason: 'launch-stalled', players: ['p1', 'p2'] });
  });

  it('clears the flagged player once their readiness was recorded', () => {
    const out = decideAbsenceOutcome(evidence({
      knownAbsentPlayerId: 'p2',
      readySetPresent: true,
      readyP2: true,
      onlineP2: true,
      cycles: 99,
    }));
    expect(out).toEqual({ kind: 'noop', reason: 'no-forfeitable' });
  });

  it('still forfeits a player who is genuinely offline, at the same cycle count', () => {
    const out = decideAbsenceOutcome(evidence({
      knownAbsentPlayerId: 'p2',
      onlineP1: true,
      onlineP2: false,
      cycles: 8,
    }));
    expect(out).toEqual({ kind: 'forfeit', players: ['p2'] });
  });

  it('never forfeits a seat whose user is still connected in the join watchdog', () => {
    for (let attempt = 0; attempt <= 5; attempt += 1) {
      const out = decideJoinCheckOutcome(joinEvidence({
        hostJoined: true,
        guestOnline: true,
        attempt,
      }));
      expect(out.kind).not.toBe('forfeit');
    }
  });

  it('only forfeits an unjoined seat in the join watchdog once the player is offline across every sample', () => {
    expect(decideJoinCheckOutcome(joinEvidence({ hostJoined: true, attempt: 0 })))
      .toEqual({ kind: 'wait', reason: 'recheck' });
    expect(decideJoinCheckOutcome(joinEvidence({ hostJoined: true, attempt: 2 })))
      .toEqual({ kind: 'forfeit', seats: ['player2'] });
  });
});
