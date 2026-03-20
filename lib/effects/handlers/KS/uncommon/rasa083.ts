import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 083/130 - RASA "Quatrieme Kazekage" (UC)
 * Chakra: 3 | Power: 3
 * Group: Sand Village
 *
 * SCORE [arrow]: Gain 1 Mission point if there's another friendly Sand Village character
 * in this mission.
 *
 * Confirmation popup before gaining the point (SCORE effects are optional).
 */

function handleRasa083Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = mission[friendlySide];

  // Pre-check: another Sand Village character in this mission?
  const hasOtherSandVillage = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    return topCard.group === 'Sand Village';
  });

  if (!hasOtherSandVillage) {
    const log = logAction(state.log, state.turn, state.phase, sourcePlayer,
      'SCORE_NO_TARGET', 'Rasa (083): No other friendly Sand Village character in this mission. No bonus point.',
      'game.log.effect.noTarget', { card: 'RASA', id: 'KS-083-UC' });
    return { state: { ...state, log } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'RASA083_CONFIRM_SCORE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.rasa083ConfirmScore',
  };
}

export function registerHandler(): void {
  registerEffect('KS-083-UC', 'SCORE', handleRasa083Score);
}
