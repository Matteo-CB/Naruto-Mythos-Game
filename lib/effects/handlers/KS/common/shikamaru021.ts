import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 021/130 - SHIKAMARU NARA (Common)
 * Chakra: 1 | Power: 0 (no power stat in data)
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: If you have the Edge, draw a card.
 *
 * Checks if the source player currently holds the Edge token. If so, draws 1 card.
 */
function handleShikamaru021Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Pre-check: must hold the Edge token
  if (state.edgeHolder !== sourcePlayer) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Shikamaru Nara (021): Player does not hold the Edge token.',
      'game.log.effect.noTarget', { card: 'SHIKAMARU NARA', id: 'KS-021-C' }) } };
  }

  // Confirmation popup before drawing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHIKAMARU021_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.shikamaru021ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-021-C', 'MAIN', handleShikamaru021Main);
}
