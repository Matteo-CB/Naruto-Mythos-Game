import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { isDuelConditionMet } from '@/lib/effects/duelUtils';
import { sideKey, enemyOf } from './sandMove';
import { confirmFirst } from './confirmFirst';

export const OROCHIMARU_127_ID = 'SS-127-R';
export const OROCHIMARU_127_NAME = 'OROCHIMARU';
export const OROCHIMARU_127_DUEL = 'DUEL Sasuke Uchiha';

export function prixDuControle(state: GameState, cible: CharacterInPlay): number {
  return Math.max(0, getEffectivePower(state, cible, cible.controlledBy));
}

export function affordableEnemiesIn(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const chakra = state[player].chakra;
  return mission[sideKey(enemyOf(player))].filter((c) => {
    if (c.isHidden) return false;
    return prixDuControle(state, c) <= chakra;
  });
}

export function orochimaru127MainAllowed(state: GameState, missionIndex: number): boolean {
  return isDuelConditionMet(state, missionIndex, OROCHIMARU_127_DUEL);
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: OROCHIMARU_127_NAME, id: OROCHIMARU_127_ID }),
    },
  };
}

function takeControlPaying(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const mission = state.activeMissions[sourceMissionIndex];
  const visibles = mission
    ? mission[sideKey(enemyOf(sourcePlayer))].filter((c) => !c.isHidden)
    : [];
  if (visibles.length === 0) {
    return refuse(state, sourcePlayer, 'Orochimaru (127): no non-hidden enemy character in this mission.');
  }

  const abordables = affordableEnemiesIn(state, sourcePlayer, sourceMissionIndex);
  if (abordables.length === 0) {
    return refuse(state, sourcePlayer, 'Orochimaru (127): not enough Chakra to take control of any enemy character here.');
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS127_TAKE_CONTROL',
    validTargets: abordables.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss127TakeControl',
  }, sourceCard.instanceId, 'SS127_CONFIRM');
}

function orochimaru127Ambush(ctx: EffectContext): EffectResult {
  return takeControlPaying(ctx);
}

function orochimaru127Duel(ctx: EffectContext): EffectResult {
  const { state, sourceMissionIndex, wasRevealed } = ctx;
  if (wasRevealed) return { state };
  if (!orochimaru127MainAllowed(state, sourceMissionIndex)) return { state };
  return takeControlPaying(ctx);
}

export const OROCHIMARU_127_VARIANTS = ['SS-127-R', 'SS-127-MV', 'SS-127_2-MV'];

export function registerOrochimaru127Handlers(): void {
  for (const id of OROCHIMARU_127_VARIANTS) {
    registerEffect(id, 'AMBUSH', orochimaru127Ambush);
    registerEffect(id, 'DUEL', orochimaru127Duel);
  }
}
