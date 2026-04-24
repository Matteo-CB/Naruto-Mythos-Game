import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';



function temari121MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    
    
    for (const char of mission[friendlySide]) {
      if (char.instanceId !== sourceCard.instanceId) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Temari (121) MAIN: No friendly characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'TEMARI', id: 'KS-121-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TEMARI121_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Temari (121) MAIN: Move a friendly character in play to another mission?',
    descriptionKey: 'game.effect.desc.temari121ConfirmMain',
  };
}

function temari121UpgradeHandler(ctx: EffectContext): EffectResult {
  
  const { state, sourcePlayer, sourceCard } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const validTargets: string[] = [];

  for (const mission of state.activeMissions) {
    
    for (const char of mission[friendlySide]) {
      validTargets.push(char.instanceId);
    }
    
    for (const char of mission[enemySide]) {
      validTargets.push(char.instanceId);
    }
  }

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Temari (121) UPGRADE: No characters in play to move.',
          'game.log.effect.noTarget',
          { card: 'TEMARI', id: 'KS-121-R' },
        ),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TEMARI121_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: 'Temari (121) UPGRADE: Move any character in play to another mission?',
    descriptionKey: 'game.effect.desc.temari121ConfirmUpgrade',
  };
}

export function registerTemari121Handlers(): void {
  registerEffect('KS-121-R', 'MAIN', temari121MainHandler);
  registerEffect('KS-121-R', 'UPGRADE', temari121UpgradeHandler);
}
