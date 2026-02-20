import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 056/130 - KIMIMARO (UC)
 * Chakra: 5 | Power: 4
 * Group: Sound Village | Keywords: Weapon
 *
 * MAIN [continuous]: If this character is affected by an enemy effect, the opponent
 * must pay 1 Chakra or the effect fails.
 *   - This is a continuous/passive effect. The actual logic of checking the opponent's
 *     chakra and potentially cancelling effects targeting this character is handled
 *     in ContinuousEffects.ts / the effect resolution engine.
 *   - The MAIN handler here is a no-op that logs the continuous effect activation.
 *
 * UPGRADE: Discard a card from your hand to hide a character in play with cost 4 or less.
 *   - Step 1: Select a card from hand to discard.
 *   - Step 2: Select a character in play (friendly or enemy, not self) with printed
 *     cost <= 4 to hide.
 *   - If the hand is empty or no valid target exists, the effect fizzles.
 */

function handleKimimaro056Main(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass] - opponent must pay 1 Chakra for effects targeting this character.
  // This is passively checked in ContinuousEffects.ts / effect resolution.
  const log = logAction(
    ctx.state.log,
    ctx.state.turn,
    ctx.state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Kimimaro (056): Enemy effects targeting this character require opponent to pay 1 Chakra (continuous).',
    'game.log.effect.continuous',
    { card: 'KIMIMARO', id: '056/130' },
  );
  return { state: { ...ctx.state, log } };
}

function handleKimimaro056Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  // Must have at least 1 card in hand to discard
  if (playerState.hand.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kimimaro (056): No cards in hand to discard.',
      'game.log.effect.noTarget', { card: 'KIMIMARO', id: '056/130' }) } };
  }

  // Find all non-hidden characters in play with cost <= 4 (not self)
  const validHideTargets: string[] = [];

  for (const mission of state.activeMissions) {
    for (const char of mission.player1Characters) {
      if (char.isHidden) continue;
      if (char.instanceId === sourceCard.instanceId) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if ((topCard.chakra ?? 0) <= 4) {
        validHideTargets.push(char.instanceId);
      }
    }
    for (const char of mission.player2Characters) {
      if (char.isHidden) continue;
      if (char.instanceId === sourceCard.instanceId) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if ((topCard.chakra ?? 0) <= 4) {
        validHideTargets.push(char.instanceId);
      }
    }
  }

  // No valid target to hide - effect fizzles (don't discard)
  if (validHideTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Kimimaro (056): No character with cost 4 or less to hide.',
      'game.log.effect.noTarget', { card: 'KIMIMARO', id: '056/130' }) } };
  }

  // Step 1: Ask player to choose a card to discard from hand
  const handIndices = playerState.hand.map((_, i) => String(i));

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIMIMARO056_CHOOSE_DISCARD',
    validTargets: handIndices,
    description: 'Kimimaro (056): Choose a card to discard, then hide a character with cost 4 or less.',
  };
}

export function registerKimimaro056Handlers(): void {
  registerEffect('056/130', 'MAIN', handleKimimaro056Main);
  registerEffect('056/130', 'UPGRADE', handleKimimaro056Upgrade);
}
