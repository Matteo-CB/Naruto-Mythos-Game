import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 019/130 - INO YAMANAKA (Common)
 * Chakra: 1 | Power: 1
 * Group: Leaf Village | Keywords: Team 10
 * MAIN: If there's another Team 10 character in this mission, POWERUP 1.
 *
 * Checks if there is at least one other friendly non-hidden Team 10 character in the same
 * mission. If so, adds 1 power token to this character (self).
 */
function handleIno019Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const mission = state.activeMissions[sourceMissionIndex];
  // Check for another Team 10 character in this mission (not self, not hidden, both sides)
  const allChars = [...mission.player1Characters, ...mission.player2Characters];
  const hasOtherTeam10 = allChars.some((char) => {
    if (char.instanceId === sourceCard.instanceId) return false;
    if (char.isHidden) return false;
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    return topCard.keywords && topCard.keywords.includes('Team 10');
  });

  if (!hasOtherTeam10) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Ino Yamanaka (019): No other Team 10 character in this mission.',
      'game.log.effect.noTarget', { card: 'INO YAMANAKA', id: 'KS-019-C' }) } };
  }

  // Confirmation popup before applying POWERUP 1
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'INO019_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.ino019ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-019-C', 'MAIN', handleIno019Main);
}
