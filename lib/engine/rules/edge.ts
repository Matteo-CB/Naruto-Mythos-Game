import type { GameState, PlayerID } from '../types';

export function isEdgeLockedAgainst(state: GameState, player: PlayerID): boolean {
  const locked = state.edgeLockedFor;
  return locked != null && locked !== player;
}

export function grantEdge(state: GameState, player: PlayerID): GameState {
  if (isEdgeLockedAgainst(state, player)) return state;
  if (state.edgeHolder === player) return state;
  return { ...state, edgeHolder: player };
}
