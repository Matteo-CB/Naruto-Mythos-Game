export type RejoinFailureReason = 'not-authed' | 'room-gone' | 'not-in-room' | 'no-response' | 'seat-unresolved';

export const REJOIN_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000] as const;

export const REJOIN_ACK_TIMEOUT_MS = 4000;

export type RejoinRetryPlan =
  | { kind: 'retry'; delayMs: number }
  | { kind: 'stop'; terminal: boolean };

export function isTerminalRejoinFailure(reason: RejoinFailureReason): boolean {
  return reason === 'room-gone' || reason === 'not-in-room';
}

export function nextRejoinDelayMs(attempt: number): number {
  if (attempt < 0) return REJOIN_RETRY_DELAYS_MS[0];
  const idx = Math.min(attempt, REJOIN_RETRY_DELAYS_MS.length - 1);
  return REJOIN_RETRY_DELAYS_MS[idx];
}

export function decideRejoinRetry(attempt: number, reason: RejoinFailureReason): RejoinRetryPlan {
  if (isTerminalRejoinFailure(reason)) return { kind: 'stop', terminal: true };
  return { kind: 'retry', delayMs: nextRejoinDelayMs(attempt) };
}

export function rejoinFailureErrorKey(reason: RejoinFailureReason): string {
  if (reason === 'room-gone' || reason === 'not-in-room') return 'game.error.rejoinRoomGone';
  return 'game.error.rejoinFailed';
}

export type ConnectionPhase = 'online' | 'resyncing' | 'offline';

export function deriveConnectionPhase(input: {
  transportConnected: boolean;
  hasMatchContext: boolean;
  seatBound: boolean;
}): ConnectionPhase {
  if (!input.transportConnected) return 'offline';
  if (!input.hasMatchContext) return 'online';
  return input.seatBound ? 'online' : 'resyncing';
}

export function shouldAttemptRejoin(input: {
  transportConnected: boolean;
  roomCode: string | null;
  userId: string | null;
  seatBound: boolean;
  gameEnded: boolean;
}): boolean {
  if (!input.transportConnected) return false;
  if (!input.roomCode || !input.userId) return false;
  if (input.gameEnded) return false;
  return !input.seatBound;
}
