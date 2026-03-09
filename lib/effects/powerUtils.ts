import type { GameState, CharacterInPlay, PlayerID } from '../engine/types';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';

/**
 * Get the effective power of a character, including ALL continuous modifiers
 * (e.g., Rempart setting power to 0, Kakashi Team 7 bonus, Itachi -1, etc.).
 *
 * This should be used by ALL effect handlers that check power conditions
 * (e.g., "defeat enemy with power X or less", "hide character with power Y or less").
 *
 * Previously, handlers used a local getEffectivePower(char) that only checked
 * base power + powerTokens, missing continuous effects entirely.
 */
export function getEffectivePower(
  state: GameState,
  char: CharacterInPlay,
  player: PlayerID,
): number {
  // Hidden characters also need continuous modifiers (e.g., Itachi 128 -1 power).
  // Delegate to calculateCharacterPower which handles both hidden and visible.
  return calculateCharacterPower(state, char, player);
}
