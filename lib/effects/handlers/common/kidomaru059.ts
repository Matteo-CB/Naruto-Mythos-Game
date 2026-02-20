import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 059/130 - KIDOMARU (Common)
 * Chakra: 3 | Power: 2
 * Group: Sound Village | Keywords: Sound Four
 * MAIN: Move X friendly character(s). X is the number of missions where you have at least
 * one friendly Sound Four character.
 *
 * Multi-stage target selection:
 *   Stage 1: KIDOMARU_CHOOSE_CHARACTER — choose which friendly character to move
 *   Stage 2: KIDOMARU_CHOOSE_DESTINATION — choose which mission to move them to
 *   Repeat stages 1-2 up to X times.
 *
 * The number of moves remaining is encoded in the description JSON.
 */
function handleKidomaru059Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Count missions with at least one friendly visible Sound Four character
  let soundFourMissionCount = 0;
  for (const mission of state.activeMissions) {
    const hasSoundFour = mission[friendlySide].some((char) => {
      if (char.isHidden) return false;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      return topCard.keywords && topCard.keywords.includes('Sound Four');
    });
    if (hasSoundFour) soundFourMissionCount++;
  }

  if (soundFourMissionCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (059): No missions with a friendly Sound Four character.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: '059/130' }) } };
  }

  // Find all movable friendly characters (those in missions with at least one other mission)
  const validTargets: string[] = [];
  if (state.activeMissions.length > 1) {
    for (let i = 0; i < state.activeMissions.length; i++) {
      for (const char of state.activeMissions[i][friendlySide]) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kidomaru (059): No friendly characters could be moved.',
      'game.log.effect.noTarget', { card: 'KIDOMARU', id: '059/130' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIDOMARU_CHOOSE_CHARACTER',
    validTargets,
    description: JSON.stringify({
      text: `Kidomaru (059): Choose a friendly character to move (${soundFourMissionCount} move(s) available).`,
      movesRemaining: soundFourMissionCount,
    }),
  };
}

export function registerHandler(): void {
  registerEffect('059/130', 'MAIN', handleKidomaru059Main);
}
