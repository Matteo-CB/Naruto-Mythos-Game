import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isCopyableCharacter, isCopyableEffect } from '@/lib/effects/handlers/KS/shared/copyExclusions';
import { estSonQuatreReel } from '@/lib/effects/soundFourCount';



function handleSakon062Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (!isCopyableCharacter(char)) continue;
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (estSonQuatreReel(char)) {
        
        const hasInstantEffect = topCard.effects?.some((eff) => {
          return isCopyableEffect(eff, { wasRevealed: ctx.wasRevealed, wasFirstCard: ctx.wasFirstCard, wasUpgrade: ctx.isUpgrade, copieur: 'KS-062-UC' });
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
      'game.log.effect.noTarget', { card: 'SAKON', id: 'KS-062-UC' }) } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKON062_CONFIRM_AMBUSH',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ sourceCardInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.sakon062ConfirmAmbush',
  };
}

export function registerHandler(): void {
  registerEffect('KS-062-UC', 'AMBUSH', handleSakon062Ambush);
}
