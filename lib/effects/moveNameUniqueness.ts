import type { GameState, CharacterInPlay, PlayerID } from '@/lib/engine/types';

function topOf(c: CharacterInPlay) {
  return c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
}

export function moveWouldViolateNameUniqueness(
  state: GameState,
  charToMove: CharacterInPlay,
  destMissionIndex: number,
  side: 'player1Characters' | 'player2Characters',
): boolean {
  if (charToMove.isHidden) return false;
  const destMission = state.activeMissions[destMissionIndex];
  if (!destMission) return false;
  const name = topOf(charToMove).name_fr.toUpperCase();
  return destMission[side].some(
    (c) => c.instanceId !== charToMove.instanceId && !c.isHidden && topOf(c).name_fr.toUpperCase() === name,
  );
}

export function sideFor(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}
