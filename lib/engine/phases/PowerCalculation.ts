import type { GameState, CharacterInPlay, PlayerID } from '../types';
import { calculateContinuousPowerModifier } from '../../effects/ContinuousEffects';

/**
 * Calculate the effective power of a character in play,
 * including base power, power tokens, and all continuous modifiers.
 * Hidden characters have 0 base power but power tokens still count.
 * Individual power can go negative — debuffs apply to hidden characters too.
 * The ≥1-to-win rule is enforced at the mission-total level, not here.
 */
export function calculateCharacterPower(
  state: GameState,
  char: CharacterInPlay,
  player: PlayerID,
): number {
  if (char.isHidden) {
    const mission = state.activeMissions[char.missionIndex];
    if (!mission) return char.powerTokens;
    const hiddenBonus = calculateContinuousPowerModifier(state, player, char.missionIndex, char);
    return char.powerTokens + hiddenBonus;
  }

  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  if (!topCard) return char.powerTokens;
  let power = (topCard.power ?? 0) + char.powerTokens;

  const mission = state.activeMissions[char.missionIndex];
  if (!mission) return power;

  power += calculateContinuousPowerModifier(state, player, char.missionIndex, char);

  return power;
}
