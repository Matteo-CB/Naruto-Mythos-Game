import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { canBeHiddenByEnemy } from '@/lib/effects/ContinuousEffects';
import { enemyOf, sideKey, topOf } from './sandMove';

export const ITACHI_053_ID = 'SS-053-C';
export const ITACHI_053_NAME = 'ITACHI UCHIWA';
export const ITACHI_053_MAX_COST = 2;

export function itachi053HideTargets(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): string[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];

  const targets: string[] = [];
  const opponent = enemyOf(player);

  for (const char of mission[sideKey(player)] as CharacterInPlay[]) {
    if (char.isHidden) continue;
    if ((topOf(char).chakra ?? 0) > ITACHI_053_MAX_COST) continue;
    targets.push(char.instanceId);
  }

  for (const char of mission[sideKey(opponent)] as CharacterInPlay[]) {
    if (char.isHidden) continue;
    if ((topOf(char).chakra ?? 0) > ITACHI_053_MAX_COST) continue;
    if (!canBeHiddenByEnemy(state, char, char.controlledBy)) continue;
    targets.push(char.instanceId);
  }

  return targets;
}

function itachi053FirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const validTargets = itachi053HideTargets(state, sourcePlayer, sourceMissionIndex);

  if (validTargets.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Itachi Uchiha (SS-053) FIRST STRIKE: no character with cost 2 or less to hide here.',
          'game.log.effect.noTarget', { card: ITACHI_053_NAME, id: ITACHI_053_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS053_FS_HIDE',
    validTargets,
    isOptional: false,
    isMandatory: true,
    minSelections: 1,
    maxSelections: 1,
    description: 'Itachi Uchiha (SS-053) FIRST STRIKE: hide a character with cost 2 or less in this mission.',
    descriptionKey: 'game.effect.desc.ss053FirstStrikeHide',
  };
}

export function registerItachi053Handlers(): void {
  registerEffect(ITACHI_053_ID, 'FIRST_STRIKE', itachi053FirstStrike);
}
