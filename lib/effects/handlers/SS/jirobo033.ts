import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { sideKey, topOf } from './sandMove';

export const JIROBO_033_ID = 'SS-033-UC';
export const JIROBO_033_NAME = 'JIRÔBÔ';
export const JIROBO_033_POWERUP = 2;
export const SOUND_FOUR_KEYWORD = 'Sound Four';

export function friendlySoundFourCount(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  sourceInstanceId: string,
): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;

  return (mission[sideKey(player)] as CharacterInPlay[]).filter((char) => {
    if (char.instanceId === sourceInstanceId) return false;
    if (char.isHidden) return false;
    if (char.controlledBy !== player) return false;
    return (topOf(char).keywords ?? []).includes(SOUND_FOUR_KEYWORD);
  }).length;
}

function jirobo033Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const count = friendlySoundFourCount(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId);

  if (count === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Jirobo (SS-033) UPGRADE: no other friendly Sound Four character in this mission.',
          'game.log.effect.noTarget', { card: JIROBO_033_NAME, id: JIROBO_033_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS033_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ amount: count * JIROBO_033_POWERUP }),
    descriptionKey: 'game.effect.desc.ss033ConfirmUpgrade',
    descriptionParams: { amount: count * JIROBO_033_POWERUP },
  };
}

export function registerJirobo033Handlers(): void {
  registerEffect(JIROBO_033_ID, 'UPGRADE', jirobo033Upgrade);
}
