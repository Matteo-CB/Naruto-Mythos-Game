import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 068/130 - DOSU KINUTA (Common)
 * Chakra: 3 | Power: 3
 * Group: Sound Village | Keywords: Sound Ninja
 *
 * MAIN: Look at a hidden character in play.
 *   Player selects any hidden character (any player, any mission) and sees it.
 *
 * AMBUSH: [↯] Defeat a hidden character in play.
 *   When Dosu is revealed from hidden, defeat any hidden character in play.
 */

function handleDosu068Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Find all hidden characters in play across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Dosu Kinuta (068): No hidden characters in play to look at.',
          'game.log.effect.noTarget',
          { card: 'DOSU KINUTA', id: 'KS-068-C' },
        ),
      },
    };
  }

  // Confirmation popup before looking
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DOSU068_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.dosu068ConfirmMain',
  };
}

function handleDosu068Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Find all hidden characters in play across all missions
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Dosu Kinuta (068): No hidden characters in play to defeat.',
          'game.log.effect.noTarget',
          { card: 'DOSU KINUTA', id: 'KS-068-C' },
        ),
      },
    };
  }

  // Confirmation popup before defeat
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DOSU068_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.dosu068ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-068-C', 'MAIN', handleDosu068Main);
  registerEffect('KS-068-C', 'AMBUSH', handleDosu068Ambush);
}
