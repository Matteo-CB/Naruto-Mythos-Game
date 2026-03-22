import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 046/130 - EBISU (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Pouvoir
 * MAIN: If there is a friendly non-hidden character with less Power than this character
 * in this mission, draw a card.
 *
 * "Power" includes base power + power tokens + continuous modifiers (effective power).
 */
function handleEbisu046Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Use effective power (base + tokens + continuous modifiers)
  const sourcePower = calculateCharacterPower(state, sourceCard, sourcePlayer);

  // Check for a friendly non-hidden character with less Power
  const hasLesserFriendly = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const charPower = calculateCharacterPower(state, char, sourcePlayer);
    return charPower < sourcePower;
  });

  if (!hasLesserFriendly) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Ebisu (046): No friendly character with less Power in this mission.',
      'game.log.effect.noTarget', { card: 'EBISU', id: 'KS-046-C' }) } };
  }

  // Confirmation popup before drawing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'EBISU046_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.ebisu046ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-046-C', 'MAIN', handleEbisu046Main);
}
