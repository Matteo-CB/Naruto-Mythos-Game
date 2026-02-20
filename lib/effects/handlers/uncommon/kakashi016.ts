import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 016/130 - KAKASHI HATAKE "Sharingan" (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * MAIN: Copy a non-upgrade instant effect of an enemy character with cost 4 or less in play.
 *   - Find enemy characters with printed cost <= 4 that have non-UPGRADE instant effects
 *     (MAIN or AMBUSH effects, not continuous [hourglass] and not UPGRADE or SCORE).
 *   - Requires target selection to choose which enemy character's effect to copy.
 *   - The actual effect copy/execution is handled by the game engine after target selection.
 *
 * UPGRADE: MAIN effect: Instead, there's no cost limit.
 *   - When triggered as upgrade, the cost filter is removed (any cost is valid).
 */
function handleKakashi016Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, isUpgrade } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const costLimit = isUpgrade ? Infinity : 4;

  // Find enemy characters with valid instant effects
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;

      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.chakra > costLimit) continue;

      // Check if the character has any non-UPGRADE, non-SCORE, non-continuous instant effects
      const hasInstantEffect = topCard.effects?.some(effect => {
        if (effect.type === 'UPGRADE' || effect.type === 'SCORE') return false;
        // Exclude continuous effects (marked with [hourglass] symbol)
        if (effect.description.includes('[⧗]')) return false;
        return true;
      });

      if (hasInstantEffect) {
        validTargets.push(char.instanceId);
      }
    }
  }

  // If no valid targets, effect fizzles
  if (validTargets.length === 0) {
    const limitStr = isUpgrade ? 'any cost' : 'cost 4 or less';
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      `Kakashi Hatake (016): No enemy character (${limitStr}) with a copyable instant effect in play.`,
      'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: '016/130' }) } };
  }

  // Requires target selection: which enemy character's effect to copy
  const limitStr = isUpgrade ? 'any cost' : 'cost 4 or less';
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI_COPY_EFFECT',
    validTargets,
    description: `Select an enemy character (${limitStr}) to copy their non-upgrade instant effect.`,
  };
}

export function registerKakashi016Handlers(): void {
  registerEffect('016/130', 'MAIN', handleKakashi016Main);
  // UPGRADE triggers the same MAIN handler with ctx.isUpgrade = true
  // The MAIN handler checks isUpgrade to remove the cost limit
}
