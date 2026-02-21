import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 047/130 - IRUKA UMINO (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Academy
 * MAIN: Move a Naruto Uzumaki character in play.
 *
 * Two-stage target selection:
 *   Stage 1: IRUKA_CHOOSE_NARUTO — choose which Naruto Uzumaki to move
 *   Stage 2: IRUKA_CHOOSE_DESTINATION — choose which mission to move them to
 */
function handleIruka047Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Find ALL Naruto Uzumaki characters across all missions (both sides)
  // JSON: "Move a Naruto Uzumaki character in play" - no "friendly" qualifier
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.name_fr === 'NARUTO UZUMAKI') {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Iruka Umino (047): No Naruto Uzumaki character found in play.',
      'game.log.effect.noTarget', { card: 'IRUKA UMINO', id: '047/130' }) } };
  }

  // Check that there is at least one other mission available
  if (state.activeMissions.length <= 1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Iruka Umino (047): No other mission available to move Naruto Uzumaki to.',
      'game.log.effect.noTarget', { card: 'IRUKA UMINO', id: '047/130' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'IRUKA_CHOOSE_NARUTO',
    validTargets,
    description: 'Iruka Umino (047): Choose a Naruto Uzumaki character to move.',
  };
}

export function registerHandler(): void {
  registerEffect('047/130', 'MAIN', handleIruka047Main);
}
