import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { sideKey, enemyOf } from './sandMove';
import { confirmFirst } from './confirmFirst';

export const UKON_038_ID = 'SS-038-UC';
export const UKON_038_NAME = 'UKON';
export const UKON_038_MALUS = -5;

export function ukon038Hosts(state: GameState, player: PlayerID, missionIndex: number): string[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return mission[sideKey(enemyOf(player))]
    .filter((c) => !c.isHidden)
    .map((c) => c.instanceId);
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: UKON_038_NAME, id: UKON_038_ID }),
    },
  };
}

function ukon038Ambush(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const hotes = ukon038Hosts(state, sourcePlayer, sourceMissionIndex);
  if (hotes.length === 0) {
    return refuse(state, sourcePlayer, 'Ukon (038) AMBUSH: no non-hidden enemy character in this mission.');
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS038_ATTACH',
    validTargets: hotes,
    isOptional: true,
    description: JSON.stringify({ ukonInstanceId: sourceCard.instanceId }),
    descriptionKey: 'game.effect.desc.ss038Attach',
  }, sourceCard.instanceId, 'SS038_CONFIRM_AMBUSH');
}

export function registerUkon038Handlers(): void {
  registerEffect(UKON_038_ID, 'AMBUSH', ukon038Ambush);
}
