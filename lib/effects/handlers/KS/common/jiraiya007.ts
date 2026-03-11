import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';

function handleJiraiya007Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const costReduction = 1;

  // Pre-check: any affordable summons?
  const handTargets = findAffordableSummonsInHand(state, sourcePlayer, costReduction);
  const hiddenTargets = findHiddenSummonsOnBoard(state, sourcePlayer, costReduction);

  if (handTargets.length === 0 && hiddenTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (007): No affordable Summon characters available.',
      'game.log.effect.noTarget', { card: 'Jiraiya', id: 'KS-007-C' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA007_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.jiraiya007ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-007-C', 'MAIN', handleJiraiya007Main);
}
