import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';

/**
 * Card 108/130 - NARUTO UZUMAKI "Believe it!" (R/RA)
 * Chakra: 5, Power: 5
 * Group: Leaf Village, Keywords: Team 7, Jutsu
 *
 * MAIN: Hide an enemy character with Power 3 or less in this mission.
 * UPGRADE: MAIN effect: Powerup X where X is the Power of the enemy character that is being hidden.
 *
 * Confirmation popup before target selection. Modifier pattern for UPGRADE.
 */

function naruto108MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySideKey: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Pre-check: any enemy with Power <= 3 in this mission?
  const thisMission = state.activeMissions[sourceMissionIndex];
  const hasValidTarget = thisMission[enemySideKey].some(
    (c) => !c.isHidden && getEffectivePower(state, c, opponentPlayer) <= 3,
  );

  if (!hasValidTarget) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Naruto Uzumaki (108): No valid enemy with Power 3 or less in this mission.`,
          'game.log.effect.noTarget',
          { card: 'NARUTO UZUMAKI', id: 'KS-108-R' },
        ),
      },
    };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'NARUTO108_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.naruto108ConfirmMain',
  };
}

export function registerNaruto108Handlers(): void {
  registerEffect('KS-108-R', 'MAIN', naruto108MainHandler);
}
