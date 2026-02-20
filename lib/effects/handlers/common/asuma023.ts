import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 023/130 - ASUMA SARUTOBI (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: Move another Team 10 character from this mission.
 *
 * Two-stage target selection:
 *   Stage 1: ASUMA_CHOOSE_TEAM10 — choose which Team 10 char in this mission to move
 *   Stage 2: ASUMA_CHOOSE_DESTINATION — choose which mission to move them to
 */
function handleAsuma023Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all Team 10 characters in this mission (not self)
  const validTargets: string[] = [];
  for (const char of mission[friendlySide]) {
    if (char.instanceId === sourceCard.instanceId) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    if (topCard.keywords && topCard.keywords.includes('Team 10')) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Asuma Sarutobi (023): No other Team 10 character in this mission to move.',
      'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: '023/130' }) } };
  }

  // Check that there is at least one other mission to move to
  if (state.activeMissions.length <= 1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Asuma Sarutobi (023): No other mission available to move Team 10 character to.',
      'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: '023/130' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ASUMA_CHOOSE_TEAM10',
    validTargets,
    description: 'Asuma Sarutobi (023): Choose a Team 10 character in this mission to move.',
  };
}

export function registerHandler(): void {
  registerEffect('023/130', 'MAIN', handleAsuma023Main);
}
