import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';


function handleJirobo057Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  
  let soundFourMissionCount = 0;
  for (const mission of state.activeMissions) {
    const friendlyChars =
      sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

    const hasSoundFour = friendlyChars.some((char) => {
      if (char.instanceId === sourceCard.instanceId) return false;
      if (char.isHidden) return false; // Hidden chars are anonymous - can't identify keyword
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      return topCard.keywords && topCard.keywords.includes('Sound Four');
    });

    if (hasSoundFour) {
      soundFourMissionCount++;
    }
  }

  if (soundFourMissionCount === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jirobo (057): No missions with a friendly Sound Four character.',
      'game.log.effect.noTarget', { card: 'JIROBO', id: 'KS-057-C' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'JIROBO057_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: false,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.jirobo057ConfirmMain',
  };
}

export function registerHandler(): void {
  registerEffect('KS-057-C', 'MAIN', handleJirobo057Main);
}
