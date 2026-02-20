import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 022/130 - SHIKAMARU NARA "Manipulation des Ombres" (UC)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 10, Jutsu
 *
 * AMBUSH: Move an enemy character played during the opponent's previous turn.
 *   - Find enemy characters that were recently played. Since tracking "played during
 *     opponent's previous turn" precisely requires game log analysis, we target
 *     all non-hidden enemy characters in play as potential move targets.
 *   - Requires target selection for which enemy to move and which mission to move to.
 *   - The game engine resolves the actual move after target selection.
 */
function handleShikamaru022Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find all non-hidden enemy characters across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (!char.isHidden) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (022): No enemy character in play to move.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: '022/130' }) } };
  }

  // Requires target selection: which enemy to move (then which mission to move to)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIKAMARU_MOVE_ENEMY',
    validTargets,
    description: 'Select an enemy character to move to another mission.',
  };
}

export function registerHandler(): void {
  registerEffect('022/130', 'AMBUSH', handleShikamaru022Ambush);
}
