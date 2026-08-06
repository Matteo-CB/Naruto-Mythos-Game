import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isImmuneToEnemyHideOrDefeat } from '@/lib/effects/ContinuousEffects';
import { confirmFirst } from './confirmFirst';
import { enemyOf, sideKey, topOf } from './sandMove';

export const KYUBI_006_ID = 'SS-006-UC';
export const KYUBI_006_NAME = 'KYÛBI';

export function kyubi006Targets(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): string[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];

  return (mission[sideKey(enemyOf(player))] as CharacterInPlay[])
    .filter((char) => !isImmuneToEnemyHideOrDefeat(char))
    .map((char) => char.instanceId);
}

export function costOfDefeated(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  return topOf(char).chakra ?? 0;
}

function kyubi006Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex, sourceCard } = ctx;
  const validTargets = kyubi006Targets(state, sourcePlayer, sourceMissionIndex);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Nine-Tailed Fox (SS-006) AMBUSH: no enemy character in this mission.',
          'game.log.effect.noTarget', { card: KYUBI_006_NAME, id: KYUBI_006_ID }),
      },
    };
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS006_DEFEAT',
    validTargets,
    isOptional: true,
    description: 'Nine-Tailed Fox (SS-006) AMBUSH: defeat an enemy character in this mission.',
    descriptionKey: 'game.effect.desc.ss006Defeat',
  }, sourceCard.instanceId, 'SS006_CONFIRM_AMBUSH');
}

export function registerKyubi006Handlers(): void {
  registerEffect(KYUBI_006_ID, 'AMBUSH', kyubi006Ambush);
}
