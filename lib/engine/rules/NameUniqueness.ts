import type { GameState, PlayerID, CharacterCard, CharacterInPlay } from '../types';


export function canPlayNameOnMission(
  state: GameState,
  player: PlayerID,
  name: string,
  missionIndex: number,
  excludeInstanceId?: string,
): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;

  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const upperName = name.toUpperCase();

  return !chars.some((c) => {
    if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
    
    if (c.isHidden) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    return topCard.name_fr.toUpperCase() === upperName;
  });
}


export function canRevealOnMission(
  state: GameState,
  player: PlayerID,
  characterInstanceId: string,
  missionIndex: number,
): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;

  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const char = chars.find((c) => c.instanceId === characterInstanceId);
  if (!char) return false;

  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return canPlayNameOnMission(state, player, topCard.name_fr, missionIndex, characterInstanceId);
}
