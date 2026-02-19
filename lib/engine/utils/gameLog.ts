import type { GameLogEntry, GamePhase, PlayerID } from '../types';

export function createLogEntry(
  turn: number,
  phase: GamePhase,
  action: string,
  details: string,
  player?: PlayerID,
  messageKey?: string,
  messageParams?: Record<string, string | number>,
): GameLogEntry {
  return {
    turn,
    phase,
    player,
    action,
    details,
    messageKey,
    messageParams,
    timestamp: Date.now(),
  };
}

export function logAction(
  log: GameLogEntry[],
  turn: number,
  phase: GamePhase,
  player: PlayerID,
  action: string,
  details: string,
  messageKey?: string,
  messageParams?: Record<string, string | number>,
): GameLogEntry[] {
  return [...log, createLogEntry(turn, phase, action, details, player, messageKey, messageParams)];
}

export function logSystem(
  log: GameLogEntry[],
  turn: number,
  phase: GamePhase,
  action: string,
  details: string,
  messageKey?: string,
  messageParams?: Record<string, string | number>,
): GameLogEntry[] {
  return [...log, createLogEntry(turn, phase, action, details, undefined, messageKey, messageParams)];
}
