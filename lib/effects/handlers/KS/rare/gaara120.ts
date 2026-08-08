import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import type { CharacterInPlay } from '@/lib/engine/types';
import { logAction } from '@/lib/engine/utils/gameLog';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { amplifiedPowerup } from '@/lib/effects/ContinuousEffects';



function gaara120MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  
  let hasAnyTarget = false;
  for (const mission of state.activeMissions) {
    if (mission[enemySide].some((c) => getEffectivePower(state, c, opponentPlayer) <= 1)) {
      hasAnyTarget = true;
      break;
    }
  }

  if (!hasAnyTarget) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Gaara (120): No enemy characters with Power 1 or less found in any mission.',
          'game.log.effect.noTarget',
          { card: 'GAARA', id: 'KS-120-R' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'GAARA120_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ isUpgrade: ctx.isUpgrade }),
    descriptionKey: 'game.effect.desc.gaara120ConfirmMain',
  };
}


function applyGaaraUpgradePowerup(
  state: import('@/lib/engine/types').GameState,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
  sourceInstanceId: string,
  sourceMissionIndex: number,
  defeatedCount: number,
): import('@/lib/engine/types').GameState {
  const missions = [...state.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = [...mission[friendlySide]];
  const selfIndex = friendlyChars.findIndex((c) => c.instanceId === sourceInstanceId);

  if (selfIndex !== -1) {
    friendlyChars[selfIndex] = {
      ...friendlyChars[selfIndex],
      powerTokens: friendlyChars[selfIndex].powerTokens + amplifiedPowerup(state, friendlyChars[selfIndex].instanceId, defeatedCount),
    };
    mission[friendlySide] = friendlyChars;
    missions[sourceMissionIndex] = mission;

    return {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_POWERUP',
        `Gaara (120): POWERUP ${defeatedCount} (upgrade, X = characters defeated by MAIN).`,
        'game.log.effect.powerupSelf',
        { card: 'GAARA', id: 'KS-120-R', amount: defeatedCount },
      ),
    };
  }
  return state;
}

function gaara120UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerGaara120Handlers(): void {
  registerEffect('KS-120-R', 'MAIN', gaara120MainHandler);
  registerEffect('KS-120-R', 'UPGRADE', gaara120UpgradeHandler);
  registerEffect('KS-120-MV', 'MAIN', gaara120MainHandler);
  registerEffect('KS-120-MV', 'UPGRADE', gaara120UpgradeHandler);
}
