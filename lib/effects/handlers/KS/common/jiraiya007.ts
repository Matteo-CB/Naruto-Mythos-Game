import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { findAffordableSummonsInHand, findHiddenSummonsOnBoard } from '@/lib/effects/handlers/KS/shared/summonSearch';

function handleJiraiya007Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const costReduction = 1;

  const handTargets = findAffordableSummonsInHand(state, sourcePlayer, costReduction);
  const hiddenTargets = findHiddenSummonsOnBoard(state, sourcePlayer, costReduction);

  const allTargets = [
    ...handTargets.map(i => `HAND_${i}`),
    ...hiddenTargets.map(h => `HIDDEN_${h.instanceId}`),
  ];

  if (allTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (007): No affordable Summon characters available.',
      'game.log.effect.noTarget', { card: 'Jiraiya', id: 'KS-007-C' }) } };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIRAIYA_CHOOSE_SUMMON',
    validTargets: allTargets,
    description: JSON.stringify({
      text: 'Jiraiya (007): Choose a Summon character to play (paying 1 less).',
      hiddenChars: hiddenTargets,
      costReduction,
    }),
    descriptionKey: 'game.effect.desc.jiraiya007ChooseSummon',
  };
}

export function registerHandler(): void {
  registerEffect('KS-007-C', 'MAIN', handleJiraiya007Main);
}
