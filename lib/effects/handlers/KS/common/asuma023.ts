import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isMovementBlockedByKurenai } from '@/lib/effects/ContinuousEffects';

/**
 * Card 023/130 - ASUMA SARUTOBI (Common)
 * Chakra: 3 | Power: 3
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: Move another Team 10 character from this mission.
 *
 * Two-stage target selection:
 *   Stage 1: ASUMA_CHOOSE_TEAM10 - choose which Team 10 char in this mission to move
 *   Stage 2: ASUMA_CHOOSE_DESTINATION - choose which mission to move them to
 */
function handleAsuma023Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];

  // Pre-check: need at least 2 missions to move a character
  if (state.activeMissions.length <= 1) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Asuma Sarutobi (023): No other mission available to move Team 10 character to.',
      'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: 'KS-023-C' }) } };
  }

  // R8: Check Kurenai block — the moved character's controller determines block
  // Find all Team 10 characters in this mission (not self, both sides)
  // Also pre-check that each candidate has at least one valid destination (name uniqueness)
  const validTargets: string[] = [];
  const allChars = [...mission.player1Characters, ...mission.player2Characters];
  for (const char of allChars) {
    if (char.instanceId === sourceCard.instanceId) continue;
    if (char.isHidden) continue; // Hidden chars are anonymous - can't identify keyword
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    if (topCard.keywords && topCard.keywords.includes('Team 10')) {
      // Determine the controller of this character
      const charController = mission.player1Characters.includes(char) ? 'player1' : 'player2';
      // R8: Skip if Kurenai blocks movement from this mission for this character's controller
      if (isMovementBlockedByKurenai(state, sourceMissionIndex, charController)) continue;
      // Pre-check: at least one destination mission must not already have a same-name character
      const charName = topCard.name_fr;
      const controllerSide: 'player1Characters' | 'player2Characters' =
        charController === 'player1' ? 'player1Characters' : 'player2Characters';
      const hasValidDest = state.activeMissions.some((m, i) => {
        if (i === sourceMissionIndex) return false;
        return !m[controllerSide].some((c) => {
          if (c.instanceId === char.instanceId) return false;
          if (c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.name_fr === charName;
        });
      });
      if (!hasValidDest) continue;
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Asuma Sarutobi (023): No other Team 10 character in this mission to move.',
      'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: 'KS-023-C' }) } };
  }

  // Confirmation popup before target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'ASUMA023_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.asuma023ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-023-C', 'MAIN', handleAsuma023Main);
}
