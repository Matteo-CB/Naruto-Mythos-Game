import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import type { ActiveMission } from '../../../engine/types';
import { checkNinjaHoundsTrigger } from '../../moveTriggers';

/**
 * Card 059/130 - KIDOMARU (Common)
 * Chakra: 3 | Power: 2
 * Group: Sound Village | Keywords: Sound Four
 * MAIN: Move X friendly character(s). X is the number of missions where you have at least
 * one friendly Sound Four character.
 *
 * Auto-resolves: for each move allowed (up to X), picks the first movable friendly
 * character and moves it to the first available different mission. If X > number of
 * movable characters, moves what it can.
 */
function handleKidomaru059Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Count missions with at least one friendly visible Sound Four character
  let soundFourMissionCount = 0;
  for (const mission of state.activeMissions) {
    const friendlyChars = mission[friendlySide];
    const hasSoundFour = friendlyChars.some((char) => {
      if (char.isHidden) return false;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      return topCard.keywords && topCard.keywords.includes('Sound Four');
    });
    if (hasSoundFour) {
      soundFourMissionCount++;
    }
  }

  if (soundFourMissionCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (059): No missions with a friendly Sound Four character.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: '059/130' }) } };
  }

  // Perform up to X moves, mutating a working copy of missions
  let newMissions: ActiveMission[] = state.activeMissions.map((m) => ({
    ...m,
    player1Characters: [...m.player1Characters],
    player2Characters: [...m.player2Characters],
  }));

  let movesRemaining = soundFourMissionCount;
  const moveDescriptions: string[] = [];
  const movedChars: { char: typeof newMissions[0]['player1Characters'][0]; destIdx: number }[] = [];

  while (movesRemaining > 0) {
    // Find the first movable friendly character
    let foundCharId: string | undefined;
    let fromIdx = -1;

    for (let i = 0; i < newMissions.length; i++) {
      const chars = newMissions[i][friendlySide];
      if (chars.length > 0) {
        // Check if there's at least one other mission to move to
        const hasOtherMission = newMissions.some((_, j) => j !== i);
        if (hasOtherMission) {
          foundCharId = chars[0].instanceId;
          fromIdx = i;
          break;
        }
      }
    }

    if (!foundCharId || fromIdx === -1) break;

    // Find the first different mission
    let destIdx = -1;
    for (let i = 0; i < newMissions.length; i++) {
      if (i !== fromIdx) {
        destIdx = i;
        break;
      }
    }

    if (destIdx === -1) break;

    // Move the character
    const sourceMission = newMissions[fromIdx];
    const sourceChars = sourceMission[friendlySide];
    const charIndex = sourceChars.findIndex((c) => c.instanceId === foundCharId);
    const [movedChar] = sourceChars.splice(charIndex, 1);
    const updatedChar = { ...movedChar, missionIndex: destIdx };
    newMissions[destIdx][friendlySide].push(updatedChar);

    moveDescriptions.push(
      `${movedChar.card.name_fr} from mission ${fromIdx} to mission ${destIdx}`
    );
    movedChars.push({ char: updatedChar, destIdx });

    movesRemaining--;
  }

  if (moveDescriptions.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (059): No friendly characters could be moved.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: '059/130' }) } };
  }

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    sourcePlayer,
    'EFFECT_MOVE',
    `Kidomaru (059): Moved ${moveDescriptions.length} character(s): ${moveDescriptions.join('; ')}.`,
    'game.log.effect.move',
    { card: 'Kidomaru', id: '059/130', target: moveDescriptions.join('; '), mission: String(moveDescriptions.length) },
  );

  let newState = { ...state, activeMissions: newMissions, log };
  // Check Ninja Hounds 100 trigger for each moved character
  for (const move of movedChars) {
    newState = checkNinjaHoundsTrigger(newState, move.char, move.destIdx, sourcePlayer);
  }
  return { state: newState };
}

export function registerHandler(): void {
  registerEffect('059/130', 'MAIN', handleKidomaru059Main);
}
