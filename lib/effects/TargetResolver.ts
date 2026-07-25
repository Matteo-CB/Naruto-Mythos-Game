import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';
import { getEffectivePower } from './powerUtils';







export type TargetType =
  | 'friendly_character'
  | 'enemy_character'
  | 'friendly_hidden'
  | 'enemy_hidden'
  | 'any_character';

export interface TargetFilter {
  
  maxPower?: number;
  
  minPower?: number;
  
  group?: string;
  
  keyword?: string;
  
  sameMission?: boolean;
  
  excludeInstanceIds?: string[];
  
  nonHiddenOnly?: boolean;
  
  hiddenOnly?: boolean;
  
  maxCost?: number;
}






export function getValidTargets(
  state: GameState,
  player: PlayerID,
  targetType: TargetType,
  missionIndex: number,
  filters?: TargetFilter,
): string[] {
  const results: string[] = [];
  const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

  
  const missionsToSearch: number[] = [];
  if (filters?.sameMission) {
    missionsToSearch.push(missionIndex);
  } else {
    for (let i = 0; i < state.activeMissions.length; i++) {
      missionsToSearch.push(i);
    }
  }

  for (const mi of missionsToSearch) {
    const mission = state.activeMissions[mi];
    if (!mission) continue;

    
    const charLists: CharacterInPlay[][] = [];

    switch (targetType) {
      case 'friendly_character':
      case 'friendly_hidden':
        charLists.push(
          player === 'player1' ? mission.player1Characters : mission.player2Characters,
        );
        break;
      case 'enemy_character':
      case 'enemy_hidden':
        charLists.push(
          opponent === 'player1' ? mission.player1Characters : mission.player2Characters,
        );
        break;
      case 'any_character':
        charLists.push(mission.player1Characters, mission.player2Characters);
        break;
    }

    for (const chars of charLists) {
      
      const isPlayerList = chars === (player === 'player1' ? mission.player1Characters : mission.player2Characters);
      const listOwner: PlayerID = isPlayerList ? player : opponent;
      for (const char of chars) {
        if (matchesTargetCriteria(state, char, listOwner, targetType, filters)) {
          results.push(char.instanceId);
        }
      }
    }
  }

  return results;
}






function matchesTargetCriteria(
  state: GameState,
  char: CharacterInPlay,
  charPlayer: PlayerID,
  targetType: TargetType,
  filters?: TargetFilter,
): boolean {
  
  switch (targetType) {
    case 'friendly_hidden':
    case 'enemy_hidden':
      if (!char.isHidden) return false;
      break;
    
    default:
      break;
  }

  
  if (filters?.nonHiddenOnly && char.isHidden) return false;
  if (filters?.hiddenOnly && !char.isHidden) return false;

  
  if (filters?.excludeInstanceIds?.includes(char.instanceId)) return false;

  
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

  
  const effectivePower = getEffectivePower(state, char, charPlayer);
  const effectiveCost = char.isHidden ? 0 : topCard.chakra;

  
  if (filters?.maxPower !== undefined && effectivePower > filters.maxPower) return false;
  if (filters?.minPower !== undefined && effectivePower < filters.minPower) return false;

  
  if (filters?.maxCost !== undefined && effectiveCost > filters.maxCost) return false;

  
  
  if (char.isHidden) {
    if (filters?.group || filters?.keyword) return false;
  } else {
    if (filters?.group && topCard.group !== filters.group) return false;
    if (filters?.keyword && !(topCard.keywords ?? []).includes(filters.keyword)) return false;
  }

  return true;
}
