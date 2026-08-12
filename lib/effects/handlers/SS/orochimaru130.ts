import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { isDuelConditionMet } from '@/lib/effects/duelUtils';
import { characterHasGroup } from '@/lib/effects/groupUtils';
import { sideKey, enemyOf } from './sandMove';

export const OROCHIMARU_130_ID = 'SS-130-R';
export const OROCHIMARU_130_NAME = 'OROCHIMARU';
export const OROCHIMARU_130_DUEL = 'DUEL Hiruzen Sarutobi';

export function leafEnemiesIn(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  includeHidden: boolean,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return mission[sideKey(enemyOf(player))].filter((c) => {
    if (c.isHidden) return false;
    if (!includeHidden && c.isHidden) return false;
    return characterHasGroup(c, 'Leaf Village');
  });
}

export function orochimaru130Defeats(state: GameState, missionIndex: number): boolean {
  return isDuelConditionMet(state, missionIndex, OROCHIMARU_130_DUEL);
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: OROCHIMARU_130_NAME, id: OROCHIMARU_130_ID }),
    },
  };
}

function orochimaru130FirstStrike(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const cibles = leafEnemiesIn(state, sourcePlayer, sourceMissionIndex, false);
  if (cibles.length === 0) {
    return refuse(state, sourcePlayer, 'Orochimaru (130) FIRST STRIKE: no enemy Leaf Village character in this mission.');
  }

  const peutVaincre = orochimaru130Defeats(state, sourceMissionIndex);

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: peutVaincre ? 'SS130_CONFIRM_DUEL_MODIFIER' : 'SS130_CONFIRM_FIRST_STRIKE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ targets: cibles.map((c) => c.instanceId) }),
    descriptionKey: peutVaincre ? 'game.effect.desc.ss130ConfirmDuel' : 'game.effect.desc.ss130ConfirmHide',
  };
}

export function registerOrochimaru130Handlers(): void {
  registerEffect(OROCHIMARU_130_ID, 'FIRST_STRIKE', orochimaru130FirstStrike);
}
