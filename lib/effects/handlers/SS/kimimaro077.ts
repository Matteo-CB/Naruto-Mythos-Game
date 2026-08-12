import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { isDuelConditionMet } from '@/lib/effects/duelUtils';

export const KIMIMARO_077_ID = 'SS-077-UC';
export const KIMIMARO_077_NAME = 'KIMIMARO';
export const KIMIMARO_077_DUEL = 'DUEL Gaara';
export const KIMIMARO_077_BASE_LIMIT = 5;
export const KIMIMARO_077_DUEL_LIMIT = 7;

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

export function kimimaro077InPlay(state: GameState, player: PlayerID): CharacterInPlay[] {
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const trouves: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.isHidden) continue;
      if (topOf(char).id === KIMIMARO_077_ID) trouves.push(char);
    }
  }
  return trouves;
}

export function kimimaro077Limit(state: GameState, source: CharacterInPlay): number {
  return isDuelConditionMet(state, source.missionIndex, KIMIMARO_077_DUEL)
    ? KIMIMARO_077_DUEL_LIMIT
    : KIMIMARO_077_BASE_LIMIT;
}

export function kimimaro077Targets(state: GameState, player: PlayerID): CharacterInPlay[] {
  const enemySide = player === 'player1' ? 'player2Characters' : 'player1Characters';
  const cibles: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;
      cibles.push(char);
    }
  }
  return cibles;
}

export function costOfTarget(char: CharacterInPlay): number {
  return topOf(char).chakra ?? 0;
}

export function kimimaro077HasAffordableTarget(
  state: GameState,
  player: PlayerID,
  limite: number,
): boolean {
  return kimimaro077Targets(state, player).some((c) => costOfTarget(c) <= limite);
}
