import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '@/lib/effects/defeatUtils';
import type { CharacterInPlay } from '@/lib/engine/types';



function kimimaro123MainHandler(ctx: EffectContext): EffectResult {
  
  
  return { state: ctx.state };
}

function kimimaro123UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.hand.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kimimaro (123) UPGRADE: Hand is empty, cannot discard.',
          'game.log.effect.noTarget',
          { card: 'KIMIMARO', id: 'KS-123-R' },
        ),
      },
    };
  }


  const defeatTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.instanceId !== sourceCard.instanceId) {
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        const targetCost = char.isHidden ? 0 : (topCard.chakra ?? 0);
        if (targetCost <= 5) {
          defeatTargets.push(char.instanceId);
        }
      }
    }
  }

  if (defeatTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kimimaro (123) UPGRADE: No character with cost 5 or less in play to defeat.',
          'game.log.effect.noTarget',
          { card: 'KIMIMARO', id: 'KS-123-R' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KIMIMARO123_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    description: 'Kimimaro (123) UPGRADE: Discard a card to defeat a character with cost 5 or less.',
    descriptionKey: 'game.effect.desc.kimimaro123ConfirmUpgrade',
    isOptional: true,
  };
}

export function registerKimimaro123Handlers(): void {
  registerEffect('KS-123-R', 'MAIN', kimimaro123MainHandler);
  registerEffect('KS-123-R', 'UPGRADE', kimimaro123UpgradeHandler);
}
