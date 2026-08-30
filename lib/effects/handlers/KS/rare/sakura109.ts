import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { peutEtreJouee } from '@/lib/engine/rules/placement';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canAffordAsUpgrade } from '@/lib/effects/handlers/KS/shared/upgradeCheck';
import { bestFreshPlayCost } from '@/lib/effects/handlers/KS/shared/summonSearch';



function sakura109MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  
  let hasAffordable = false;
  for (let i = 0; i < playerState.discardPile.length; i++) {
    const card = playerState.discardPile[i];
    if (card.card_type === 'character' && card.group === 'Leaf Village') {
      
      if (peutEtreJouee(state, sourcePlayer, card as never, 0) || peutEtreJouee(state, sourcePlayer, card as never, 2)) {
        hasAffordable = true;
        break;
      }
    }
  }

  if (!hasAffordable) {
    const log = logAction(
      state.log, state.turn, state.phase, sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sakura Haruno (109): No affordable Leaf Village character in discard pile.',
      'game.log.effect.noTarget',
      { card: 'SAKURA HARUNO', id: 'KS-109-R' },
    );
    return { state: { ...state, log } };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SAKURA109_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Sakura Haruno (109) MAIN: Play a Leaf Village character from your discard pile.',
    descriptionKey: 'game.effect.desc.sakura109ConfirmMain',
  };
}

const SAKURA_109_IMPRESSIONS = ['KS-109-R', 'KS-109-RA', 'KS-109-MV'];

export function registerSakura109Handlers(): void {
  for (const id of SAKURA_109_IMPRESSIONS) {
    registerEffect(id, 'MAIN', sakura109MainHandler);
  }
}
