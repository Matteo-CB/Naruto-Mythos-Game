import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 115/130 - SHINO ABURAME (R/RA)
 * Chakra: 5 | Power: 6
 * Group: Leaf Village | Keywords: Équipe 8, Jutsu
 *
 * MAIN [⧗]: Friendly characters in this mission cannot be hidden by enemy effects.
 *   → Continuous effect - implemented in ContinuousEffects.ts via checkCanHideCharacter().
 *
 * AMBUSH: Move a friendly character in this mission to another mission.
 *   → On reveal: choose a friendly in this mission, then choose destination mission.
 */

function shino115AmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const mission = state.activeMissions[sourceMissionIndex];
  if (!mission) return { state };

  // Pre-check: valid targets are friendly characters in this mission (not self)
  const hasValidTarget = mission[friendlySide]
    .some((c) => c.instanceId !== sourceCard.instanceId);

  if (!hasValidTarget) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Shino Aburame (115) AMBUSH: No friendly character in this mission to move.',
          'game.log.effect.noTarget',
          { card: 'SHINO ABURAME', id: 'KS-115-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SHINO115_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Shino Aburame (115) AMBUSH: Move a friendly character in this mission to another mission.',
    descriptionKey: 'game.effect.desc.shino115ConfirmAmbush',
  };
}

export function registerShino115Handlers(): void {
  registerEffect('KS-115-R', 'AMBUSH', shino115AmbushHandler);
  registerEffect('KS-115-RA', 'AMBUSH', shino115AmbushHandler);
  // MAIN [⧗] is a continuous effect handled in ContinuousEffects.ts
}
