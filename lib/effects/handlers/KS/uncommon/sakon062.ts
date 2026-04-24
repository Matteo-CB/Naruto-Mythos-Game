import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isCharacterCopyable } from '@/lib/effects/handlers/KS/shared/copyExclusions';



function handleSakon062Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  
  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.instanceId === sourceCard.instanceId) continue;
      if (char.isHidden) continue;
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (!isCharacterCopyable(topCard)) continue;
      if (topCard.keywords && topCard.keywords.includes('Sound Four')) {
        
        const hasInstantEffect = topCard.effects?.some((eff) => {
          if (eff.type === 'SCORE') return false; // SCORE never copyable
          if (eff.description && eff.description.includes('[⧗]')) return false;
          if (eff.description && (eff.description.startsWith('effect:') || eff.description.startsWith('effect.'))) return false;
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
