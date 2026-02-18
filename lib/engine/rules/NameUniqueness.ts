import type { GameState, PlayerID, CharacterCard, CharacterInPlay } from '../types';

/**
 * Check if a player can have a character with the given name on a mission.
 * Rule: Only 1 character with the same name per player per mission.
 * Hidden characters' names aren't checked (two hidden with same name can coexist).
 * But you can't play face-visible if there's already a visible character with that name.
 */
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
    // Only visible characters enforce name uniqueness
    if (c.isHidden) return false;
    return c.card.name_fr.toUpperCase() === upperName;
  });
}

/**
 * Check if revealing a hidden character would violate name uniqueness.
 */
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

  return canPlayNameOnMission(state, player, char.card.name_fr, missionIndex, characterInstanceId);
}
