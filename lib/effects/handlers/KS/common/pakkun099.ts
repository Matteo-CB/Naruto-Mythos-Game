import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

/**
 * Card 099/130 - PAKKUN (Common)
 * Chakra: 1 | Power: 1
 * Group: Independent | Keywords: Ninja Hound
 * SCORE [arrow]: Move this character.
 *
 * Confirmation popup before move target selection (SCORE effects are optional).
 */
function handlePakkun099Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  if (!sourceCard) {
    return { state };
  }
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const topCard = sourceCard.stack.length > 0
    ? sourceCard.stack[sourceCard.stack.length - 1]
    : sourceCard.card;
  const charName = topCard.name_fr;

  // Pre-check: Kurenai 035 movement block
  if (isMovementBlockedByKurenai(state, sourceMissionIndex, sourcePlayer)) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_BLOCKED',
      'Pakkun (099): Movement blocked by Yuhi Kurenai (035).',
      'game.log.effect.moveBlockedKurenai', { card: 'PAKKUN', id: 'KS-099-C' }) } };
  }

  // Pre-check: valid destination missions
  let hasValidDest = false;
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === sourceMissionIndex) continue;
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    const hasSameName = friendlyChars.some((c) => {
      if (c.isHidden) return false;
      const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return tc.name_fr === charName;
    });
    if (!hasSameName) {
      hasValidDest = true;
      break;
    }
  }

  if (!hasValidDest) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Pakkun (099): No other mission to move to.',
      'game.log.effect.noTarget', { card: 'PAKKUN', id: 'KS-099-C' }) } };
  }

  // Confirmation popup
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'PAKKUN099_CONFIRM_SCORE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.pakkun099ConfirmScore',
  };
}

export function registerHandler(): void {
  registerEffect('KS-099-C', 'SCORE', handlePakkun099Score);
}
