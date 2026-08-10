import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import {
  findAffordableLeafInHand,
  findHiddenLeafOnBoard,
  findRevealBlockedLeaf,
} from '@/lib/effects/handlers/KS/shared/summonSearch';



function handleHiruzen002Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const costReduction = 1;


  const affordableLeafIndices = findAffordableLeafInHand(state, sourcePlayer, costReduction).map(i => `HAND_${i}`);
  const hiddenTargets = findHiddenLeafOnBoard(state, sourcePlayer, costReduction);
  const hiddenLeafIds = hiddenTargets.map(h => `HIDDEN_${h.instanceId}`);

  const allTargets = [...affordableLeafIndices, ...hiddenLeafIds];

  if (allTargets.length === 0) {
    const blockedName = findRevealBlockedLeaf(state, sourcePlayer);
    if (blockedName) {
      return {
        state: {
          ...state,
          log: logAction(
            state.log, state.turn, state.phase, sourcePlayer,
            'EFFECT_BLOCKED',
            `Hiruzen Sarutobi (002): Cannot reveal ${blockedName}, a character with that name is already visible on this mission.`,
            'game.log.effect.duplicateNameReveal',
            { card: blockedName },
          ),
        },
      };
    }
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Hiruzen Sarutobi (002): No affordable Leaf Village character could be played.',
          'game.log.effect.noTarget',
          { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HIRUZEN002_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({
      sourceCardInstanceId: ctx.sourceCard.instanceId,
    }),
    descriptionKey: 'game.effect.desc.hiruzen002ConfirmMain',
  };
}


function handleHiruzen002Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playedCharId = (state as any)._hiruzen002PlayedCharId as string | undefined;

  if (!playedCharId) {
    
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Hiruzen Sarutobi (002): No character was played by MAIN, UPGRADE POWERUP 2 skipped.',
          'game.log.effect.noTarget',
          { card: 'HIRUZEN SARUTOBI', id: 'KS-002-UC' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'HIRUZEN002_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ playedCharId }),
    descriptionKey: 'game.effect.desc.hiruzen002ConfirmUpgrade',
  };
}

export function registerHandler(): void {
  registerEffect('KS-002-UC', 'MAIN', handleHiruzen002Main);
  registerEffect('KS-002-UC', 'UPGRADE', handleHiruzen002Upgrade);
}
