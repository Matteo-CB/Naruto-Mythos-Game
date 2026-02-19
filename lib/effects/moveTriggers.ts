import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';
import { logAction } from '../engine/utils/gameLog';

/**
 * Check and trigger Ninja Hounds 100 continuous move effect.
 *
 * Card text: "[hourglass] Each time this character moves to a different mission,
 *            look at a hidden character in this mission."
 *
 * Call this after any handler that moves a character to a different mission,
 * to ensure the Ninja Hounds trigger fires correctly.
 *
 * @param state - Game state AFTER the move has been applied
 * @param movedChar - The character that was moved
 * @param destMissionIndex - The mission index the character was moved TO
 * @param player - The player who controls the moved character
 */
export function checkNinjaHoundsTrigger(
  state: GameState,
  movedChar: CharacterInPlay,
  destMissionIndex: number,
  player: PlayerID,
): GameState {
  if (movedChar.isHidden) return state;

  const topCard = movedChar.stack.length > 0
    ? movedChar.stack[movedChar.stack.length - 1]
    : movedChar.card;

  if (topCard.number !== 100) return state;

  const hasEffect = (topCard.effects ?? []).some(
    (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('moves to a different mission'),
  );
  if (!hasEffect) return state;

  const mission = state.activeMissions[destMissionIndex];
  if (!mission) return state;

  const allChars = [...mission.player1Characters, ...mission.player2Characters];
  const hiddenChar = allChars.find(
    (c) => c.isHidden && c.instanceId !== movedChar.instanceId,
  );

  if (!hiddenChar) return state;

  return {
    ...state,
    log: logAction(
      state.log, state.turn, state.phase, player,
      'EFFECT',
      `Ninja Hounds (100): Moved to mission ${destMissionIndex} - looked at hidden ${hiddenChar.card.name_fr}.`,
    ),
  };
}
