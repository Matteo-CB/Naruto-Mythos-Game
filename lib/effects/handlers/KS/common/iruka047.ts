import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

/**
 * Card 047/130 - IRUKA UMINO (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Academy
 * MAIN: Move a Naruto Uzumaki character in play.
 *
 * Two-stage target selection:
 *   Stage 1: IRUKA_CHOOSE_NARUTO - choose which Naruto Uzumaki to move
 *   Stage 2: IRUKA_CHOOSE_DESTINATION - choose which mission to move them to
 */
function handleIruka047Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Pre-check: need at least 2 missions to move
  if (state.activeMissions.length <= 1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Iruka Umino (047): No other mission available to move Naruto Uzumaki to.',
      'game.log.effect.noTarget', { card: 'IRUKA UMINO', id: 'KS-047-C' }) } };
  }

  // Find ALL Naruto Uzumaki characters across all missions (both sides)
  // R8: Skip Narutos in missions blocked by Kurenai
  // R10: Skip Narutos with no valid destination (same-name in all other missions)
  const validTargets: string[] = [];
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const mission = state.activeMissions[mIdx];
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.name_fr === 'NARUTO UZUMAKI') {
        // R8: Check Kurenai block for the Naruto's controller
        const charController = mission.player1Characters.some((c) => c.instanceId === char.instanceId) ? 'player1' : 'player2';
        if (isMovementBlockedByKurenai(state, mIdx, charController)) continue;
        // R10: Check at least one destination without same-name conflict
        const ctrlSide: 'player1Characters' | 'player2Characters' =
          charController === 'player1' ? 'player1Characters' : 'player2Characters';
        const hasValidDest = state.activeMissions.some((m, i) => {
          if (i === mIdx) return false;
          return !m[ctrlSide].some((c) => {
            if (c.instanceId === char.instanceId) return false;
            if (c.isHidden) return false;
            const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
            return cTop.name_fr === 'NARUTO UZUMAKI';
          });
        });
        if (!hasValidDest) continue;
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Iruka Umino (047): No Naruto Uzumaki character can be moved.',
      'game.log.effect.noTarget', { card: 'IRUKA UMINO', id: 'KS-047-C' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'IRUKA047_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.iruka047ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-047-C', 'MAIN', handleIruka047Main);
}
