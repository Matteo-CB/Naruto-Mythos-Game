import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';

/**
 * Card 055/130 - KIMIMARO (Common)
 * Chakra: 3 | Power: 3
 * Group: Sound Village | Keywords: Weapon
 * AMBUSH: Discard a card to hide a character in play with cost 3 or less.
 *
 * Auto-resolves:
 *   1. Discards the last card from hand.
 *   2. Hides the first valid non-hidden character with cost <= 3.
 *      Prefers enemy characters over friendly ones.
 * Optional effect - fizzles if no cards in hand or no valid target.
 */
function handleKimimaro055Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];
  const opponent = sourcePlayer === 'player1' ? 'player2' : 'player1';

  // Must have at least 1 card in hand to discard
  if (playerState.hand.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kimimaro (055): No cards in hand to discard.',
      'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-055-C' }) } };
  }

  // Find all non-hidden characters in play with cost <= 3
  const validTargets: string[] = [];

  // First pass: enemy characters (filter out immune ones)
  const enemySide: 'player1Characters' | 'player2Characters' =
    opponent === 'player1' ? 'player1Characters' : 'player2Characters';

  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;
      if (!canBeHiddenByEnemy(state, char, opponent)) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if ((topCard.chakra ?? 0) <= 3) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // Second pass: friendly characters
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) continue;
      // Self is a valid target (can hide itself)
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if ((topCard.chakra ?? 0) <= 3) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // No valid target to hide - effect fizzles (don't discard)
  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kimimaro (055): No character with cost 3 or less to hide.',
      'game.log.effect.noTarget', { card: 'KIMIMARO', id: 'KS-055-C' }) } };
  }

  // Confirmation popup before discard + hide
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIMIMARO055_CONFIRM_AMBUSH',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: ctx.sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.kimimaro055ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-055-C', 'AMBUSH', handleKimimaro055Ambush);
}
