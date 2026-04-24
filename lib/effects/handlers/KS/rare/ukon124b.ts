import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import type { CharacterInPlay } from '@/lib/engine/types';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';



export function ukon124bMainHandler(ctx: EffectContext): EffectResult {
  
  
  return { state: ctx.state };
}

export function ukon124bAmbushHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const opponentPlayer = sourcePlayer === 'player1' ? 'player2' : 'player1';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const mission = state.activeMissions[sourceMissionIndex];
  const enemyChars = mission[enemySide];

  
  const validTargets: string[] = enemyChars
    .filter((c: CharacterInPlay) => canBeHiddenByEnemy(state, c, opponentPlayer) && getEffectivePower(state, c, opponentPlayer) <= 5)
    .map((c: CharacterInPlay) => c.instanceId);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Ukon (124b) AMBUSH: No enemy with Power 5 or less in this mission.',
          'game.log.effect.noTarget',
          { card: 'UKON', id: 'KS-124b-R' },
        ),
      },
    };
  }

  
  if (validTargets.length === 1) {
    return applyHide(state, validTargets[0], sourcePlayer, enemySide, sourceMissionIndex);
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'UKON124B_HIDE_TARGET',
    validTargets,
    description: 'Ukon (124b) AMBUSH: Choose an enemy character with Power 5 or less to hide.',
    descriptionKey: 'game.effect.desc.ukon124bHide',
  };
}

function applyHide(
  state: EffectContext['state'],
  targetInstanceId: string,
  sourcePlayer: EffectContext['sourcePlayer'],
  _enemySide: 'player1Characters' | 'player2Characters',
  _missionIndex: number,
): EffectResult {
  
  const newState = EffectEngine.hideCharacterWithLog(state, targetInstanceId, sourcePlayer);
  return { state: newState };
}

export function registerUkon124bHandlers(): void {
  registerEffect('KS-124b-R', 'MAIN', ukon124bMainHandler);
  registerEffect('KS-124b-R', 'AMBUSH', ukon124bAmbushHandler);
}
