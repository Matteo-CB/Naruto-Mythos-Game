export interface AbsenceEvidence {
  p1: string;
  p2: string | null;
  knownAbsentPlayerId: string | null;
  readySetPresent: boolean;
  readyP1: boolean;
  readyP2: boolean;
  seatBoundP1: boolean;
  seatBoundP2: boolean;
  onlineP1: boolean;
  onlineP2: boolean;
  gameLive: boolean;
  cycles: number;
  maxCycles: number;
}

export type AbsenceOutcome =
  | { kind: 'noop'; reason: 'game-live' | 'no-forfeitable' | 'unknown-evidence' }
  | { kind: 'grace' }
  | { kind: 'no-contest'; reason: 'launch-stalled'; players: string[] }
  | { kind: 'forfeit'; players: string[] };

export const MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE = 2;

export interface JoinCheckEvidence {
  hostJoined: boolean;
  guestJoined: boolean;
  hostOnline: boolean;
  guestOnline: boolean;
  attempt: number;
  maxRechecks: number;
}

export type JoinCheckSeat = 'player1' | 'player2';

export type JoinCheckOutcome =
  | { kind: 'start' }
  | { kind: 'wait'; reason: 'connected' | 'recheck' }
  | { kind: 'forfeit'; seats: JoinCheckSeat[] };

export function decideJoinCheckOutcome(ev: JoinCheckEvidence): JoinCheckOutcome {
  const missing: JoinCheckSeat[] = [];
  if (!ev.hostJoined) missing.push('player1');
  if (!ev.guestJoined) missing.push('player2');
  if (missing.length === 0) return { kind: 'start' };

  const anyOnline = (!ev.hostJoined && ev.hostOnline) || (!ev.guestJoined && ev.guestOnline);
  if (anyOnline) return { kind: 'wait', reason: 'connected' };

  if (ev.attempt < ev.maxRechecks) return { kind: 'wait', reason: 'recheck' };

  return { kind: 'forfeit', seats: missing };
}

export function decideAbsenceOutcome(ev: AbsenceEvidence): AbsenceOutcome {
  if (ev.gameLive) return { kind: 'noop', reason: 'game-live' };

  const evidenceKnown = ev.knownAbsentPlayerId !== null || ev.readySetPresent;

  let absent1: boolean;
  let absent2: boolean;
  if (ev.knownAbsentPlayerId !== null) {
    absent1 = ev.knownAbsentPlayerId === ev.p1;
    absent2 = !!ev.p2 && ev.knownAbsentPlayerId === ev.p2;
  } else {
    absent1 = !ev.readyP1;
    absent2 = !!ev.p2 && !ev.readyP2;
  }

  if (ev.seatBoundP1) absent1 = false;
  if (ev.seatBoundP2) absent2 = false;
  if (ev.readyP1) absent1 = false;
  if (ev.readyP2) absent2 = false;

  const offlineAbsent1 = absent1 && !ev.onlineP1;
  const offlineAbsent2 = absent2 && !ev.onlineP2;
  const onlineAbsent1 = absent1 && ev.onlineP1;
  const onlineAbsent2 = absent2 && ev.onlineP2;
  const capReached = ev.cycles >= ev.maxCycles;

  if (!absent1 && !absent2) return { kind: 'noop', reason: 'no-forfeitable' };

  if (!capReached && !offlineAbsent1 && !offlineAbsent2 && (onlineAbsent1 || onlineAbsent2)) {
    return { kind: 'grace' };
  }

  if (capReached && !offlineAbsent1 && !offlineAbsent2 && (onlineAbsent1 || onlineAbsent2)) {
    const stalled: string[] = [];
    if (onlineAbsent1) stalled.push(ev.p1);
    if (onlineAbsent2 && ev.p2) stalled.push(ev.p2);
    return { kind: 'no-contest', reason: 'launch-stalled', players: stalled };
  }

  const forfeit1 = offlineAbsent1;
  const forfeit2 = offlineAbsent2;

  if (!forfeit1 && !forfeit2) {
    return { kind: 'noop', reason: evidenceKnown ? 'no-forfeitable' : 'unknown-evidence' };
  }

  if (!evidenceKnown && ev.cycles < MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE) {
    return { kind: 'grace' };
  }

  const players: string[] = [];
  if (forfeit1) players.push(ev.p1);
  if (forfeit2 && ev.p2) players.push(ev.p2);
  return { kind: 'forfeit', players };
}
