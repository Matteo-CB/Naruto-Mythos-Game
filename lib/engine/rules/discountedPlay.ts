import type { CharacterInPlay, GameState, PlayerID } from '../types';

export function marquerCoutReduit<T extends CharacterInPlay>(
  char: T,
  coutEffectif: number,
  coutImprime: number,
): T {
  return { ...char, playedBelowPrintedCost: coutEffectif < coutImprime };
}

export function idsJouesAuTourPrecedent(state: GameState, player: PlayerID): string[] {
  return state.lastTurnPlayedIds?.[player] ?? [];
}

export function archiverTourPrecedent(state: GameState, joueur: PlayerID): GameState {
  const precedent = state.lastActionPlayer;
  const archive = state.lastTurnPlayedIds ?? { player1: [], player2: [] };
  return {
    ...state,
    lastTurnPlayedIds: precedent
      ? { ...archive, [precedent]: state.turnPlayedIds ?? [] }
      : archive,
    lastActionPlayer: joueur,
  };
}
