import type { GameState, PlayerID, FirstStrikeStatus } from '../types';

export function getFirstStrikeStatus(state: GameState, player: PlayerID): FirstStrikeStatus {
  return state.firstStrike?.[player] ?? 'available';
}

export function withFirstStrikeStatus(state: GameState, player: PlayerID, status: FirstStrikeStatus): GameState {
  const current = state.firstStrike ?? { player1: 'available' as FirstStrikeStatus, player2: 'available' as FirstStrikeStatus };
  return { ...state, firstStrike: { ...current, [player]: status } };
}

export function resetFirstStrikeForRound(state: GameState): GameState {
  return { ...state, firstStrike: { player1: 'available', player2: 'available' } };
}

export function isFirstCardPlayedThisRound(state: GameState, player: PlayerID): boolean {
  return getFirstStrikeStatus(state, player) === 'available';
}

export function expireFirstStrike(state: GameState, player: PlayerID): GameState {
  if (getFirstStrikeStatus(state, player) !== 'available') return state;
  return withFirstStrikeStatus(state, player, 'expired');
}
