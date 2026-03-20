import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 016/130 - KAKASHI HATAKE "Sharingan" (UC)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Team 7, Kekkei Genkai
 *
 * MAIN: Copy a non-upgrade instant effect of an enemy character with cost 4 or less in play.
 *   - Find enemy characters with printed cost <= 4 that have non-UPGRADE instant effects
 *     (MAIN, AMBUSH, or SCORE effects, not continuous [hourglass] and not UPGRADE).
 *   - Requires target selection to choose which enemy character's effect to copy.
 *   - The actual effect copy/execution is handled by the game engine after target selection.
 *
 * UPGRADE: MAIN effect: Instead, there's no cost limit.
 *   - When triggered as upgrade, the cost filter is removed (any cost is valid).
 */
function handleKakashi016Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, isUpgrade } = ctx;
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const costLimit = isUpgrade ? Infinity : 4;

  // Find enemy characters with valid instant effects
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden) continue;

      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (topCard.chakra > costLimit) continue;

      // Check if the character has any copyable instant effects
      const hasInstantEffect = topCard.effects?.some(effect => {
        if (effect.type === 'UPGRADE') return false; // Can't copy UPGRADE
        if (effect.type === 'SCORE') return false;   // SCORE never copyable
        if (effect.type === 'AMBUSH' && !ctx.wasRevealed) return false; // AMBUSH only if copier was revealed
        // Exclude continuous effects (marked with [hourglass] symbol)
        if (effect.description.includes('[⧗]')) return false;
        // Exclude effect modifiers
        if (effect.description.startsWith('effect:') || effect.description.startsWith('effect.')) return false;
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
      'game.log.effect.noTarget', { card: 'KAKASHI HATAKE', id: 'KS-016-UC' }) } };
  }

  // Confirmation popup before copy target selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KAKASHI016_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId, isUpgrade }),
    descriptionKey: 'game.effect.desc.kakashi016ConfirmMain',
  };
}

function handleKakashi016UpgradeNoop(ctx: EffectContext): EffectResult {
  // No-op: MAIN handler already checks isUpgrade to remove cost limit.
  return { state: ctx.state };
}

export function registerKakashi016Handlers(): void {
  registerEffect('KS-016-UC', 'MAIN', handleKakashi016Main);
  registerEffect('KS-016-UC', 'UPGRADE', handleKakashi016UpgradeNoop);
}
