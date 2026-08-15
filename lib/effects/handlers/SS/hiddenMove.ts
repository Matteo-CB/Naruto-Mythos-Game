import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { moveWouldViolateNameUniqueness, sideFor } from '@/lib/effects/moveNameUniqueness';
import { confirmFirst } from './confirmFirst';

export const HAYATE_025 = 'SS-025-C';

export function destinationsPour(
  state: GameState,
  char: CharacterInPlay,
  player: PlayerID,
  missionIndex: number,
): number[] {
  const destinations: number[] = [];
  for (let i = 0; i < state.activeMissions.length; i++) {
    if (i === missionIndex) continue;
    if (moveWouldViolateNameUniqueness(state, char, i, sideFor(player))) continue;
    destinations.push(i);
  }
  return destinations;
}

export function cachesDeplacables(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return mission[sideFor(player)].filter((c) =>
    c.isHidden && destinationsPour(state, c, player, missionIndex).length > 0);
}

function hayate025(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const candidats = cachesDeplacables(state, sourcePlayer, sourceMissionIndex);
  if (candidats.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Hayate Gekko (025): no friendly hidden character can leave this mission.',
          'game.log.effect.noTarget', { card: 'HAYATE GEKKO', id: HAYATE_025 }),
      },
    };
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS025_MOVE_HIDDEN',
    validTargets: candidats.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss025MoveHidden',
  }, sourceCard.instanceId, 'SS025_CONFIRM_MAIN');
}

export function registerHiddenMoveHandlers(): void {
  registerEffect(HAYATE_025, 'MAIN', hayate025);
}
