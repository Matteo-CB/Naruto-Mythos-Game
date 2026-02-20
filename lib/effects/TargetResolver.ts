import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';

/**
 * Centralized target resolution for card effects.
 *
 * Provides a unified way to find valid targets across the board,
 * replacing the ad-hoc iteration patterns found in individual handlers
 * (e.g., hiruzen001.ts, tsunade003.ts, orochimaru050.ts).
 */

// ---------------------
// Types
// ---------------------

export type TargetType =
  | 'friendly_character'
  | 'enemy_character'
  | 'friendly_hidden'
  | 'enemy_hidden'
  | 'any_character';

export interface TargetFilter {
  /** Maximum effective power (inclusive). Hidden characters have power 0. */
  maxPower?: number;
  /** Minimum effective power (inclusive). */
  minPower?: number;
  /** Required group (e.g., "Leaf Village", "Sand Village"). */
  group?: string;
  /** Required keyword (e.g., "Team 7", "Sannin", "Sound Four"). */
  keyword?: string;
  /** If true, only search the specified missionIndex. If false/undefined, search all missions. */
  sameMission?: boolean;
  /** Instance IDs to exclude from results (e.g., exclude the source card itself). */
  excludeInstanceIds?: string[];
  /** If true, only include non-hidden (face-visible) characters. */
  nonHiddenOnly?: boolean;
  /** If true, only include hidden (face-down) characters. */
  hiddenOnly?: boolean;
}

// ---------------------
// Core Function
// ---------------------

/**
 * Find all valid target instance IDs matching the given criteria.
 *
 * @param state - Current game state.
 * @param player - The player performing the effect (used to determine "friendly" vs "enemy").
 * @param targetType - Which characters to consider (friendly, enemy, hidden variants, or any).
 * @param missionIndex - The mission where the effect originates. Used when sameMission is true.
 * @param filters - Optional filters to narrow down results.
 * @returns Array of instanceIds of matching characters.
 */
export function getValidTargets(
  state: GameState,
  player: PlayerID,
  targetType: TargetType,
  missionIndex: number,
  filters?: TargetFilter,
): string[] {
  const results: string[] = [];
  const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

  // Determine which missions to search
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

    // Determine which character lists to check based on targetType
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
      for (const char of chars) {
        if (matchesTargetCriteria(state, char, targetType, filters)) {
          results.push(char.instanceId);
        }
      }
    }
  }

  return results;
}

// ---------------------
// Internal Helpers
// ---------------------

/**
 * Check if a single character matches all target criteria.
 */
function matchesTargetCriteria(
  state: GameState,
  char: CharacterInPlay,
  targetType: TargetType,
  filters?: TargetFilter,
): boolean {
  // Apply hidden/visible constraints from targetType
  switch (targetType) {
    case 'friendly_hidden':
    case 'enemy_hidden':
      if (!char.isHidden) return false;
      break;
    // For generic types, no implicit hidden constraint
    default:
      break;
  }

  // Apply explicit hidden/nonHidden filters
  if (filters?.nonHiddenOnly && char.isHidden) return false;
  if (filters?.hiddenOnly && !char.isHidden) return false;

  // Exclude specific instance IDs
  if (filters?.excludeInstanceIds?.includes(char.instanceId)) return false;

  // Get the active (top) card for attribute checks
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

  // Calculate effective power: hidden characters have power 0 when targeted by enemy effects
  const effectivePower = char.isHidden ? 0 : topCard.power + char.powerTokens;

  // Power filters
  if (filters?.maxPower !== undefined && effectivePower > filters.maxPower) return false;
  if (filters?.minPower !== undefined && effectivePower < filters.minPower) return false;

  // Group filter
  if (filters?.group && topCard.group !== filters.group) return false;

  // Keyword filter
  if (filters?.keyword && !(topCard.keywords ?? []).includes(filters.keyword)) return false;

  return true;
}
