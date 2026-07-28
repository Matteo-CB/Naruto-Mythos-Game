import type { GameState, PlayerID, CharacterInPlay } from '@/lib/engine/types';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';
import { moveWouldViolateNameUniqueness } from '@/lib/effects/moveNameUniqueness';

export function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

export function sideKey(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}

export function enemyOf(player: PlayerID): PlayerID {
  return player === 'player1' ? 'player2' : 'player1';
}

export function movableDestinations(
  state: GameState,
  char: CharacterInPlay,
  fromMission: number,
  owner: PlayerID,
): string[] {
  const dests: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === fromMission) continue;
    if (moveWouldViolateNameUniqueness(state, char, i, sideKey(owner))) continue;
    dests.push(String(i));
  }
  return dests;
}

export function canMoveOut(state: GameState, missionIndex: number, owner: PlayerID): boolean {
  return !isMovementBlockedByKurenai(state, missionIndex, owner);
}

export function charactersMovableFromMission(
  state: GameState,
  missionIndex: number,
  which: 'any' | 'enemy',
  sourcePlayer: PlayerID,
  predicate?: (char: CharacterInPlay, owner: PlayerID) => boolean,
): string[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const out: string[] = [];
  const owners: PlayerID[] = which === 'enemy' ? [enemyOf(sourcePlayer)] : ['player1', 'player2'];
  for (const owner of owners) {
    if (!canMoveOut(state, missionIndex, owner)) continue;
    for (const char of mission[sideKey(owner)]) {
      if (predicate && !predicate(char, owner)) continue;
      if (movableDestinations(state, char, missionIndex, owner).length === 0) continue;
      out.push(char.instanceId);
    }
  }
  return out;
}
