import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { virtualSoundFourCount, virtualSoundFourStats } from '@/lib/effects/handlers/SS/attachmentStatics';

export const SOUND_FOUR = 'Sound Four';

function hautDe(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function campDe(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}

export function estSonQuatreReel(char: CharacterInPlay): boolean {
  if (char.isHidden) return false;
  return (hautDe(char).keywords ?? []).includes(SOUND_FOUR);
}

export function sonQuatreReelsDansMission(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  exclureInstanceId?: string,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return mission[campDe(player)].filter((char) => {
    if (exclureInstanceId && char.instanceId === exclureInstanceId) return false;
    if (char.controlledBy !== player) return false;
    return estSonQuatreReel(char);
  });
}

export function sonQuatreVirtuelsDansMission(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): number {
  return virtualSoundFourCount(state.activeMissions[missionIndex], player);
}

export function compterSonQuatreDansMission(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  exclureInstanceId?: string,
): number {
  return sonQuatreReelsDansMission(state, player, missionIndex, exclureInstanceId).length
    + sonQuatreVirtuelsDansMission(state, player, missionIndex);
}

export function missionADuSonQuatre(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  exclureInstanceId?: string,
): boolean {
  return compterSonQuatreDansMission(state, player, missionIndex, exclureInstanceId) > 0;
}

export function compterMissionsAvecSonQuatre(
  state: GameState,
  player: PlayerID,
  exclureInstanceId?: string,
): number {
  let total = 0;
  for (let i = 0; i < state.activeMissions.length; i += 1) {
    if (missionADuSonQuatre(state, player, i, exclureInstanceId)) total += 1;
  }
  return total;
}

export function coutsDesSonQuatreDansMission(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  exclureInstanceId?: string,
): number[] {
  const couts = sonQuatreReelsDansMission(state, player, missionIndex, exclureInstanceId)
    .map((char) => hautDe(char).chakra ?? 0);
  const labo = virtualSoundFourStats(state.activeMissions[missionIndex], player);
  for (let i = 0; i < labo.compte; i += 1) couts.push(labo.cout);
  return couts;
}
