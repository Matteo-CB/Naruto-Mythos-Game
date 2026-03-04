import type { GameState, CharacterInPlay, PlayerID } from '../types';
import { calculateContinuousPowerModifier } from '../../effects/ContinuousEffects';

/**
 * Calculate the effective power of a character in play,
 * including base power, power tokens, and all continuous modifiers.
 * Hidden characters have 0 power.
 */
export function calculateCharacterPower(
  state: GameState,
  char: CharacterInPlay,
  player: PlayerID,
): number {
  // Hidden characters have 0 base power and 0 power from tokens (tokens only
  // matter when revealed). Only continuous effects (Kurenai 035, Naruto 145)
  // can grant hidden characters scoring power.
  if (char.isHidden) {
    const mission = state.activeMissions[char.missionIndex];
    if (!mission) return 0;
    const hiddenBonus = calculateContinuousPowerModifier(state, player, char.missionIndex, char);
    return Math.max(0, hiddenBonus);
  }

  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  let power = topCard.power + char.powerTokens;

  // Find which mission this character is in
  const mission = state.activeMissions[char.missionIndex];
  if (!mission) return Math.max(0, power);

  // Apply continuous power modifiers from all characters on the board
  // Delegates to centralized ContinuousEffects module
  power += calculateContinuousPowerModifier(state, player, char.missionIndex, char);

  return Math.max(0, power);
}
