import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 061/130 - SAKON (Common)
 * Chakra: 3 | Power: 2
 * Group: Sound Village | Keywords: Sound Four
 * MAIN: Draw X card(s). X is the number of missions where you have at least one friendly
 * Sound Four character.
 *
 * Counts missions with friendly Sound Four characters, then draws that many cards.
 */
function handleSakon061Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  // Count missions with at least one friendly Sound Four character
  let soundFourMissionCount = 0;
  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    const hasSoundFour = friendlyChars.some((char) => {
      if (char.instanceId === sourceCard.instanceId) return false;
      if (char.isHidden) return false; // Hidden chars are anonymous - can't identify keyword
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      return topCard.keywords && topCard.keywords.includes('Sound Four');
    });

    if (hasSoundFour) {
      soundFourMissionCount++;
    }
  }

  if (soundFourMissionCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Sakon (061): No missions with friendly Sound Four characters.',
      'game.log.effect.noTarget', { card: 'SAKON', id: 'KS-061-C' }) } };
  }

  // Confirmation popup before draw
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKON061_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.sakon061ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-061-C', 'MAIN', handleSakon061Main);
}
