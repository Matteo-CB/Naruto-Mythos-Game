import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 011/130 - SAKURA HARUNO (Common)
 * Chakra: 2 | Power: 2
 * Group: Leaf Village | Keywords: Team 7
 * MAIN: If there's another Team 7 character in this mission, draw a card.
 *
 * Checks if there is at least one other friendly non-hidden Team 7 character in the same
 * mission. If so, the player draws 1 card from their deck.
 */
function handleSakura011Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  const friendlyChars =
    sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  // Check for another Team 7 character in this mission (not self, not hidden)
  const hasOtherTeam7 = friendlyChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    return topCard.keywords && topCard.keywords.includes('Team 7');
  });

  if (!hasOtherTeam7) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakura Haruno (011): No other Team 7 character in this mission.',
      'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-011-C' }) } };
  }

  // Effect is optional — route through pending action so player can skip.
  // Uses dedicated DRAW_CARD UI (shows deck + Draw/Skip buttons).
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA011_DRAW',
    validTargets: ['confirm'],
    isOptional: true,
    description: 'Sakura Haruno (011): Draw a card? (Team 7 synergy active)',
    descriptionKey: 'game.effect.desc.sakura011Draw',
  };
}

export function registerHandler(): void {
  registerEffect('KS-011-C', 'MAIN', handleSakura011Main);
}
