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
 * MAIN "effect:": Instead, defeat both of them (applies on upgrade).
 *
 * Same effect as 133/130 Secret Naruto.
 * Uses CONFIRM pattern + UPGRADE modifier confirmation.
 */

function narutoLegendaryMainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySideKey: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Target 1: enemy with Power <= 5 in THIS mission (exclude hidden — hiding a hidden char is redundant)
  const thisMission = state.activeMissions[sourceMissionIndex];
  const validTarget1 = thisMission[enemySideKey]
    .filter((c) => !c.isHidden && getEffectivePower(state, c, opponentPlayer) <= 5)
    .map((c) => c.instanceId);

  // Target 2: enemy with Power <= 2 in ANY mission (exclude hidden)
  const validTarget2: string[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][enemySideKey]) {
      if (!char.isHidden && getEffectivePower(state, char, opponentPlayer) <= 2) {
        validTarget2.push(char.instanceId);
      }
    }
  }

  if (validTarget1.length === 0 && validTarget2.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET', 'Naruto Uzumaki (Legendary): No valid enemy targets in play.',
      'game.log.effect.noTarget', { card: 'NARUTO UZUMAKI', id: 'KS-000-L' }) } };
  }

  // CONFIRM popup — useDefeat: false initially (UPGRADE modifier prompted separately)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO_LEGENDARY_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    description: JSON.stringify({ missionIndex: sourceMissionIndex, useDefeat: false }),
    descriptionKey: 'game.effect.desc.narutoLegendaryConfirmMain',
    isOptional: true,
  };
}

export function registerNarutoLegendaryHandlers(): void {
  registerEffect('KS-000-L', 'MAIN', narutoLegendaryMainHandler);
  registerEffect('KS-000-L', 'UPGRADE', (ctx) => ({ state: ctx.state })); // Handled by MAIN via isUpgrade
}
