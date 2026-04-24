import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';



function ino110MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const enemies = mission[enemySide];

  
  if (enemies.length < 2) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Ino Yamanaka (110) MAIN: Fewer than 2 enemy characters in this mission.`,
          'game.log.effect.noTarget',
          { card: 'INO YAMANAKA', id: 'KS-110-R' },
        ),
      },
    };
  }

  
  if (state.activeMissions.length <= 1) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Ino Yamanaka (110) MAIN: Only one mission in play, cannot move characters.`,
          'game.log.effect.noTarget',
          { card: 'INO YAMANAKA', id: 'KS-110-R' },
        ),
      },
    };
  }

  
  const nonHiddenEnemies = enemies.filter((c) => !c.isHidden);
  if (nonHiddenEnemies.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          `Ino Yamanaka (110) MAIN: No non-hidden enemy characters in this mission.`,
          'game.log.effect.noTarget',
          { card: 'INO YAMANAKA', id: 'KS-110-R' },
        ),
      },
    };
  }

  
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'INO110_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex }),
    descriptionKey: 'game.effect.desc.ino110ConfirmMain',
  };
}

function ino110UpgradeHandler(ctx: EffectContext): EffectResult {
  
  return { state: ctx.state };
}

export function registerIno110Handlers(): void {
  registerEffect('KS-110-R', 'MAIN', ino110MainHandler);
  registerEffect('KS-110-R', 'UPGRADE', ino110UpgradeHandler);
}
