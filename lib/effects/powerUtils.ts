import type { GameState, CharacterInPlay, PlayerID } from '../engine/types';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';


export function getEffectivePower(
  state: GameState,
  char: CharacterInPlay,
  player: PlayerID,
): number {
  
  
  return calculateCharacterPower(state, char, player);
}
