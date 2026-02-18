import type { GameLogEntry, GamePhase, PlayerID } from '../types';

export function createLogEntry(
  turn: number,
  phase: GamePhase,
  action: string,
  details: string,
  player?: PlayerID,
): GameLogEntry {
  return {
    turn,
    phase,
    player,
    action,
    details,
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
): GameLogEntry[] {
  return [...log, createLogEntry(turn, phase, action, details, player)];
}

export function logSystem(
  log: GameLogEntry[],
  turn: number,
  phase: GamePhase,
  action: string,
  details: string,
): GameLogEntry[] {
  return [...log, createLogEntry(turn, phase, action, details)];
}
