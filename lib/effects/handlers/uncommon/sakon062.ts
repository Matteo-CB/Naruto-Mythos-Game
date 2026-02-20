import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 062/130 - SAKON (UC)
 * Chakra: 5 | Power: 3
 * Group: Sound Village | Keywords: Sound Four
 *
 * AMBUSH: Copy an instant effect (non-continuous [hourglass], non-SCORE [arrow]) of another
 * friendly character with keyword "Sound Four" in play.
 *   - Find all friendly non-hidden characters with keyword "Sound Four" across all missions
 *     (excluding self).
 *   - The player selects which Sound Four character to copy from.
 *   - The copied effect must be an instant effect (MAIN without [hourglass], or AMBUSH).
 *   - The actual execution of the copied effect is handled by the engine after target selection.
 *
 * This is a complex copy effect. The handler returns target selection for which Sound Four
 * character to copy from. The engine then reads that card's effects and re-executes the
 * appropriate instant effect.
 */

function handleSakon062Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // Find all friendly non-hidden Sound Four characters in play (not self)
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.keywords && topCard.keywords.includes('Sound Four')) {
        // Check if this card has at least one non-continuous, non-SCORE effect
        const hasInstantEffect = topCard.effects?.some((eff) => {
          if (eff.type === 'SCORE') return false;
          if (eff.type === 'UPGRADE') return false;
          // Check for continuous marker [hourglass]
          if (eff.description && eff.description.includes('[⧗]')) return false;
          return true;
        });
        if (hasInstantEffect) {
          validTargets.push(char.instanceId);
        }
      }
    }
  }

  if (validTargets.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakon (062): No friendly Sound Four character with a copyable instant effect in play.',
      'game.log.effect.noTarget', { card: 'SAKON', id: '062/130' }) } };
  }

  // If exactly one target, still require selection (engine needs to know which effect to copy)
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKON062_COPY_EFFECT',
    validTargets,
    description: 'Select a friendly Sound Four character to copy an instant effect from.',
  };
}

export function registerHandler(): void {
  registerEffect('062/130', 'AMBUSH', handleSakon062Ambush);
}
