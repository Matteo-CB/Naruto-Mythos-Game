import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function tsunade104MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playerState = state[sourcePlayer];
  const maxChakra = playerState.chakra;

  if (maxChakra <= 0) {
    
    const newState = { ...state };
    (newState as any)._tsunade104ChakraSpent = 0;
    return {
      state: {
        ...newState,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT',
          'Tsunade (104): No extra chakra to spend.',
          'game.log.effect.tsunade104Decline',
          { card: 'TSUNADE', id: 'KS-104-R' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TSUNADE104_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: `Tsunade (104) MAIN: Spend extra chakra for POWERUP X (max ${maxChakra}).`,
    descriptionKey: 'game.effect.desc.tsunade104ConfirmMain',
  };
}

function tsunade104UpgradeHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const mainSpent = (state as any)._tsunade104ChakraSpent ?? 0;

  if (mainSpent <= 0) {
    
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT',
          'Tsunade (104) UPGRADE: No chakra was spent on MAIN, POWERUP 0.',
          'game.log.effect.tsunade104Decline',
          { card: 'TSUNADE', id: 'KS-104-R' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TSUNADE104_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: false,
    description: `Tsunade (104) UPGRADE: POWERUP ${mainSpent} (matching MAIN).`,
    descriptionKey: 'game.effect.desc.tsunade104ConfirmUpgrade',
  };
}

export function registerTsunade104Handlers(): void {
  registerEffect('KS-104-R', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104-R', 'UPGRADE', tsunade104UpgradeHandler);
  registerEffect('KS-104-MV', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104-MV', 'UPGRADE', tsunade104UpgradeHandler);
  registerEffect('KS-104_2-MV', 'MAIN', tsunade104MainHandler);
  registerEffect('KS-104_2-MV', 'UPGRADE', tsunade104UpgradeHandler);
}
