import type { PlayerID } from '@/lib/engine/types';


export const CHESS_CLOCK_INITIAL_MS = 15 * 60 * 1000;
export const CHESS_CLOCK_IDLE_LIMIT_MS = 3 * 60 * 1000;
export const CHESS_CLOCK_IDLE_TOAST_MS = 2 * 60 * 1000;
export const CHESS_CLOCK_MULLIGAN_IDLE_MS = 60 * 1000;

export const CHESS_CLOCK_DISPLAY_ORANGE_MS = 60 * 1000;
export const CHESS_CLOCK_DISPLAY_RED_MS = 30 * 1000;
export const CHESS_CLOCK_SOUND_TICK_MS = 30 * 1000;
export const CHESS_CLOCK_SOUND_ALARM_MS = 10 * 1000;


export interface PlayerClock {
  remainingMs: number;
  idleWarningUsed: boolean;
}

export interface ChessClockState {
  player1: PlayerClock;
  player2: PlayerClock;
  active: PlayerID | null;
  activeStartedAt: number | null;
  idleStartedAt: number | null;
}

export function createChessClock(initialMs: number = CHESS_CLOCK_INITIAL_MS): ChessClockState {
  return {
    player1: { remainingMs: initialMs, idleWarningUsed: false },
    player2: { remainingMs: initialMs, idleWarningUsed: false },
    active: null,
    activeStartedAt: null,
    idleStartedAt: null,
  };
}

function elapsedSinceActive(state: ChessClockState, now: number): number {
  if (state.active === null || state.activeStartedAt === null) return 0;
  return Math.max(0, now - state.activeStartedAt);
}

export function snapshotRemaining(state: ChessClockState, player: PlayerID, now: number): number {
  const base = state[player].remainingMs;
  if (state.active !== player) return Math.max(0, base);
  return Math.max(0, base - elapsedSinceActive(state, now));
}

export function snapshotForBroadcast(state: ChessClockState, now: number): ChessClockState {
  if (state.active === null) return state;
  const active = state.active;
  return {
    ...state,
    [active]: {
      ...state[active],
      remainingMs: Math.max(0, state[active].remainingMs - elapsedSinceActive(state, now)),
    },
  };
}

export function disarm(state: ChessClockState, now: number): ChessClockState {
  if (state.active === null) return state;
  const active = state.active;
  return {
    ...state,
    [active]: {
      ...state[active],
      remainingMs: Math.max(0, state[active].remainingMs - elapsedSinceActive(state, now)),
    },
    active: null,
    activeStartedAt: null,
    idleStartedAt: null,
  };
}

export function arm(state: ChessClockState, player: PlayerID, now: number): ChessClockState {
  const disarmed = disarm(state, now);
  return {
    ...disarmed,
    active: player,
    activeStartedAt: now,
    idleStartedAt: now,
  };
}

export function resetIdle(state: ChessClockState, now: number): ChessClockState {
  if (state.active === null) return state;
  return {
    ...state,
    idleStartedAt: now,
  };
}

export function idleMs(state: ChessClockState, now: number): number {
  if (state.active === null || state.idleStartedAt === null) return 0;
  return Math.max(0, now - state.idleStartedAt);
}

export function bankEmpty(state: ChessClockState, now: number): boolean {
  if (state.active === null) return false;
  return state[state.active].remainingMs - elapsedSinceActive(state, now) <= 0;
}

export function consumeIdleWarning(state: ChessClockState): ChessClockState {
  if (state.active === null) return state;
  const active = state.active;
  return {
    ...state,
    [active]: { ...state[active], idleWarningUsed: true },
  };
}

export function hasIdleWarning(state: ChessClockState, player: PlayerID): boolean {
  return state[player].idleWarningUsed;
}
