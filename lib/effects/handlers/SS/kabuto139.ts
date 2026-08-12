import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { characterHasGroup } from '@/lib/effects/groupUtils';

export const KABUTO_139_ID = 'SS-139-R';
export const KABUTO_139_NAME = 'KABUTO YAKUSHI';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

export function kabuto139Watchers(state: GameState, player: PlayerID): CharacterInPlay[] {
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const trouves: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.isHidden) continue;
      if (topOf(char).id === KABUTO_139_ID) trouves.push(char);
    }
  }
  return trouves;
}

export function kabuto139Triggers(
  state: GameState,
  player: PlayerID,
  playedInstanceId: string | undefined,
): number {
  if (!playedInstanceId) return 0;

  let joue: CharacterInPlay | null = null;
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.instanceId === playedInstanceId) joue = char;
    }
  }
  if (!joue || joue.isHidden) return 0;
  if (!characterHasGroup(joue, 'Sound Village')) return 0;

  return kabuto139Watchers(state, player).filter((k) => k.instanceId !== playedInstanceId).length;
}
