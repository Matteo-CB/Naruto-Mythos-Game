import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card L01 - NARUTO UZUMAKI (Legendary)
 * Chakra: 6, Power: 6
 * Group: Leaf Village, Keywords: Team 7, Jutsu
 *
 * MAIN: Hide an enemy character with Power 5 or less in this mission
 *       AND another enemy character with Power 2 or less in play (any mission).
 *
 * UPGRADE: MAIN effect: Instead, defeat both of them.
 *
 * Same effect as 133/130 Secret Naruto but on a different card.
 */

function narutoLegendaryMainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, isUpgrade } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySideKey: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Target 1: enemy with Power <= 5 in THIS mission
  // Base mode (hide): exclude already-hidden chars (can't hide what's already hidden)
  // Upgrade mode (defeat): include hidden chars (power 0 qualifies)
  const thisMission = state.activeMissions[sourceMissionIndex];
  const target1Candidates = thisMission[enemySideKey].filter(
    (c) => (isUpgrade || !c.isHidden) && getEffectivePower(state, c, opponentPlayer) <= 5
  );

  if (target1Candidates.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Naruto Uzumaki (Legendary): No valid enemy with Power 5 or less in this mission.',
      'game.log.effect.noTarget',
      { card: 'NARUTO UZUMAKI', id: 'KS-000-L' }) } };
  }

  // If exactly one target, auto-select for stage 1 and proceed to stage 2
  if (target1Candidates.length === 1) {
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'NARUTO_LEGENDARY_TARGET1',
      validTargets: [target1Candidates[0].instanceId],
      description: isUpgrade
        ? 'Naruto Uzumaki (Legendary): Defeat an enemy character with Power 5 or less in this mission.'
        : 'Naruto Uzumaki (Legendary): Hide an enemy character with Power 5 or less in this mission.',
      descriptionKey: isUpgrade
        ? 'game.effect.desc.narutoLegendaryDefeatTarget1'
        : 'game.effect.desc.narutoLegendaryHideTarget1',
    };
  }

  // Multiple targets: require selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO_LEGENDARY_TARGET1',
    validTargets: target1Candidates.map((c) => c.instanceId),
    description: isUpgrade
      ? 'Naruto Uzumaki (Legendary): Choose an enemy character with Power 5 or less in this mission to defeat.'
      : 'Naruto Uzumaki (Legendary): Choose an enemy character with Power 5 or less in this mission to hide.',
    descriptionKey: isUpgrade
      ? 'game.effect.desc.narutoLegendaryDefeatTarget1'
      : 'game.effect.desc.narutoLegendaryHideTarget1',
  };
}

export function registerNarutoLegendaryHandlers(): void {
  registerEffect('KS-000-L', 'MAIN', narutoLegendaryMainHandler);
}
